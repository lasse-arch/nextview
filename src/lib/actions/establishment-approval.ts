"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

/**
 * "Vent til kunden har godkendt" on a deal: hold the setup fee back from the
 * automatic invoicing until the deal is set Live (= the customer approved
 * the product) - also for deals signed before this could be chosen on the
 * contract. Only while the setup fee hasn't been invoiced yet.
 */
export async function holdEstablishmentForApproval(dealId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
  if (!deal.establishmentFee) return { ok: false, error: "Dealen har ingen etableringspris." };
  if (deal.stage === "LIVE") return { ok: false, error: "Dealen er allerede Live - kunden har godkendt." };
  const invoiced = await prisma.invoice.findFirst({
    where: { dealId, termNumber: deal.currentTermNumber, quarterIndex: 0, status: { notIn: ["PENDING", "FAILED"] } },
    select: { id: true },
  });
  if (invoiced) return { ok: false, error: "Etableringen er allerede faktureret." };
  await prisma.deal.update({ where: { id: dealId }, data: { establishmentAwaitingApproval: true } });
  await prisma.note.create({
    data: {
      dealId,
      authorId: user.id,
      body: "Etableringen faktureres først, når kunden har godkendt produktet (dealen sættes Live).",
      kind: "MANUAL",
    },
  });
  revalidatePath(`/arpo/deals/${dealId}`);
  return { ok: true };
}

/** Undoes the hold - the setup fee is invoiced as usual (after signing). */
export async function releaseEstablishmentHold(dealId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  await prisma.deal.update({ where: { id: dealId }, data: { establishmentAwaitingApproval: false } });
  await prisma.note.create({
    data: { dealId, authorId: user.id, body: "Etableringen faktureres alligevel som normalt (efter underskrift).", kind: "MANUAL" },
  });
  revalidatePath(`/arpo/deals/${dealId}`);
  return { ok: true };
}
