import { addMonths, subDays } from "date-fns";
import type { ReportInterval, ReportLanguage, ReportSendMethod } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isIntegrationEnabled } from "@/lib/integration-settings";
import { fetchExploreTourData } from "@/lib/explore-nextview360";
import { buildCustomerReportHtml, currentMonthLabel, escapeHtml } from "@/lib/customer-report-template";
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
  reportCcEmails: string | null;
  reportLanguage: ReportLanguage;
};

/** Splits the deal's comma-separated CC field into trimmed, non-empty addresses. */
function parseCcEmails(raw: string | null): string[] {
  return (raw ?? "")
    .split(/[,;]/)
    .map((e) => e.trim())
    .filter(Boolean);
}

/** Almost always a single MP-Skin nummer, but a few customers have more than one tour under the same deal. */
function parseMpSkinIds(raw: string | null): string[] {
  return (raw ?? "")
    .split(/[,;]/)
    .map((e) => e.trim())
    .filter(Boolean);
}

/** The report email's body, matching the signature/wording Lasse uses when sending manually. */
/** Describes the period the report covers to match how often it's actually sent -
 * a quarterly customer shouldn't be told their report is "for the latest month". */
function periodPhrase(interval: ReportInterval | null, language: ReportLanguage): string {
  if (language === "EN") {
    switch (interval) {
      case "MONTHLY":
        return "for the past month";
      case "BIMONTHLY":
        return "for the past 2 months";
      case "QUARTERLY":
        return "for the past quarter";
      default:
        return "for the most recent period";
    }
  }
  switch (interval) {
    case "MONTHLY":
      return "for den seneste måned";
    case "BIMONTHLY":
      return "for de seneste 2 måneder";
    case "QUARTERLY":
      return "for det seneste kvartal";
    default:
      return "for den seneste periode";
  }
}

function buildReportEmailText(
  customerName: string,
  interval: ReportInterval | null,
  language: ReportLanguage
): { subject: string; bodyText: string; bodyHtml: string } {
  const name = escapeHtml(customerName);
  const period = periodPhrase(interval, language);

  if (language === "EN") {
    return {
      subject: `Visitor report for your virtual tour – ${currentMonthLabel("EN")}`,
      bodyText: `Dear ${customerName}\n\nWe're pleased to share a visitor report for your virtual tour, ${period}.\n\nPlease see the attached PDF.\n\nIf you have any questions, are considering updating your material, or have other spaces that would make sense to showcase with a virtual tour, please don't hesitate to contact us.\n\nBest regards,\nLasse Larsen\nNextview360\nPhone: +45 23 27 07 86`,
      bodyHtml: `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #1d1d1f; line-height: 1.5;">
<p>Dear ${name}</p>
<p>We're pleased to share a visitor report for your virtual tour, ${period}.</p>
<p>Please see the attached PDF.</p>
<p>If you have any questions, are considering updating your material, or have other spaces that would make sense to showcase with a virtual tour, please don't hesitate to contact us.</p>
<p>Best regards,<br>
<b>Lasse Larsen</b><br>
Nextview360<br>
Phone: +45 23 27 07 86</p>
</div>`,
    };
  }

  return {
    subject: `Besøgsrapport for jeres virtuelle tour – ${currentMonthLabel("DA")}`,
    bodyText: `Kære ${customerName}\n\nVi er nu klar med en besøgsrapport for jeres virtuelle tour, ${period}.\n\nSe vedhæftede PDF\n\nHvis I har nogle spørgsmål, eller overvejer at få opdateret jeres materiale, eller har andre lokaler, som giver mening at vise frem med en virtuel tour, så er I meget velkommen til at kontakte os.\n\nMed venlig hilsen\nLasse Larsen\nNextview360\nTlf: 23 27 07 86`,
    bodyHtml: `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #1d1d1f; line-height: 1.5;">
<p>Kære ${name}</p>
<p>Vi er nu klar med en besøgsrapport for jeres virtuelle tour, ${period}.</p>
<p>Se vedhæftede PDF</p>
<p>Hvis I har nogle spørgsmål, eller overvejer at få opdateret jeres materiale, eller har andre lokaler, som giver mening at vise frem med en virtuel tour, så er I meget velkommen til at kontakte os.</p>
<p>Med venlig hilsen<br>
<b>Lasse Larsen</b><br>
Nextview360<br>
Tlf: 23 27 07 86</p>
</div>`,
  };
}

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
 * outcome + advances the schedule. Used by both the manual "Send nu" button
 * and the daily scheduler.
 *
 * `existingReportId` - the manual-send path creates a PENDING CustomerReport
 * row up front (so the UI has a real, persisted "sending..." state to poll
 * for) and passes its id here to be updated in place with the outcome,
 * rather than a second row being created. The scheduler has no such row yet,
 * so it's created fresh with the final status.
 */
export async function generateAndSendCustomerReport(
  deal: ReportableDeal,
  method: ReportSendMethod,
  existingReportId?: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const mpSkinIds = parseMpSkinIds(deal.mpSkinId);
    if (mpSkinIds.length === 0) throw new Error("Dealen har intet MP-Skin nummer udfyldt.");
    const recipient = deal.invoiceEmail || deal.contactEmail;
    if (!recipient) throw new Error("Dealen har ingen e-mail at sende rapporten til.");

    const customerName = deal.displayName || deal.companyName;
    const language = deal.reportLanguage;
    const monthLabel = currentMonthLabel(language);

    const tourData = await fetchExploreTourData(mpSkinIds);
    const html = buildCustomerReportHtml({
      customerName,
      monthLabel,
      coverImage: tourData.coverImage,
      stats: tourData.stats,
      language,
    });
    const pdf = await renderCustomerReportPdf(html);

    const account = await findReportSenderAccount();
    const fileName = `${customerName} - ${language === "EN" ? "visitor report" : "besøgsrapport"} ${monthLabel}.pdf`;

    let pdfDriveUrl: string | null = null;
    try {
      const folderId = await findOrCreateCustomerReportsFolder(account);
      const uploaded = await uploadPdfToDrive(account, folderId, fileName, pdf);
      pdfDriveUrl = uploaded.webViewLink;
    } catch (err) {
      // Best-effort archiving - a Drive hiccup shouldn't block the email itself.
      console.error("Kunne ikke arkivere besøgsrapport i Google Drev", err);
    }

    const emailText = buildReportEmailText(customerName, deal.reportInterval, language);
    await sendGmailMessage(account, {
      to: [recipient],
      cc: parseCcEmails(deal.reportCcEmails),
      subject: emailText.subject,
      bodyText: emailText.bodyText,
      bodyHtml: emailText.bodyHtml,
      attachment: { filename: fileName, contentType: "application/pdf", data: pdf },
      fromName: "Nextview360 ApS",
    });

    const nextReportDueAt = computeNextReportDueAt(deal, method);
    await prisma.$transaction([
      existingReportId
        ? prisma.customerReport.update({
            where: { id: existingReportId },
            data: { status: "SENT", pdfDriveUrl, errorMessage: null, sentAt: new Date() },
          })
        : prisma.customerReport.create({ data: { dealId: deal.id, method, status: "SENT", pdfDriveUrl } }),
      prisma.deal.update({ where: { id: deal.id }, data: { nextReportDueAt } }),
    ]);

    return { ok: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Ukendt fejl";
    try {
      if (existingReportId) {
        await prisma.customerReport.update({
          where: { id: existingReportId },
          data: { status: "FAILED", errorMessage, sentAt: new Date() },
        });
      } else {
        await prisma.customerReport.create({ data: { dealId: deal.id, method, status: "FAILED", errorMessage } });
      }
    } catch (recordErr) {
      console.error("Kunne ikke gemme fejlet besøgsrapport-forsøg", recordErr);
    }
    return { ok: false, error: errorMessage };
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
      reportCcEmails: true,
      reportLanguage: true,
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
