"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import type { ReportInterval, ReportLanguage } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { REPORT_INTERVAL_MONTHS, kickCustomerReportQueue } from "@/lib/customer-report-service";
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
 * third-party site), far past what a button click should block on. A
 * PENDING CustomerReport row is created synchronously, so the UI has a real,
 * persisted "sending..." state to show (and poll for) rather than just a
 * client-side spinner - and the actual send happens via the self-chaining
 * /api/internal/process-customer-reports queue (kicked off here, not run
 * inline), so this returns immediately regardless of how backed up that
 * queue already is.
 */
export async function sendCustomerReportNowAction(
  dealId: string
): Promise<{ ok: true; queued: true } | { ok: false; error: string }> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Kun admin kan sende besøgsrapporter");

  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
  if (!deal.mpSkinId) return { ok: false, error: "Dealen har intet MP-Skin nummer udfyldt." };

  await prisma.customerReport.create({ data: { dealId, method: "MANUAL", status: "PENDING" } });
  after(() => kickCustomerReportQueue());

  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/stats");
  return { ok: true, queued: true };
}

/**
 * Bulk "Send nu" for the checkboxes on /stats - same PENDING-row-up-front
 * pattern as the single-deal action, just for several deals at once. Deals
 * without an MP-Skin nummer are silently skipped (reported back as
 * `skipped`) rather than failing the whole batch over one bad row.
 *
 * All queued reports (however many) are processed one at a time by the same
 * self-chaining queue as the single-send action and the daily scheduler -
 * each report gets its own fresh serverless invocation, so a batch of 30
 * can't blow past any single request's timeout the way looping through all
 * of them in one request could.
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

  await prisma.customerReport.createMany({
    data: sendable.map((deal) => ({ dealId: deal.id, method: "MANUAL" as const, status: "PENDING" as const })),
  });
  after(() => kickCustomerReportQueue());

  revalidatePath("/stats");
  return { ok: true, queued: sendable.length, skipped };
}
