"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import type { ReportInterval, ReportLanguage } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateAndSendCustomerReport, REPORT_INTERVAL_MONTHS } from "@/lib/customer-report-service";
import { addMonths } from "date-fns";

export async function updateMpSkinIdAction(
  dealId: string,
  mpSkinId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Kun admin kan ændre MP-Skin nummer");

  // Almost always just one, but a few customers have more than one tour
  // under the same deal - comma-separated, same as CC-modtagere.
  const ids = mpSkinId
    .split(/[,;]/)
    .map((id) => id.trim())
    .filter(Boolean);

  await prisma.deal.update({ where: { id: dealId }, data: { mpSkinId: ids.join(", ") || null } });
  revalidatePath("/stats");
  revalidatePath(`/deals/${dealId}`);
  return { ok: true };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function updateReportCcEmailsAction(
  dealId: string,
  ccEmails: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Kun admin kan ændre CC-modtagere");

  const addresses = ccEmails
    .split(/[,;]/)
    .map((e) => e.trim())
    .filter(Boolean);
  const invalid = addresses.find((e) => !EMAIL_RE.test(e));
  if (invalid) return { ok: false, error: `"${invalid}" ser ikke ud som en gyldig e-mail.` };

  await prisma.deal.update({ where: { id: dealId }, data: { reportCcEmails: addresses.join(", ") || null } });
  revalidatePath("/stats");
  revalidatePath(`/deals/${dealId}`);
  return { ok: true };
}

export async function updateReportLanguageAction(
  dealId: string,
  language: ReportLanguage
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Kun admin kan ændre rapportsprog");

  await prisma.deal.update({ where: { id: dealId }, data: { reportLanguage: language } });
  revalidatePath("/stats");
  revalidatePath(`/deals/${dealId}`);
  return { ok: true };
}

export async function updateReportIntervalAction(
  dealId: string,
  interval: ReportInterval | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Kun admin kan ændre rapport-interval");

  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
  // Turning it on (from off, or switching interval length) reseeds the next
  // due date from today - switching TO the same interval it already was
  // leaves the existing schedule alone.
  const nextReportDueAt =
    interval === null ? null : deal.reportInterval === interval ? deal.nextReportDueAt : addMonths(new Date(), REPORT_INTERVAL_MONTHS[interval]);

  await prisma.deal.update({ where: { id: dealId }, data: { reportInterval: interval, nextReportDueAt } });
  revalidatePath("/stats");
  revalidatePath(`/deals/${dealId}`);
  return { ok: true };
}

/**
 * "Send nu"/"Send stats" button - scraping + PDF rendering + emailing easily
 * takes 30-60+ seconds (headless Chromium, several page loads on a slow
 * third-party site), far past what a button click should block on and
 * uncomfortably close to a serverless function's request timeout. `after()`
 * lets the actual work keep running past this action's own response, so the
 * click returns immediately and the send happens in the background.
 *
 * A PENDING CustomerReport row is created synchronously, before after() even
 * starts, so the UI has a real, persisted "sending..." state to show (and
 * poll for) rather than just a client-side spinner that would otherwise
 * vanish the instant this fast-returning action resolves - and if the
 * background job fails, that same row flips to FAILED with the real reason,
 * instead of the failure disappearing into server logs nobody sees.
 */
export async function sendCustomerReportNowAction(
  dealId: string
): Promise<{ ok: true; queued: true } | { ok: false; error: string }> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Kun admin kan sende besøgsrapporter");

  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
  if (!deal.mpSkinId) return { ok: false, error: "Dealen har intet MP-Skin nummer udfyldt." };

  const pendingReport = await prisma.customerReport.create({
    data: { dealId, method: "MANUAL", status: "PENDING" },
  });

  after(async () => {
    const result = await generateAndSendCustomerReport(deal, "MANUAL", pendingReport.id);
    if (!result.ok) console.error(`Besøgsrapport til deal ${dealId} fejlede:`, result.error);
    revalidatePath(`/deals/${dealId}`);
    revalidatePath("/stats");
  });

  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/stats");
  return { ok: true, queued: true };
}

/**
 * Bulk "Send nu" for the checkboxes on /stats - same PENDING-row-up-front +
 * after() pattern as the single-deal action, just for several deals at once.
 * Deals without an MP-Skin nummer are silently skipped (reported back as
 * `skipped`) rather than failing the whole batch over one bad row. Sends run
 * one at a time in the background (not in parallel), matching the daily
 * scheduler, since each one drives its own headless-Chromium scrape of
 * explore.nextview360.dk - several at once would be needlessly heavy.
 */
export async function sendCustomerReportsNowAction(
  dealIds: string[]
): Promise<{ ok: true; queued: number; skipped: number } | { ok: false; error: string }> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Kun admin kan sende besøgsrapporter");

  if (dealIds.length === 0) return { ok: false, error: "Ingen kunder valgt." };

  const deals = await prisma.deal.findMany({ where: { id: { in: dealIds } } });
  const sendable = deals.filter((d) => d.mpSkinId);
  const skipped = deals.length - sendable.length;
  if (sendable.length === 0) return { ok: false, error: "Ingen af de valgte kunder har et MP-Skin nummer udfyldt." };

  const pendingReports = await Promise.all(
    sendable.map((deal) => prisma.customerReport.create({ data: { dealId: deal.id, method: "MANUAL", status: "PENDING" } }))
  );

  after(async () => {
    for (let i = 0; i < sendable.length; i++) {
      const deal = sendable[i];
      const result = await generateAndSendCustomerReport(deal, "MANUAL", pendingReports[i].id);
      if (!result.ok) console.error(`Besøgsrapport til deal ${deal.id} fejlede:`, result.error);
    }
    revalidatePath("/stats");
    for (const deal of sendable) revalidatePath(`/deals/${deal.id}`);
  });

  revalidatePath("/stats");
  return { ok: true, queued: sendable.length, skipped };
}
