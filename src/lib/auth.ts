import "server-only";
import { cookies } from "next/headers";
import { after } from "next/server";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "@/lib/db";
import type { User } from "@prisma/client";

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

export async function createSession(userId: string) {
  const token = await new SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecret());

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

async function getUserIdFromSession(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return typeof payload.userId === "string" ? payload.userId : null;
  } catch {
    return null;
  }
}

export async function getCurrentUser(): Promise<User | null> {
  const userId = await getUserIdFromSession();
  if (!userId) return null;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (user) touchLastActive(user);
  return user;
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}
