import "server-only";
import { cookies } from "next/headers";
import { after } from "next/server";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "@/lib/db";
import type { User } from "@prisma/client";
import { isGoogleLoginRequired } from "@/lib/google-login";

/** Only bother writing lastActiveAt if it's this stale - getCurrentUser runs
 * on almost every request, so without throttling this would mean a write on
 * every single page load/action instead of roughly once per active session. */
const ACTIVE_TOUCH_THROTTLE_MS = 5 * 60 * 1000;

function touchLastActive(user: User): void {
  if (user.lastActiveAt && Date.now() - user.lastActiveAt.getTime() < ACTIVE_TOUCH_THROTTLE_MS) return;
  after(() =>
    prisma.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } }).catch((err) => {
      console.error("Kunne ikke opdatere lastActiveAt", err);
    })
  );
}

const SESSION_COOKIE = "nv360_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(secret);
}

/** How the session was started - with "Kræv Google-login" on, password
 * sessions stop working (see getCurrentUser). */
export type LoginMethod = "password" | "google";

/** The team (Arpo) or a customer (their own page, /kunde) - never both: a
 * customer's session doesn't open Arpo, and the team's doesn't open /kunde. */
type Session = { kind: "staff"; userId: string; method: LoginMethod } | { kind: "customer"; customerId: string };

async function setSessionCookie(payload: Record<string, string>) {
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecret());

  const cookieStore = await cookies();
  // No "domain": the cookie belongs to this exact address only - it's never
  // sent to tour.nextview360.dk, explore.nextview360.dk or any other subdomain.
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function createSession(userId: string, method: LoginMethod) {
  await setSessionCookie({ userId, method });
}

/** A customer logged in with the link from their e-mail. */
export async function createCustomerSession(customerId: string) {
  await setSessionCookie({ customerId, method: "link" });
}

export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

async function getSessionFromCookie(): Promise<Session | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (typeof payload.customerId === "string") return { kind: "customer", customerId: payload.customerId };
    if (typeof payload.userId !== "string") return null;
    // Sessions from before login methods were recorded were all password ones.
    return { kind: "staff", userId: payload.userId, method: payload.method === "google" ? "google" : "password" };
  } catch {
    return null;
  }
}

/** The logged-in team member (admin or seller) - null for customers, who only ever get getCurrentCustomer. */
export async function getCurrentUser(): Promise<User | null> {
  const session = await getSessionFromCookie();
  if (session?.kind !== "staff") return null;
  // With "Kræv Google-login" on, a password session (even one started
  // before it was turned on) no longer counts - log in again with Google.
  if (session.method === "password" && (await isGoogleLoginRequired())) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (user) touchLastActive(user);
  return user;
}

/** The logged-in customer, with the deals they may see - null for everyone else. */
export async function getCurrentCustomer() {
  const session = await getSessionFromCookie();
  if (session?.kind !== "customer") return null;
  return prisma.customerAccount.findUnique({ where: { id: session.customerId }, include: { deals: { select: { dealId: true } } } });
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}

/** Where to go after logging in - only a path on this site ("//evil.com"
 * and "/\\evil.com" are other sites to a browser). */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next;
}
