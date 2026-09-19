"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { runQuarterlyInvoiceGeneration, runAutoChurn, retrySingleInvoice, type InvoiceRunSummary } from "@/lib/invoice-service";

export async function runInvoiceGenerationNow(): Promise<InvoiceRunSummary> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Kun admin kan køre dette manuelt");

  const summary = await runQuarterlyInvoiceGeneration();
  const { churned } = await runAutoChurn();
  revalidatePath("/settings/dinero");
  revalidatePath("/deals");
  return { ...summary, churned };
}

export async function retryInvoiceDraft(invoiceId: string): Promise<{ success: boolean; error?: string }> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Kun admin kan genforsøge fakturaer");

  const result = await retrySingleInvoice(invoiceId);
  revalidatePath("/settings/dinero");
  return result;
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
