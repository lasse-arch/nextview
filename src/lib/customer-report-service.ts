import { addMonths, subDays } from "date-fns";
import type { ReportInterval, ReportSendMethod } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isIntegrationEnabled } from "@/lib/integration-settings";
import { fetchExploreTourData } from "@/lib/explore-nextview360";
import { buildCustomerReportHtml, currentMonthLabel } from "@/lib/customer-report-template";
import { renderCustomerReportPdf } from "@/lib/customer-report-pdf";
import { sendGmailMessage } from "@/lib/gmail";
import { findOrCreateCustomerReportsFolder, uploadPdfToDrive } from "@/lib/google-drive";

/** All visitor-stats reports go out from this one fixed address, regardless of which seller owns the deal. */
const REPORT_SENDER_EMAIL = "lasse@nextview360.dk";

/** A manual send this close to (or past) the next automatic due date counts as that cycle's report. */
const PUSH_BACK_WINDOW_DAYS = 30;

export const REPORT_INTERVAL_MONTHS: Record<ReportInterval, number> = {
  MONTHLY: 1,
  BIMONTHLY: 2,
  QUARTERLY: 3,
};

export type ReportableDeal = {
  id: string;
  companyName: string;
  displayName: string | null;
  mpSkinId: string | null;
  contactEmail: string | null;
  invoiceEmail: string | null;
  reportInterval: ReportInterval | null;
  nextReportDueAt: Date | null;
};

async function findReportSenderAccount() {
  const account = await prisma.emailAccount.findFirst({
    where: { provider: "GOOGLE", email: REPORT_SENDER_EMAIL },
  });
  if (!account) {
    throw new Error(
      `Ingen forbundet Gmail-konto for ${REPORT_SENDER_EMAIL}. Forbind den under Indstillinger → E-mail.`
    );
  }
  return account;
}

/**
 * How nextReportDueAt moves after a report is sent:
 * - No interval set (reporting off) or no due date yet: leave/seed it, nothing to push.
 * - Automatic send: this WAS the scheduled cycle - advance by one interval
 *   from the due date itself (not "now"), so the cadence stays anchored
 *   rather than drifting with whatever time the cron happened to run.
 * - Manual send within 30 days of the next due date: counts as that cycle's
 *   report too - advance the same way, skipping the imminent automatic send.
 * - Manual send earlier than that: just a bonus/extra report - the regular
 *   schedule is untouched.
 */
export function computeNextReportDueAt(
  deal: Pick<ReportableDeal, "reportInterval" | "nextReportDueAt">,
  method: ReportSendMethod,
  now: Date = new Date()
): Date | null {
  if (!deal.reportInterval) return deal.nextReportDueAt;
  const months = REPORT_INTERVAL_MONTHS[deal.reportInterval];

  if (!deal.nextReportDueAt) return addMonths(now, months);

  if (method === "AUTOMATIC") return addMonths(deal.nextReportDueAt, months);

  const windowStart = subDays(deal.nextReportDueAt, PUSH_BACK_WINDOW_DAYS);
  if (now >= windowStart) return addMonths(deal.nextReportDueAt, months);
  return deal.nextReportDueAt;
}

/**
 * Generates a visitor-stats report for one deal (scraping explore.nextview360.dk,
 * rendering the PDF, archiving it to Drive, and emailing it) and records the
 * send + advances the schedule. Used by both the manual "Send nu" button and
 * the daily scheduler.
 */
export async function generateAndSendCustomerReport(
  deal: ReportableDeal,
  method: ReportSendMethod
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    if (!deal.mpSkinId) throw new Error("Dealen har intet MP-Skin nummer udfyldt.");
    const recipient = deal.invoiceEmail || deal.contactEmail;
    if (!recipient) throw new Error("Dealen har ingen e-mail at sende rapporten til.");

    const customerName = deal.displayName || deal.companyName;
    const monthLabel = currentMonthLabel();

    const tourData = await fetchExploreTourData(deal.mpSkinId);
    const html = buildCustomerReportHtml({
      customerName,
      monthLabel,
      coverImage: tourData.coverImage,
      heatmapImage: tourData.heatmapImage,
      stats: tourData.stats,
    });
    const pdf = await renderCustomerReportPdf(html);

    const account = await findReportSenderAccount();
    const fileName = `${customerName} - besøgsrapport ${monthLabel}.pdf`;

    let pdfDriveUrl: string | null = null;
    try {
      const folderId = await findOrCreateCustomerReportsFolder(account);
      const uploaded = await uploadPdfToDrive(account, folderId, fileName, pdf);
      pdfDriveUrl = uploaded.webViewLink;
    } catch (err) {
      // Best-effort archiving - a Drive hiccup shouldn't block the email itself.
      console.error("Kunne ikke arkivere besøgsrapport i Google Drev", err);
    }

    await sendGmailMessage(account, {
      to: [recipient],
      subject: `Besøgsrapport for jeres virtuelle tour – ${monthLabel}`,
      bodyText: `Hej,\n\nHer er jeres besøgsstatistik for ${customerName}.\n\nMed venlig hilsen\nNextview360`,
      attachment: { filename: fileName, contentType: "application/pdf", data: pdf },
    });

    const nextReportDueAt = computeNextReportDueAt(deal, method);
    await prisma.$transaction([
      prisma.customerReport.create({ data: { dealId: deal.id, method, pdfDriveUrl } }),
      prisma.deal.update({ where: { id: deal.id }, data: { nextReportDueAt } }),
    ]);

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Ukendt fejl" };
  }
}

const REPORTABLE_STAGES = ["FILMED", "LIVE"] as const;

/** Daily cron entry point: sends every deal whose nextReportDueAt has arrived. */
export async function runScheduledCustomerReports(): Promise<{ checked: number; sent: number; failed: number }> {
  if (!(await isIntegrationEnabled("CUSTOMER_REPORTS_AUTO_RUN"))) {
    return { checked: 0, sent: 0, failed: 0 };
  }

  const deals = await prisma.deal.findMany({
    where: {
      reportInterval: { not: null },
      nextReportDueAt: { lte: new Date() },
      mpSkinId: { not: null },
      churnedAt: null,
      stage: { in: [...REPORTABLE_STAGES] },
    },
    select: {
      id: true,
      companyName: true,
      displayName: true,
      mpSkinId: true,
      contactEmail: true,
      invoiceEmail: true,
      reportInterval: true,
      nextReportDueAt: true,
    },
  });

  let sent = 0;
  let failed = 0;
  for (const deal of deals) {
    const result = await generateAndSendCustomerReport(deal, "AUTOMATIC");
    if (result.ok) sent++;
    else failed++;
  }
  return { checked: deals.length, sent, failed };
}
