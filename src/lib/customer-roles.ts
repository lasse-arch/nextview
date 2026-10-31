import type { CustomerRole } from "@prisma/client";

/*
 * What each login may do on the customer page (/kunde), per deal. Checked on
 * the server - the page only shows what a role may use, and every action and
 * route asks `can()` again. Access given in Arpo is OWNER (as before roles).
 */

export type CustomerPerm =
  /** Tours, numbers and the report on mail. */
  | "stats"
  /** The codes for their website, placement, share links - and opening the tour (preview). */
  | "embed"
  /** "Rettelser": writing changes in the tour. */
  | "review"
  /** Approving the tour. */
  | "approve"
  /** The contract. */
  | "contract"
  /** Inviting and removing users. */
  | "users";

export type DealAccess = { dealId: string; role: CustomerRole; canApprove: boolean };

const PERMS: Record<CustomerRole, CustomerPerm[]> = {
  OWNER: ["stats", "embed", "review", "approve", "contract", "users"],
  STAFF: ["stats", "embed", "review"],
  DEVELOPER: ["embed"],
  VIEWER: ["stats"],
};

export const ROLES: CustomerRole[] = ["OWNER", "STAFF", "DEVELOPER", "VIEWER"];
/** Higher number = more access; nobody can give more than they have. */
export const ROLE_RANK: Record<CustomerRole, number> = { OWNER: 3, STAFF: 2, DEVELOPER: 1, VIEWER: 1 };

export function roleCan(a: Pick<DealAccess, "role" | "canApprove">, perm: CustomerPerm): boolean {
  if (perm === "approve" && a.role === "STAFF") return a.canApprove;
  return PERMS[a.role].includes(perm);
}

/** May this login do `perm` on this deal? (false for a deal they have no access to, or whose access has run out - getCurrentCustomer leaves those out.) */
export function can(customer: { deals: DealAccess[] } | null | undefined, dealId: string | null | undefined, perm: CustomerPerm): boolean {
  if (!customer || !dealId) return false;
  const a = customer.deals.find((d) => d.dealId === dealId);
  return Boolean(a && roleCan(a, perm));
}

/** The deals this login may do `perm` on. */
export const dealsWith = (customer: { deals: DealAccess[] }, perm: CustomerPerm) => customer.deals.filter((d) => roleCan(d, perm)).map((d) => d.dealId);

export const ROLE_NAMES: Record<"da" | "en", Record<CustomerRole, string>> = {
  da: { OWNER: "Ejer", STAFF: "Medarbejder", DEVELOPER: "Udvikler", VIEWER: "Kun tal" },
  en: { OWNER: "Owner", STAFF: "Staff", DEVELOPER: "Developer", VIEWER: "Numbers only" },
};

/** What the role gets - and doesn't - in words: the note before an invite, the invite mail and the user list. */
export function roleScope(role: CustomerRole, canApprove: boolean, lang: "da" | "en" = "da"): { gets: string[]; not: string[] } {
  const da = {
    stats: "jeres tours og statistik",
    embed: "koden til jeres hjemmeside, placeringen og en forhåndsvisning af touren",
    review: "rettelser til touren",
    approve: "godkendelse af ændringer i touren",
    contract: "kontrakten",
    users: "brugerne (invitere og fjerne)",
  };
  const en = {
    stats: "your tours and statistics",
    embed: "the code for your website, the placement and a preview of the tour",
    review: "changes to the tour",
    approve: "approving changes to the tour",
    contract: "the contract",
    users: "the users (invite and remove)",
  };
  const words = lang === "en" ? en : da;
  const all: CustomerPerm[] = ["stats", "embed", "review", "approve", "contract", "users"];
  const ok = (p: CustomerPerm) => roleCan({ role, canApprove }, p);
  return { gets: all.filter(ok).map((p) => words[p]), not: all.filter((p) => !ok(p)).map((p) => words[p]) };
}
