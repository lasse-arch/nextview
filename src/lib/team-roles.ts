import type { Role } from "@prisma/client";

/*
 * What each team member may do in Arpo. Closed by default: everything that
 * was there before roles (deals, customers, calendar, numbers, settings)
 * needs "sales" - getCurrentUser() returns null for anyone without it, so a
 * page or action nobody has looked at stays shut to filmers and developers.
 * What they may use is opened on purpose with getTeamUser()/requireTeam().
 */

export type TeamPerm =
  /** Everything a seller had before roles: deals, leads, customers, calendar, tasks, mails. */
  | "sales"
  /** Business numbers: revenue, commission, prices, invoices (Stats and Fakturaer also need canAccessBilling). */
  | "numbers"
  /** Tours: the editor, nextviewAI, people in scans, feedback - and the customer portal as the customer sees it, without the contract. Admins: every tour; developers: the ones given to them (requireTour). */
  | "tours"
  /** Putting a tour (a new version) live on tour.nextview360.dk. Setting the customer Live - which starts billing - needs "numbers" too. */
  | "tourPublish"
  /** The filmings one is on the crew of: when, where and who to meet. */
  | "filming"
  /** Users, roles and the company's settings. */
  | "admin";

const PERMS: Record<Role, TeamPerm[]> = {
  ADMIN: ["sales", "numbers", "tours", "tourPublish", "filming", "admin"],
  SALES: ["sales", "numbers"],
  DEVELOPER: ["tours", "tourPublish"],
  FILMER: ["filming"],
};

export const TEAM_ROLES: Role[] = ["ADMIN", "SALES", "FILMER", "DEVELOPER"];
export const TEAM_ROLE_NAMES: Record<Role, string> = { ADMIN: "Admin", SALES: "Sælger", FILMER: "Filmer", DEVELOPER: "Udvikler" };
/** What the role gets - and doesn't - in words, on the Brugere page. */
export const TEAM_ROLE_SCOPE: Record<Role, string> = {
  ADMIN: "Alt - også brugere og indstillinger.",
  SALES: "Deals, kunder, kalender, opgaver og tal. Ikke tours.",
  DEVELOPER: "De tours, der er givet til dem (også udgive dem), og de kunders portal, som kunden ser den. Ingen tal, priser eller kontrakter.",
  FILMER: "Egne filmninger: hvornår, hvor og hvem man skal møde. Ingen tal, priser eller kontrakter.",
};

type Member = { role: Role; extraRoles?: Role[] | null };

/** All of a member's roles (ADMIN only ever counts as the main role). */
export const rolesOf = (u: Member): Role[] => [u.role, ...(u.extraRoles ?? []).filter((r) => r !== "ADMIN" && r !== u.role)];

export function teamCan(u: Member | null | undefined, perm: TeamPerm): boolean {
  return Boolean(u && rolesOf(u).some((r) => PERMS[r].includes(perm)));
}

/** May do at least one of `perms`. */
export const teamCanAny = (u: Member | null | undefined, ...perms: TeamPerm[]) => perms.some((p) => teamCan(u, p));

/** Where a member lands in Arpo: the dashboard for sellers, otherwise their own part. */
export function homeOf(u: Member): string {
  if (teamCan(u, "sales")) return "/arpo";
  if (teamCan(u, "tours")) return "/arpo/tour-lab";
  if (teamCan(u, "filming")) return "/arpo/filmninger";
  return "/arpo/ingen-adgang";
}

/*
 * Which /arpo pages a member may open - checked in the proxy for every request
 * (also the in-app navigations a layout never sees), so a page that forgets to
 * check itself is still shut. Sales access = everything, as before roles;
 * otherwise only the parts their roles open.
 */
const PATHS: [TeamPerm, string[]][] = [
  ["tours", ["/arpo/tour-lab"]],
  ["filming", ["/arpo/filmninger"]],
];
const under = (path: string, base: string) => path === base || path.startsWith(`${base}/`);
export function arpoPathAllowed(u: Member, pathname: string): boolean {
  if (!under(pathname, "/arpo")) return true;
  if (teamCan(u, "sales")) return true;
  if (under(pathname, "/arpo/ingen-adgang")) return true;
  return PATHS.some(([perm, bases]) => teamCan(u, perm) && bases.some((b) => under(pathname, b)));
}
