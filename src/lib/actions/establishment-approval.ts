"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { dealName, formatDKK } from "@/lib/labels";
import { approvalTaskTitle } from "@/lib/establishment-approval";

/** The setup fee's invoice for the current term, if it has gone out (or is handled) already. */
async function establishmentAlreadyInvoiced(deal: { id: string; currentTermNumber: number }): Promise<boolean> {
  const invoice = await prisma.invoice.findFirst({
    where: { dealId: deal.id, termNumber: deal.currentTermNumber, quarterIndex: 0, status: { notIn: ["PENDING", "FAILED"] } },
    select: { id: true },
  });
  return Boolean(invoice);
}

/**
 * "Afvent kundens godkendelse" on a deal: hold the setup fee back from the
 * automatic invoicing until the customer is happy with the product - also
 * for deals signed before this could be chosen on the contract.
 */
export async function holdEstablishmentForApproval(dealId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
  if (!deal.establishmentFee) return { ok: false, error: "Dealen har ingen etableringspris." };
  if (await establishmentAlreadyInvoiced(deal)) return { ok: false, error: "Etableringen er allerede faktureret." };
  await prisma.deal.update({ where: { id: dealId }, data: { establishmentAwaitingApproval: true } });
  await prisma.note.create({
    data: {
      dealId,
      authorId: user.id,
      body: "Etableringen faktureres først, når produktet er leveret, og kunden er tilfreds.",
      kind: "MANUAL",
    },
  });
  revalidatePath(`/deals/${dealId}`);
  return { ok: true };
}

/** "Kunden er tilfreds - fakturér etablering": releases the setup fee to the next invoice run. */
export async function approveEstablishment(dealId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
  if (!deal.establishmentAwaitingApproval) return { ok: false, error: "Etableringen afventer ikke godkendelse." };
  await prisma.deal.update({ where: { id: dealId }, data: { establishmentAwaitingApproval: false } });
  await prisma.note.create({
    data: { dealId, authorId: user.id, body: "Kunden er tilfreds - etableringen frigivet til fakturering.", kind: "MANUAL" },
  });
  // The reminder made when it went Live is done now.
  await prisma.task.updateMany({ where: { dealId, title: approvalTaskTitle(dealName(deal)), done: false }, data: { done: true } });
  await logActivity({
    type: "DEAL_UPDATED",
    message: `${user.name}: ${dealName(deal)} er tilfredse - etablering (${formatDKK(deal.establishmentFee)}) faktureres`,
    actorId: user.id,
    dealId,
  });
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/opgaver");
  return { ok: true };
}
