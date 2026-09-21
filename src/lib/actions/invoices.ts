"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isDineroConfigured, searchDineroContactsByCvr, searchDineroContactsByName } from "@/lib/dinero";
import { dealName } from "@/lib/labels";
import {
  runQuarterlyInvoiceGeneration,
  runAutoChurn,
  retrySingleInvoice,
  generateInvoiceForDeal,
  markEstablishmentSentManually,
  listRecurringPeriodsForDeal,
  markPeriodSentManually,
  checkInvoicePayment,
  checkAllPendingPayments,
  markInvoicePaidManually,
  type InvoiceRunSummary,
  type InvoicePeriodOption,
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

/** Options for the "marker kvartal sendt manuelt" picker on the deal page -
 * every recurring period for this deal's current term, past and future,
 * with whatever status it already has. */
export async function getRecurringPeriodOptions(dealId: string): Promise<InvoicePeriodOption[]> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Kun admin kan se fakturaperioder");

  return listRecurringPeriodsForDeal(dealId);
}

export async function markPeriodSentManuallyAction(
  dealId: string,
  quarterIndex: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Kun admin kan markere fakturaer som sendt manuelt");

  const result = await markPeriodSentManually(dealId, quarterIndex);
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/settings/dinero");
  return result;
}

export async function checkInvoicePaymentAction(
  invoiceId: string
): Promise<{ ok: true; paid: boolean; rawStatus: string | null } | { ok: false; error: string }> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Kun admin kan tjekke betalingsstatus");

  const result = await checkInvoicePayment(invoiceId);
  revalidatePath(`/deals/${result.dealId}`);
  revalidatePath("/settings/dinero");
  return result;
}

export async function markInvoicePaidManuallyAction(
  invoiceId: string,
  paid: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Kun admin kan markere fakturaer som betalt");

  const result = await markInvoicePaidManually(invoiceId, paid);
  if (result.ok) revalidatePath(`/deals/${result.dealId}`);
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
type ActionResult<T = undefined> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Next.js replaces a Server Action's thrown error with a generic masked
 * message in production ("An error occurred in the Server Components
 * render...") - real for security, but it means every specific error we
 * throw (a permission check, a validation message, a downstream API
 * error) never actually reaches the user, only a useless digest. Wrapping
 * the action's body and returning the message as normal data sidesteps
 * that masking entirely - this is the actual explanation for the
 * recurring "Minified React error #441" toasts, not a database issue.
 */
async function asActionResult<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Der opstod en fejl." };
  }
}

export async function deleteInvoiceDraft(invoiceId: string): Promise<ActionResult> {
  return asActionResult(async () => {
    const user = await requireUser();
    if (user.role !== "ADMIN") throw new Error("Kun admin kan fjerne fakturaer");

    const invoice = await prisma.invoice.delete({ where: { id: invoiceId } });
    revalidatePath(`/deals/${invoice.dealId}`);
    revalidatePath("/settings/dinero");
    return undefined;
  });
}

/**
 * Points a deal at an already-existing Dinero contact by GUID (copied from
 * that contact's URL in Dinero) instead of letting the next invoice draft
 * either create a new one or find one by CVR - useful when a customer was
 * already invoiced under a contact created outside this integration (or
 * under a duplicate deal), and we want every future draft to reuse it
 * instead of creating yet another duplicate. An empty guid clears the link,
 * falling back to the normal CVR-lookup-or-create behavior again.
 */
export async function linkDealToDineroContact(dealId: string, contactGuid: string): Promise<ActionResult> {
  return asActionResult(async () => {
    const user = await requireUser();
    if (user.role !== "ADMIN") throw new Error("Kun admin kan ændre Dinero-kobling");

    const trimmed = contactGuid.trim();
    await prisma.deal.update({ where: { id: dealId }, data: { dineroContactGuid: trimmed || null } });
    revalidatePath(`/deals/${dealId}`);
    return undefined;
  });
}

export type DineroContactCandidate = { contactGuid: string; linkedDealName: string | null };

/**
 * Looks up every Dinero contact sharing the deal's CVR number, so an admin
 * can pick the right one to link to instead of copy-pasting a GUID out of
 * Dinero's own UI. Dinero's contact list only returns bare GUIDs (a
 * separate per-contact detail fetch 404s against this organization), so
 * instead of Dinero-side name/email, each match is cross-referenced
 * against our own deals - showing which deal (if any) already uses that
 * contact is exactly what's needed to tell duplicates apart anyway.
 */
export async function findDineroContactsForDeal(dealId: string): Promise<ActionResult<DineroContactCandidate[]>> {
  return asActionResult(async () => {
    const user = await requireUser();
    if (user.role !== "ADMIN") throw new Error("Kun admin kan søge i Dinero");

    const deal = await prisma.deal.findUniqueOrThrow({
      where: { id: dealId },
      select: { cvrNumber: true, companyName: true, displayName: true },
    });
    if (!deal.cvrNumber) throw new Error("Dealen har intet CVR-nummer at søge på");
    if (!(await isDineroConfigured())) throw new Error("Dinero er ikke konfigureret");

    let guids = await searchDineroContactsByCvr(deal.cvrNumber);
    // A contact entered by hand directly in Dinero can have its CVR sitting
    // in a field our CVR search doesn't filter on - fall back to matching
    // by company name rather than reporting "nothing found" outright.
    if (guids.length === 0) guids = await searchDineroContactsByName(dealName(deal).trim());
    if (guids.length === 0) return [];

    const linkedDeals = await prisma.deal.findMany({
      where: { dineroContactGuid: { in: guids } },
      select: { companyName: true, displayName: true, dineroContactGuid: true },
    });
    const dealNameByGuid = new Map(linkedDeals.map((d) => [d.dineroContactGuid as string, dealName(d)]));

    return guids.map((contactGuid) => ({ contactGuid, linkedDealName: dealNameByGuid.get(contactGuid) ?? null }));
  });
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
