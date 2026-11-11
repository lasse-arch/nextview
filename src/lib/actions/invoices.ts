"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { creditInvoiceInDinero, deleteTestModeDraft, TEST_DRAFT_PREFIX } from "@/lib/dinero";
import { formatDKK } from "@/lib/labels";
import {
  runQuarterlyInvoiceGeneration,
  runAutoChurn,
  retrySingleInvoice,
  generateInvoiceForDeal,
  previewInvoiceForDeal,
  markEstablishmentSentManually,
  listRecurringPeriodsForDeal,
  markPeriodSentManually,
  checkInvoicePayment,
  checkAllPendingPayments,
  markInvoicePaidManually,
  type InvoiceRunSummary,
  type InvoicePeriodOption,
  type InvoicePreviewLine,
} from "@/lib/invoice-service";

export async function runInvoiceGenerationNow(): Promise<InvoiceRunSummary> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Kun admin kan køre dette manuelt");

  const summary = await runQuarterlyInvoiceGeneration();
  const { churned } = await runAutoChurn();
  const payments = await checkAllPendingPayments();
  revalidatePath("/arpo/settings/dinero");
  revalidatePath("/arpo/deals");
  return { ...summary, churned, paymentsChecked: payments.checked, paymentsNewlyPaid: payments.paid };
}

/** What "Opret faktura-kladde" would draft and send right now, shown in a
 * confirmation dialog before the button actually commits to anything. */
export async function previewInvoiceForCurrentDeal(dealId: string): Promise<ActionResult<InvoicePreviewLine[]>> {
  return asActionResult(async () => {
    const user = await requireUser();
    if (user.role !== "ADMIN") throw new Error("Kun admin kan oprette faktura-kladder");
    return previewInvoiceForDeal(dealId);
  });
}

/** "Opret faktura-kladde" on the deal page - drafts and sends any currently-due lines for just this deal. */
export async function createInvoiceForDeal(dealId: string): Promise<InvoiceRunSummary> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Kun admin kan oprette faktura-kladder");

  const summary = await generateInvoiceForDeal(dealId);
  revalidatePath(`/arpo/deals/${dealId}`);
  revalidatePath("/arpo/settings/dinero");
  return summary;
}

export async function markEstablishmentSentManuallyAction(dealId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Kun admin kan markere fakturaer som sendt manuelt");

  const result = await markEstablishmentSentManually(dealId);
  revalidatePath(`/arpo/deals/${dealId}`);
  revalidatePath("/arpo/settings/dinero");
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
  revalidatePath(`/arpo/deals/${dealId}`);
  revalidatePath("/arpo/settings/dinero");
  return result;
}

export async function checkInvoicePaymentAction(
  invoiceId: string
): Promise<{ ok: true; paid: boolean; rawStatus: string | null } | { ok: false; error: string }> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Kun admin kan tjekke betalingsstatus");

  const result = await checkInvoicePayment(invoiceId);
  revalidatePath(`/arpo/deals/${result.dealId}`);
  revalidatePath("/arpo/settings/dinero");
  return result;
}

export async function markInvoicePaidManuallyAction(
  invoiceId: string,
  paid: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Kun admin kan markere fakturaer som betalt");

  const result = await markInvoicePaidManually(invoiceId, paid);
  if (result.ok) revalidatePath(`/arpo/deals/${result.dealId}`);
  revalidatePath("/arpo/settings/dinero");
  return result;
}

export async function retryInvoiceDraft(invoiceId: string): Promise<{ success: boolean; error?: string }> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Kun admin kan genforsøge fakturaer");

  const result = await retrySingleInvoice(invoiceId);
  revalidatePath("/arpo/settings/dinero");
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
    revalidatePath(`/arpo/deals/${invoice.dealId}`);
    revalidatePath("/arpo/settings/dinero");
    return undefined;
  });
}

/**
 * Wipes every invoice row (including imported/historical ones) across all
 * deals, so fakturering only reflects what's generated from here on while
 * the feature is still being finished - a one-time reset, not something run
 * routinely.
 */
export async function clearAllInvoices(confirmation: string): Promise<{ deleted: number }> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Kun admin kan nulstille fakturaer");
  // Typed by hand in the confirmation box - also checked here, so the action
  // can never run without it.
  if (confirmation.trim().toLowerCase() !== "sletslet") throw new Error('Ikke slettet - du skal skrive "sletslet".');

  const { count } = await prisma.invoice.deleteMany({});
  revalidatePath("/arpo/settings/dinero");
  revalidatePath("/arpo/deals");
  return { deleted: count };
}

/**
 * Deletes only the test drafts made while "Testtilstand" was on (Dinero
 * guid "TEST-...") - so turning test mode off afterwards lets the real
 * invoices for those periods be created, instead of the periods looking
 * already invoiced. Real invoices are never touched.
 */
export async function clearTestInvoices(): Promise<{ deleted: number; deletedInDinero: number; keptBooked: number }> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Kun admin kan slette testkladder");

  // Test drafts also exist as drafts in Dinero (see createTestModeDraft) -
  // removed there too. A combined invoice shares one draft across rows.
  const rows = await prisma.invoice.findMany({
    where: { dineroInvoiceGuid: { startsWith: TEST_DRAFT_PREFIX } },
    select: { dineroInvoiceGuid: true },
  });
  let deletedInDinero = 0;
  let keptBooked = 0;
  for (const guid of new Set(rows.map((r) => r.dineroInvoiceGuid!))) {
    const outcome = await deleteTestModeDraft(guid);
    if (outcome === "deleted") deletedInDinero++;
    if (outcome === "booked") keptBooked++;
  }

  const { count } = await prisma.invoice.deleteMany({ where: { dineroInvoiceGuid: { startsWith: TEST_DRAFT_PREFIX } } });
  revalidatePath("/arpo/settings/dinero");
  revalidatePath("/arpo/deals");
  return { deleted: count, deletedInDinero, keptBooked };
}

/**
 * "Kreditér" (admin): a credit note for a sent invoice, made, booked and sent
 * in Dinero (lib/dinero.ts creditInvoiceInDinero) - all of it or part of it
 * (excl. VAT), with a reason. Kept on the invoice and as a note on the deal;
 * an invoice credited in full is no longer owed (not chased, never collected
 * through Betalingsservice). One credit note per invoice from here - more
 * than that is done in Dinero.
 */
export async function creditInvoiceAction(
  invoiceId: string,
  input: { amount: number | null; reason: string; bsOk?: boolean }
): Promise<{ ok: true; number: string | null; sendError: string | null } | { ok: false; error: string; needsBsOk?: true }> {
  const user = await requireUser();
  if (user.role !== "ADMIN") return { ok: false, error: "Kun admin kan kreditere fakturaer." };
  const reason = typeof input.reason === "string" ? input.reason.trim().slice(0, 200) : "";
  if (!reason) return { ok: false, error: "Skriv kort, hvorfor der krediteres - det står på kreditnotaen." };

  const inv = await prisma.invoice.findUnique({
    where: { id: String(invoiceId) },
    include: { bsCollection: { select: { status: true } }, deal: { select: { id: true, dineroContactGuid: true, invoiceEmail: true, contactEmail: true, eanNumber: true } } },
  });
  if (!inv) return { ok: false, error: "Fakturaen findes ikke længere." };
  if (!inv.dineroInvoiceGuid || inv.dineroInvoiceGuid.startsWith(TEST_DRAFT_PREFIX)) return { ok: false, error: "Fakturaen er ikke lavet i Dinero, så den kan ikke krediteres herfra." };
  if (!inv.sentAt) return { ok: false, error: "Fakturaen er ikke bogført og sendt endnu - slet kladden i stedet for at kreditere." };
  if (inv.creditNoteGuid) return { ok: false, error: `Der er allerede lavet en kreditnota${inv.creditNoteNumber ? ` (nr. ${inv.creditNoteNumber})` : ""} for fakturaen - lav flere i Dinero.` };
  const shared = await prisma.invoice.count({ where: { dineroInvoiceGuid: inv.dineroInvoiceGuid, NOT: { id: inv.id } } });
  if (shared) return { ok: false, error: "Det er en samlet faktura for flere afdelinger - krediter den i Dinero." };

  const amount = input.amount == null ? null : Math.round(Number(input.amount));
  if (amount != null && (!Number.isFinite(amount) || amount <= 0 || amount > inv.amount)) return { ok: false, error: `Beløbet skal være mellem 1 og ${formatDKK(inv.amount)} (ekskl. moms).` };
  const full = amount == null || amount === inv.amount;

  // Betalingsservice: in a file already, the money is (or will be) drawn - it has to be paid back by hand.
  if (inv.collectViaBs && inv.bsCollectionId && !input.bsOk)
    return { ok: false, needsBsOk: true, error: `Fakturaen er allerede sendt til opkrævning i Betalingsservice${inv.bsCollection?.status === "PAID" ? " og betalt" : ""}. Kreditnotaen stopper ikke trækket - pengene skal betales tilbage til kunden manuelt.` };
  if (inv.collectViaBs && !inv.bsCollectionId && !full) return { ok: false, error: "En Betalingsservice-faktura kan kun krediteres helt herfra (ellers trækkes hele beløbet stadig). Krediter hele fakturaen, og lav en ny med det rigtige beløb." };

  let r;
  try {
    r = await creditInvoiceInDinero({
      invoiceGuid: inv.dineroInvoiceGuid,
      amount: full ? null : amount,
      reason,
      contactGuid: inv.deal.dineroContactGuid,
      receiverEmail: inv.deal.invoiceEmail || inv.deal.contactEmail,
      eanNumber: inv.deal.eanNumber,
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  const credited = full ? inv.amount : amount!;
  await prisma.invoice.update({
    where: { id: inv.id },
    data: { creditNoteGuid: r.guid, creditNoteNumber: r.number, creditedAmount: credited, creditReason: reason, creditedAt: new Date(), creditedFull: full },
  });
  await prisma.note
    .create({
      data: {
        dealId: inv.deal.id,
        authorId: user.id,
        body: `Kreditnota${r.number ? ` nr. ${r.number}` : ""}: ${formatDKK(credited)} ekskl. moms krediteret${full ? " (hele fakturaen)" : ""} på faktura${inv.dineroInvoiceNumber ? ` nr. ${inv.dineroInvoiceNumber}` : ""}. Årsag: ${reason}${inv.collectViaBs && inv.bsCollectionId ? " - beløbet er sendt til Betalingsservice og skal betales tilbage manuelt." : ""}${r.sendError ? ` (${r.sendError})` : ""}`,
      },
    })
    .catch(() => {});
  revalidatePath(`/arpo/deals/${inv.deal.id}`);
  revalidatePath(`/arpo/kunder/${inv.deal.id}`);
  return { ok: true, number: r.number, sendError: r.sendError };
}
