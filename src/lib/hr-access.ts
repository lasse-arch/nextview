import "server-only";
import { prisma } from "@/lib/db";
import { getTeamUser } from "@/lib/auth";
import { teamCan } from "@/lib/team-roles";

/*
 * Who may see and do what in HR - checked on the server for every page and action:
 *  - an admin: everything, also the pay (each look at someone's pay is logged);
 *  - a leader: their team's hours and absence, and approving them - never their pay;
 *  - everybody: their own (hours, absence, holiday, employment and their own pay).
 * Nobody approves their own week or absence, except an admin (nobody is above them).
 */

/** The logged-in team member as auth gives it. */
export type Viewer = NonNullable<Awaited<ReturnType<typeof getTeamUser>>>;
type User = Viewer;

export const isHrAdmin = (u: Pick<User, "role" | "extraRoles">) => teamCan(u, "admin");

/** The logged-in team member (any role) - HR's "Mig" is for everybody. */
export async function hrViewer(): Promise<User> {
  const user = await getTeamUser();
  if (!user || !teamCan(user, "self")) throw new Error("Unauthorized");
  return user;
}

export async function requireHrAdmin(): Promise<User> {
  const user = await hrViewer();
  if (!isHrAdmin(user)) throw new Error("Kun admin har adgang til HR.");
  return user;
}

export type Reach = "admin" | "leader" | "self";

/** How the viewer reaches this employee - null: not at all. */
export function reachOf(viewer: Pick<User, "id" | "role" | "extraRoles">, e: { userId: string; managerId: string | null }): Reach | null {
  if (isHrAdmin(viewer)) return "admin";
  if (e.managerId === viewer.id) return "leader";
  if (e.userId === viewer.id) return "self";
  return null;
}

/** The employee, if the viewer may see them (`need`: also approve = admin or their leader). */
export async function employeeFor(viewer: User, employeeId: string, need: "see" | "approve" = "see") {
  const e = await prisma.employee.findUnique({ where: { id: String(employeeId) }, include: { user: { select: { id: true, name: true, lastName: true, email: true, role: true, extraRoles: true, avatarUrl: true, disabledAt: true } } } });
  const reach = e ? reachOf(viewer, e) : null;
  if (!e || !reach) throw new Error("Medarbejderen findes ikke.");
  if (need === "approve" && reach === "self") throw new Error("Du kan ikke godkende dit eget.");
  return { e, reach };
}

/** The pay may be seen by an admin and by the person themselves - an admin's look at someone else's is logged (GDPR). */
export async function maySeePay(viewer: User, e: { id: string; userId: string }, reach: Reach): Promise<boolean> {
  if (e.userId === viewer.id) return true;
  if (reach !== "admin") return false;
  await prisma.hrAccessLog.create({ data: { viewerId: viewer.id, employeeId: e.id, what: "løn" } }).catch(() => null);
  return true;
}
