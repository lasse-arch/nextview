import "server-only";
import type { CustomerRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { dealName } from "@/lib/labels";
import { logActivity } from "@/lib/activity";
import { normalizeEmail, sendInviteMail } from "@/lib/customer-login";
import { ROLE_NAMES, ROLE_RANK, ROLES, roleCan, roleScope, type DealAccess } from "@/lib/customer-roles";

/*
 * "Brugere" on the customer's page: an owner invites their own people (a
 * developer, a colleague) with a role, and removes them again. Only for the
 * deals the owner has the "users" right on - never anyone else's - and
 * nobody can give more access than they have. Access Nextview gave in Arpo
 * (an owner with no inviter) is ours to take away, not another login's.
 */

/** Logins one customer can have at most, and invites one login can send in an hour. */
export const MAX_USERS = 10;
const MAX_INVITES_HOUR = 10;
/** How long a role's access may run: days, or null = always. */
export const EXPIRY_CHOICES = [7, 30, null] as const;

const live = () => ({ OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] });

export type PortalUser = {
  id: string;
  email: string;
  name: string | null;
  lastLoginAt: Date | null;
  invitedByName: string | null;
  /** Given by Nextview in Arpo (an owner without an inviter) - only we remove it. */
  fromNextview: boolean;
  role: CustomerRole;
  canApprove: boolean;
  expiresAt: Date | null;
  deals: string[];
};

/** Everyone with access to these deals (the ones the owner looks after) - one row per login. */
export async function portalUsers(dealIds: string[]): Promise<{ users: PortalUser[]; mayInvite: boolean; deals: { id: string; name: string }[] }> {
  if (!dealIds.length) return { users: [], mayInvite: false, deals: [] };
  const [links, deals] = await Promise.all([
    prisma.customerAccountDeal.findMany({
      where: { dealId: { in: dealIds }, ...live() },
      orderBy: { createdAt: "asc" },
      include: { account: { select: { id: true, email: true, name: true, lastLoginAt: true, invitedByName: true } } },
    }),
    prisma.deal.findMany({ where: { id: { in: dealIds } }, orderBy: { companyName: "asc" }, select: { id: true, companyName: true, displayName: true, customersMayInvite: true } }),
  ]);
  const byAccount = new Map<string, PortalUser>();
  for (const l of links) {
    const u = byAccount.get(l.accountId);
    if (u) {
      u.deals.push(l.dealId);
      // Shown with their highest role; the list says which locations.
      if (ROLE_RANK[l.role] > ROLE_RANK[u.role]) Object.assign(u, { role: l.role, canApprove: l.canApprove });
      if (u.expiresAt && (!l.expiresAt || l.expiresAt > u.expiresAt)) u.expiresAt = l.expiresAt;
      u.fromNextview ||= l.role === "OWNER" && !l.invitedById;
      continue;
    }
    byAccount.set(l.accountId, {
      ...l.account,
      fromNextview: l.role === "OWNER" && !l.invitedById,
      role: l.role,
      canApprove: l.canApprove,
      expiresAt: l.expiresAt,
      deals: [l.dealId],
    });
  }
  return { users: [...byAccount.values()], mayInvite: deals.some((d) => d.customersMayInvite), deals: deals.map((d) => ({ id: d.id, name: dealName(d) })) };
}

type Actor = { id: string; email: string; name: string | null; deals: DealAccess[] };
type Result = { ok: true; warning?: string } | { ok: false; error: string };

export type InviteInput = { email: string; name: string; role: CustomerRole; dealIds: string[]; expiresDays: number | null; canApprove: boolean };

export async function inviteUser(actor: Actor, input: InviteInput): Promise<Result> {
  const email = normalizeEmail(String(input.email ?? ""));
  const name = String(input.name ?? "").trim().slice(0, 80) || null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return { ok: false, error: "Skriv en gyldig e-mail." };
  if (email === actor.email) return { ok: false, error: "Du har allerede adgang." };
  if (!ROLES.includes(input.role)) return { ok: false, error: "Vælg en rolle." };
  if (!(EXPIRY_CHOICES as readonly (number | null)[]).includes(input.expiresDays)) return { ok: false, error: "Vælg hvor længe adgangen gælder." };
  const dealIds = [...new Set(Array.isArray(input.dealIds) ? input.dealIds.map(String) : [])];
  if (!dealIds.length) return { ok: false, error: "Vælg mindst én afdeling." };
  // Only deals this login looks after - and never more than they have themselves.
  for (const id of dealIds) {
    const mine = actor.deals.find((d) => d.dealId === id);
    if (!mine || !roleCan(mine, "users") || ROLE_RANK[input.role] > ROLE_RANK[mine.role]) return { ok: false, error: "Du kan ikke give adgang til den afdeling." };
  }
  const deals = await prisma.deal.findMany({ where: { id: { in: dealIds } }, select: { id: true, companyName: true, displayName: true, parentDealId: true, customersMayInvite: true } });
  if (deals.length !== dealIds.length || deals.some((d) => !d.customersMayInvite)) return { ok: false, error: "Det er slået fra at invitere her - skriv til os, så hjælper vi." };

  // Limits: logins per customer, invites per hour.
  const family = actor.deals.filter((d) => roleCan(d, "users")).map((d) => d.dealId);
  const current = await prisma.customerAccountDeal.findMany({ where: { dealId: { in: family }, ...live() }, select: { accountId: true } });
  const accounts = new Set(current.map((c) => c.accountId));
  const existing = await prisma.customerAccount.findUnique({ where: { email }, select: { id: true } });
  if (!(existing && accounts.has(existing.id)) && accounts.size >= MAX_USERS) return { ok: false, error: `I kan højst have ${MAX_USERS} brugere. Fjern en, før I inviterer en ny.` };
  const lastHour = await prisma.customerAccountDeal.count({ where: { invitedById: actor.id, createdAt: { gte: new Date(Date.now() - 3600_000) } } });
  if (lastHour >= MAX_INVITES_HOUR) return { ok: false, error: "I har sendt mange invitationer lige nu - prøv igen om en time." };

  if (existing) {
    const has = await prisma.customerAccountDeal.findFirst({ where: { accountId: existing.id, dealId: { in: dealIds }, ...live() }, select: { dealId: true } });
    if (has) return { ok: false, error: "Den e-mail har allerede adgang. Fjern brugeren først, hvis rollen skal ændres." };
  }
  const account = existing
    ? await prisma.customerAccount.findUniqueOrThrow({ where: { id: existing.id }, select: { id: true, email: true, name: true } })
    : await prisma.customerAccount.create({ data: { email, name, invitedByName: actor.name ?? actor.email }, select: { id: true, email: true, name: true } });

  const expiresAt = input.expiresDays ? new Date(Date.now() + input.expiresDays * 86_400_000) : null;
  const canApprove = input.role === "STAFF" && Boolean(input.canApprove);
  for (const dealId of dealIds) {
    // An old link that ran out is renewed rather than added twice.
    await prisma.customerAccountDeal.upsert({
      where: { accountId_dealId: { accountId: account.id, dealId } },
      create: { accountId: account.id, dealId, role: input.role, canApprove, expiresAt, invitedById: actor.id },
      update: { role: input.role, canApprove, expiresAt, invitedById: actor.id, createdAt: new Date() },
    });
  }

  const root = deals.find((d) => !d.parentDealId || !deals.some((x) => x.id === d.parentDealId)) ?? deals[0];
  const inviter = actor.name ?? actor.email;
  await logActivity({ type: "DEAL_UPDATED", message: `${inviter} inviterede ${email} som ${ROLE_NAMES.da[input.role]} på kundesiden (${dealName(root)})`, dealId: root.id });
  try {
    await sendInviteMail(account, { inviter, company: dealName(root), roleName: ROLE_NAMES.da[input.role], gets: roleScope(input.role, canApprove).gets, expiresAt });
  } catch {
    return { ok: true, warning: "Adgangen er givet, men mailen kunne ikke sendes lige nu. Bed dem logge ind på nextview360.dk/login med deres e-mail." };
  }
  return { ok: true };
}

export async function removeUser(actor: Actor, accountId: string): Promise<Result> {
  if (typeof accountId !== "string" || !accountId) return { ok: false, error: "Brugeren findes ikke." };
  if (accountId === actor.id) return { ok: false, error: "Du kan ikke fjerne dig selv." };
  const mine = actor.deals.filter((d) => roleCan(d, "users")).map((d) => d.dealId);
  const links = await prisma.customerAccountDeal.findMany({ where: { accountId, dealId: { in: mine } }, include: { account: { select: { email: true } } } });
  if (!links.length) return { ok: false, error: "Brugeren findes ikke." };
  if (links.some((l) => l.role === "OWNER" && !l.invitedById)) return { ok: false, error: "Den adgang er givet af Nextview360 - skriv til os, hvis den skal fjernes." };
  await prisma.customerAccountDeal.deleteMany({ where: { accountId, dealId: { in: links.map((l) => l.dealId) } } });
  // A login with nothing left is deleted - and is logged out at once.
  if ((await prisma.customerAccountDeal.count({ where: { accountId } })) === 0) await prisma.customerAccount.delete({ where: { id: accountId } }).catch(() => {});
  await logActivity({ type: "DEAL_UPDATED", message: `${actor.name ?? actor.email} fjernede ${links[0].account.email}s adgang til kundesiden`, dealId: links[0].dealId });
  return { ok: true };
}
