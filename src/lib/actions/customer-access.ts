"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dealName } from "@/lib/labels";
import { logActivity } from "@/lib/activity";
import { normalizeEmail, sendLoginMail } from "@/lib/customer-login";
import { ROLE_NAMES, ROLES } from "@/lib/customer-roles";
import type { CustomerRole } from "@prisma/client";

/*
 * "Kundens login" on the deal page: gives an e-mail access to the customer's
 * own page (nextview360.dk/kunde) for this deal - and its locations, when it
 * has some - and sends the first login link. Admins only.
 */

type Result = { ok: true } | { ok: false; error: string };

async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Kun admin kan give kunder adgang.");
  return user;
}

/** A role as asked for - one of the four, else Ejer. "Må godkende" only for a Medarbejder (an Ejer always may). */
const roleOf = (role: unknown, approve: unknown): { role: CustomerRole; canApprove: boolean } => {
  const r = ROLES.includes(role as CustomerRole) ? (role as CustomerRole) : "OWNER";
  return { role: r, canApprove: r === "STAFF" && approve === true };
};

export async function grantCustomerAccess(dealId: string, emailRaw: string, nameRaw: string, roleRaw: CustomerRole = "OWNER", approveRaw = false): Promise<Result> {
  const user = await requireAdmin();
  const access = roleOf(roleRaw, approveRaw);
  const email = normalizeEmail(emailRaw);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Skriv en gyldig e-mail." };
  const deal = await prisma.deal.findUnique({ where: { id: dealId }, select: { id: true, companyName: true, displayName: true, branches: { select: { id: true } } } });
  if (!deal) return { ok: false, error: "Kunden findes ikke." };
  const name = nameRaw.trim() || null;
  const account = await prisma.customerAccount.upsert({
    where: { email },
    create: { email, name, invitedByName: user.name },
    update: name ? { name } : {},
  });
  // A chain's main deal: its locations come along, so they see all of their tours in one place.
  for (const id of [deal.id, ...deal.branches.map((b) => b.id)]) {
    await prisma.customerAccountDeal.upsert({ where: { accountId_dealId: { accountId: account.id, dealId: id } }, create: { accountId: account.id, dealId: id, ...access }, update: access });
  }
  try {
    await sendLoginMail(account, true);
  } catch (err) {
    revalidatePath(`/arpo/deals/${dealId}`);
    return { ok: false, error: `Adgangen er givet, men mailen kunne ikke sendes: ${err instanceof Error ? err.message : err}` };
  }
  await prisma.note.create({ data: { dealId, authorId: user.id, kind: "MANUAL", body: `Login til kundesiden givet til ${email} som ${ROLE_NAMES.da[access.role]}${access.canApprove ? " (må godkende)" : ""}, og mail med login-link sendt.` } });
  await logActivity({ type: "DEAL_UPDATED", message: `Kundelogin givet til ${email} (${dealName(deal)})`, actorId: user.id, dealId });
  revalidatePath(`/arpo/deals/${dealId}`);
  return { ok: true };
}

export async function resendCustomerLogin(dealId: string, accountId: string): Promise<Result> {
  await requireAdmin();
  const link = await prisma.customerAccountDeal.findUnique({ where: { accountId_dealId: { accountId, dealId } }, include: { account: true } });
  if (!link) return { ok: false, error: "Den e-mail har ikke adgang til kunden." };
  try {
    await sendLoginMail(link.account);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Mailen kunne ikke sendes." };
  }
  return { ok: true };
}

/** A login's name changed (the e-mail stays) - for one with access to this deal. */
export async function renameCustomerLogin(dealId: string, accountId: string, nameRaw: string): Promise<Result> {
  const user = await requireAdmin();
  const link = await prisma.customerAccountDeal.findUnique({ where: { accountId_dealId: { accountId, dealId } }, include: { account: { select: { email: true, name: true } } } });
  if (!link) return { ok: false, error: "Den e-mail har ikke adgang til kunden." };
  const name = String(nameRaw ?? "").trim().slice(0, 80) || null;
  if (name === link.account.name) return { ok: true };
  await prisma.customerAccount.update({ where: { id: accountId }, data: { name } });
  await logActivity({ type: "DEAL_UPDATED", message: `Navnet på kundelogin ${link.account.email} ændret${name ? ` til ${name}` : ""}`, actorId: user.id, dealId });
  revalidatePath(`/arpo/deals/${dealId}`);
  return { ok: true };
}

/** Takes the access to this deal away; a login with no deals left is deleted (and is logged out at once). */
export async function revokeCustomerAccess(dealId: string, accountId: string): Promise<Result> {
  const user = await requireAdmin();
  const link = await prisma.customerAccountDeal.findUnique({ where: { accountId_dealId: { accountId, dealId } }, include: { account: { select: { email: true } } } });
  if (!link) return { ok: true };
  await prisma.customerAccountDeal.delete({ where: { accountId_dealId: { accountId, dealId } } });
  if ((await prisma.customerAccountDeal.count({ where: { accountId } })) === 0) await prisma.customerAccount.delete({ where: { id: accountId } });
  await prisma.note.create({ data: { dealId, authorId: user.id, kind: "MANUAL", body: `Login til kundesiden fjernet for ${link.account.email}.` } });
  revalidatePath(`/arpo/deals/${dealId}`);
  return { ok: true };
}

/** A login's role on this customer (and its locations) - changed by an admin, also for one the customer invited themselves. */
export async function setCustomerLoginRole(dealId: string, accountId: string, roleRaw: CustomerRole, approveRaw = false): Promise<Result> {
  const user = await requireAdmin();
  const access = roleOf(roleRaw, approveRaw);
  const deal = await prisma.deal.findUnique({ where: { id: dealId }, select: { id: true, branches: { select: { id: true } } } });
  if (!deal) return { ok: false, error: "Kunden findes ikke." };
  const link = await prisma.customerAccountDeal.findUnique({ where: { accountId_dealId: { accountId, dealId } }, include: { account: { select: { email: true } } } });
  if (!link) return { ok: false, error: "Den e-mail har ikke adgang til kunden." };
  await prisma.customerAccountDeal.updateMany({ where: { accountId, dealId: { in: [deal.id, ...deal.branches.map((b) => b.id)] } }, data: access });
  await prisma.note.create({ data: { dealId, authorId: user.id, kind: "MANUAL", body: `${link.account.email} er nu ${ROLE_NAMES.da[access.role]}${access.canApprove ? " (må godkende)" : ""} på kundesiden.` } });
  revalidatePath(`/arpo/deals/${dealId}`);
  return { ok: true };
}

/** "Kundens ejere må selv invitere brugere" on the deal page - for the deal and its locations. */
export async function setCustomersMayInvite(dealId: string, on: boolean): Promise<Result> {
  const user = await requireAdmin();
  const deal = await prisma.deal.findUnique({ where: { id: dealId }, select: { id: true, branches: { select: { id: true } } } });
  if (!deal) return { ok: false, error: "Kunden findes ikke." };
  await prisma.deal.updateMany({ where: { id: { in: [deal.id, ...deal.branches.map((b) => b.id)] } }, data: { customersMayInvite: Boolean(on) } });
  await logActivity({ type: "DEAL_UPDATED", message: `Kunden må ${on ? "nu" : "ikke længere"} selv invitere brugere`, actorId: user.id, dealId });
  revalidatePath(`/arpo/deals/${dealId}`);
  return { ok: true };
}
