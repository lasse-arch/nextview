import "server-only";
import { teamCan, type TeamPerm } from "@/lib/team-roles";
import { cookies } from "next/headers";
import { after } from "next/server";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "@/lib/db";
import type { User as UserRow } from "@prisma/client";
/** A team member as the app sees them - never with the password hash (see db.ts). */
export type User = Omit<UserRow, "passwordHash">;
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
type Session = { kind: "staff"; userId: string; method: LoginMethod; sv: number } | { kind: "customer"; customerId: string };

async function setSessionCookie(payload: Record<string, string | number>) {
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

/** A team member's session - it carries their sessionVersion, so bumping it (new password, deactivation, "Log ud overalt") ends it. */
export async function createSession(userId: string, method: LoginMethod) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { sessionVersion: true, disabledAt: true } });
  if (!user || user.disabledAt) throw new Error("Brugeren er deaktiveret.");
  await setSessionCookie({ userId, method, sv: user.sessionVersion });
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
    return { kind: "staff", userId: payload.userId, method: payload.method === "google" ? "google" : "password", sv: typeof payload.sv === "number" ? payload.sv : 0 };
  } catch {
    return null;
  }
}

/**
 * The logged-in team member with sales access (admin or seller) - null for
 * customers, and for filmers and developers: everything that uses this stays
 * shut to them unless it asks getTeamUser()/requireTeam() on purpose
 * (src/lib/team-roles.ts).
 */
export async function getCurrentUser(): Promise<User | null> {
  const user = await getTeamUser();
  return user && teamCan(user, "sales") ? user : null;
}

/** Any logged-in team member, whatever their role - only for what is meant for them all (check teamCan before showing anything). */
export async function getTeamUser(): Promise<User | null> {
  const session = await getSessionFromCookie();
  if (session?.kind !== "staff") return null;
  // With "Kræv Google-login" on, a password session (even one started
  // before it was turned on) no longer counts - log in again with Google.
  if (session.method === "password" && (await isGoogleLoginRequired())) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  // Deactivated, or the session is older than the last "end all sessions" - no longer a session.
  if (!user || user.disabledAt || user.sessionVersion !== session.sv) return null;
  touchLastActive(user);
  return user;
}

/** The logged-in customer, with the deals they may see - null for everyone else. */
export async function getCurrentCustomer() {
  const session = await getSessionFromCookie();
  if (session?.kind !== "customer") return null;
  // Only access that hasn't run out (a developer's 30 days) - with the role, so every check can ask can() (src/lib/customer-roles.ts).
  return prisma.customerAccount.findUnique({
    where: { id: session.customerId },
    include: { deals: { where: { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, select: { dealId: true, role: true, canApprove: true } } },
  });
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}

/**
 * May this member work on this tour? Admins: every tour. Developers: only the
 * tours given to them (Tour.assignedToId). Throws otherwise - and for a tour
 * that doesn't exist, the same answer (nothing to learn from trying slugs).
 */
export async function requireTour(slug: string): Promise<User> {
  const user = await requireTeam("tours");
  if (teamCan(user, "admin")) return user;
  const tour = await prisma.tour.findUnique({ where: { slug: String(slug) }, select: { assignedToId: true } });
  if (!tour || tour.assignedToId !== user.id) throw new Error("Du har ikke adgang til den tour.");
  return user;
}

/** Work on a customer's deal from the tour side (filming time): sellers on any deal; developers only on deals with a tour given to them. */
export async function requireDealWork(dealId: string): Promise<User> {
  const user = await getTeamUser();
  if (!user) throw new Error("Unauthorized");
  if (teamCan(user, "sales")) return user;
  if (teamCan(user, "tours") && (await developerHasDeal(user.id, String(dealId)))) return user;
  throw new Error("Du har ikke adgang til den kunde.");
}

/** A developer's customer: one whose tour is given to them - the tour itself, or the customer before the tour exists. */
async function developerHasDeal(userId: string, dealId: string): Promise<boolean> {
  const [tours, deals] = await Promise.all([
    prisma.tour.count({ where: { dealId, assignedToId: userId } }),
    prisma.deal.count({ where: { id: dealId, tourAssigneeId: userId } }),
  ]);
  return tours + deals > 0;
}

/**
 * May this member make a new tour (for this customer)? Admins: any. Developers:
 * only for a customer whose tour is given to them and who has no tour yet -
 * never a tour without a customer, and never a copy of someone else's.
 */
export async function requireNewTour(dealId: string | null | undefined): Promise<User> {
  const user = await requireTeam("tours");
  if (teamCan(user, "admin")) return user;
  if (!dealId || (await prisma.deal.count({ where: { id: String(dealId), tourAssigneeId: user.id, tours: { none: {} } } })) === 0) throw new Error("Du har ikke adgang til at lave en tour for den kunde.");
  return user;
}

/**
 * The team member who may look at this tour (or deal) in a preview - sellers and
 * admins any (as before roles), developers only the tours given to them; null
 * for everyone else. For the preview helpers (pictures, weather, the way there).
 */
export async function teamSeesTour(slug: string | null | undefined, dealId?: string | null): Promise<User | null> {
  const user = await getTeamUser();
  if (!user) return null;
  if (teamCan(user, "sales") || teamCan(user, "admin")) return user;
  if (!teamCan(user, "tours")) return null;
  if (slug) return (await prisma.tour.count({ where: { slug: String(slug), assignedToId: user.id } })) > 0 ? user : null;
  return dealId && (await developerHasDeal(user.id, String(dealId))) ? user : null;
}

/** Which tours a member may see - for lists: all for admins, the given ones for developers. */
export function toursOf(user: User): { assignedToId?: string } {
  return teamCan(user, "admin") ? {} : { assignedToId: user.id };
}

/** A team member who may do any of `perms` - e.g. tour tools used by both sellers and developers. */
export async function requireTeamAny(...perms: TeamPerm[]): Promise<User> {
  const user = await getTeamUser();
  if (!user || !perms.some((p) => teamCan(user, p))) throw new Error("Unauthorized");
  return user;
}

/** A team member who may do `perm` - for the actions opened to filmers and developers. */
export async function requireTeam(perm: TeamPerm): Promise<User> {
  const user = await getTeamUser();
  if (!user || !teamCan(user, perm)) throw new Error("Unauthorized");
  return user;
}

/** Where to go after logging in - only a path on this site ("//evil.com"
 * and "/\\evil.com" are other sites to a browser). */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/")) return "/";
  // Browsers drop tabs and newlines and read "\\" as "/": "/\t/evil.com" would become //evil.com. No control characters, no backslash at all.
  if (/[\u0000-\u001f\u007f\\]/.test(next)) return "/";
  // And it must stay on our own site once a browser has read it.
  const base = "https://arpo.invalid";
  try {
    const u = new URL(next, base);
    if (u.origin !== base) return "/";
    return u.pathname + u.search + u.hash;
  } catch {
    return "/";
  }
}
