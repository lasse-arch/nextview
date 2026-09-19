"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  runQuarterlyInvoiceGeneration,
  runAutoChurn,
  retrySingleInvoice,
  generateInvoiceForDeal,
  markEstablishmentSentManually,
  checkInvoicePayment,
  checkAllPendingPayments,
  type InvoiceRunSummary,
} from "@/lib/invoice-service";

export async function runInvoiceGenerationNow(): Promise<InvoiceRunSummary> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Kun admin kan køre dette manuelt");

  const summary = await runQuarterlyInvoiceGeneration();
  const { churned } = await runAutoChurn();
  const payments = await checkAllPendingPayments();
  revalidatePath("/settings/dinero");
  revalidatePath("/deals");
  return { ...summary, churned, paymentsChecked: payments.checked, paymentsNewlyPaid: payments.paid };
}

/** "Opret faktura-kladde" on the deal page - drafts any currently-due lines for just this deal. */
export async function createInvoiceForDeal(dealId: string): Promise<InvoiceRunSummary> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Kun admin kan oprette faktura-kladder");

  const summary = await generateInvoiceForDeal(dealId);
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/settings/dinero");
  return summary;
}

export async function markEstablishmentSentManuallyAction(dealId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Kun admin kan markere fakturaer som sendt manuelt");

  const result = await markEstablishmentSentManually(dealId);
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/settings/dinero");
  return result;
}

export async function checkInvoicePaymentAction(
  invoiceId: string
): Promise<{ ok: true; paid: boolean } | { ok: false; error: string }> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Kun admin kan tjekke betalingsstatus");

  const result = await checkInvoicePayment(invoiceId);
  revalidatePath(`/deals/${result.dealId}`);
  revalidatePath("/settings/dinero");
  return result;
}

export async function retryInvoiceDraft(invoiceId: string): Promise<{ success: boolean; error?: string }> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Kun admin kan genforsøge fakturaer");

  const result = await retrySingleInvoice(invoiceId);
  revalidatePath("/settings/dinero");
  return result;
}

/**
 * Removes a single invoice row from our own tracking - like "Ryd alle
 * fakturaer" but for one line. Does not touch Dinero itself: if a real
 * kladde was already created there, it stays until deleted from within
 * Dinero directly (see the "Nulstil fakturering" section for why).
 */
export async function deleteInvoiceDraft(invoiceId: string): Promise<void> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Kun admin kan fjerne fakturaer");

  const invoice = await prisma.invoice.delete({ where: { id: invoiceId } });
  revalidatePath(`/deals/${invoice.dealId}`);
  revalidatePath("/settings/dinero");
}

/**
 * Wipes every invoice row (including imported/historical ones) across all
 * deals, so fakturering only reflects what's generated from here on while
 * the feature is still being finished - a one-time reset, not something run
 * routinely.
 */
export async function clearAllInvoices(): Promise<{ deleted: number }> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Kun admin kan nulstille fakturaer");

  const { count } = await prisma.invoice.deleteMany({});
  revalidatePath("/settings/dinero");
  revalidatePath("/deals");
  return { deleted: count };
}
