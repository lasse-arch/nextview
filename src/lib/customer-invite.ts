import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { CustomerRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getAppBaseUrl } from "@/lib/email-oauth";
import { normalizeEmail, sendLoginMail } from "@/lib/customer-login";
import { dealName } from "@/lib/labels";

/*
 * "Invitationslink": Nextview gives a customer one link, and their people add
 * themselves to the customer page - a name and an e-mail, and a login link
 * goes to that e-mail (so only someone who has the mailbox gets in). Only the
 * link's hash is kept; it runs out, has a number of uses and can be stopped.
 * It gives the role it was made with - never more to someone who already has
 * access, never less either. A chain's main deal brings its locations along.
 */

const hash = (token: string) => createHash("sha256").update(token).digest("hex");
/** Tries from one address in 15 minutes (the login's guard table). */
const MAX_PER_IP = 20;

export async function createInviteLink(dealId: string, by: { id: string }, o: { role: CustomerRole; canApprove: boolean; days: number; maxUses: number }): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await prisma.customerInviteLink.create({
    data: {
      tokenHash: hash(token),
      dealId,
      role: o.role,
      canApprove: o.role === "STAFF" && o.canApprove,
      maxUses: Math.min(50, Math.max(1, Math.round(o.maxUses))),
      expiresAt: new Date(Date.now() + Math.min(90, Math.max(1, Math.round(o.days))) * 86_400_000),
      createdById: by.id,
    },
  });
  return `${getAppBaseUrl()}/login/inviter/${token}`;
}

/** The link behind a token, while it still works - null otherwise (unknown, stopped, run out or used up). */
export async function openInvite(token: string) {
  if (!token || token.length > 100) return null;
  const link = await prisma.customerInviteLink.findUnique({
    where: { tokenHash: hash(token) },
    select: { id: true, dealId: true, role: true, canApprove: true, maxUses: true, uses: true, expiresAt: true, revokedAt: true, createdById: true, deal: { select: { companyName: true, displayName: true } } },
  });
  if (!link || link.revokedAt || link.expiresAt < new Date() || link.uses >= link.maxUses) return null;
  return { ...link, company: dealName(link.deal) };
}

/**
 * Someone with the link adds themselves: their e-mail gets access with the link's role (on the deal and its
 * locations) and a login link. The same calm answer whether or not they had access already.
 */
export async function acceptInvite(token: string, nameRaw: string, emailRaw: string, ip: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const since = new Date(Date.now() - 15 * 60_000);
  if ((await prisma.loginFailure.count({ where: { ip, createdAt: { gte: since } } })) >= MAX_PER_IP) return { ok: false, error: "For mange forsøg - prøv igen om lidt." };
  await prisma.loginFailure.create({ data: { email: "invite", ip } });

  const email = normalizeEmail(emailRaw);
  const name = String(nameRaw ?? "").trim().slice(0, 80);
  if (!name) return { ok: false, error: "Skriv dit navn." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return { ok: false, error: "Skriv en gyldig e-mail." };

  const link = await openInvite(token);
  if (!link) return { ok: false, error: "Linket virker ikke længere. Bed Nextview360 om et nyt." };
  // One use taken in the same step as it's checked - two at once can't go past the limit.
  const took = await prisma.customerInviteLink.updateMany({ where: { id: link.id, revokedAt: null, expiresAt: { gt: new Date() }, uses: { lt: link.maxUses } }, data: { uses: { increment: 1 } } });
  if (took.count !== 1) return { ok: false, error: "Linket virker ikke længere. Bed Nextview360 om et nyt." };

  const deal = await prisma.deal.findUnique({ where: { id: link.dealId }, select: { id: true, branches: { select: { id: true } } } });
  if (!deal) return { ok: false, error: "Linket virker ikke længere." };
  const account = await prisma.customerAccount.upsert({
    where: { email },
    create: { email, name, invitedByName: "Invitationslink" },
    update: {},
  });
  if (!account.name) await prisma.customerAccount.update({ where: { id: account.id }, data: { name } });
  for (const id of [deal.id, ...deal.branches.map((b) => b.id)]) {
    // Someone with access already keeps exactly what they have.
    const has = await prisma.customerAccountDeal.findUnique({ where: { accountId_dealId: { accountId: account.id, dealId: id } }, select: { dealId: true } });
    if (!has) await prisma.customerAccountDeal.create({ data: { accountId: account.id, dealId: id, role: link.role, canApprove: link.canApprove } });
  }
  // On the deal, under the one who made the link: who added themselves.
  if (link.createdById) await prisma.note.create({ data: { dealId: deal.id, authorId: link.createdById, kind: "MANUAL", body: `${name} (${email}) tilføjede sig selv til kundesiden med invitationslinket.` } }).catch(() => {});
  await sendLoginMail({ id: account.id, email: account.email, name: account.name ?? name }, true).catch((err) => console.error("Invitationslink: login-mail kunne ikke sendes", err));
  return { ok: true };
}

/**
 * A chain's logins on all of its locations: everyone with access to the main deal gets the same on each branch
 * (a location linked on later comes along). Those who have access on a branch already keep it as it is.
 */
export async function shareChainAccess(parentDealId: string): Promise<void> {
  const parent = await prisma.deal.findUnique({ where: { id: parentDealId }, select: { branches: { select: { id: true } }, customerAccounts: { select: { accountId: true, role: true, canApprove: true, expiresAt: true, invitedById: true } } } });
  if (!parent) return;
  for (const b of parent.branches)
    for (const a of parent.customerAccounts)
      await prisma.customerAccountDeal.upsert({
        where: { accountId_dealId: { accountId: a.accountId, dealId: b.id } },
        create: { accountId: a.accountId, dealId: b.id, role: a.role, canApprove: a.canApprove, expiresAt: a.expiresAt, invitedById: a.invitedById },
        update: {},
      });
}

/** A location unlinked from its chain: the chain's logins (those with access to the main deal) lose it again. */
export async function unshareChainAccess(formerParentId: string, branchId: string): Promise<void> {
  const parentLogins = await prisma.customerAccountDeal.findMany({ where: { dealId: formerParentId }, select: { accountId: true } });
  if (parentLogins.length) await prisma.customerAccountDeal.deleteMany({ where: { dealId: branchId, accountId: { in: parentLogins.map((p) => p.accountId) } } });
}
