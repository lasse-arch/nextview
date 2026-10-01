import { addMonths, subDays } from "date-fns";
import type { ReportInterval, ReportLanguage, ReportSendMethod } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isIntegrationEnabled } from "@/lib/integration-settings";
import { fetchMatterportTourData } from "@/lib/explore-matterport";
import {
  buildCustomerReportHtml,
  buildCombinedCustomerReportHtml,
  currentMonthLabel,
  escapeHtml,
  type CombinedCustomerReportBranch,
} from "@/lib/customer-report-template";
import { renderCustomerReportPdf } from "@/lib/customer-report-pdf";
import { sendGmailMessage } from "@/lib/gmail";
import { findOrCreateCustomerReportsFolder, uploadPdfToDrive } from "@/lib/google-drive";
import { getAppBaseUrl } from "@/lib/email-oauth";
import { logActivity } from "@/lib/activity";
import { dealName } from "@/lib/labels";

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
      bodyText: `Dear ${customerName}\n\nWe're pleased to share a visitor report for your virtual tour, ${period}.\n\nPlease see the attached PDF.\n\nIf you have any questions, or have other spaces that would make sense to showcase with a virtual tour, please don't hesitate to contact us.\n\nBest regards,\nLasse Larsen\nNextview360\nPhone: +45 23 27 07 86`,
      bodyHtml: `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #1d1d1f; line-height: 1.5;">
<p>Dear ${name}</p>
<p>We're pleased to share a visitor report for your virtual tour, ${period}.</p>
<p>Please see the attached PDF.</p>
<p>If you have any questions, or have other spaces that would make sense to showcase with a virtual tour, please don't hesitate to contact us.</p>
<p>Best regards,<br>
<b>Lasse Larsen</b><br>
Nextview360<br>
Phone: +45 23 27 07 86</p>
</div>`,
    };
  }

  return {
    subject: `Besøgsrapport for jeres virtuelle tour – ${currentMonthLabel("DA")}`,
    bodyText: `Kære ${customerName}\n\nVi er nu klar med en besøgsrapport for jeres virtuelle tour, ${period}.\n\nSe vedhæftede PDF\n\nHvis I har nogle spørgsmål, eller har andre lokaler, som giver mening at vise frem med en virtuel tour, så er I meget velkommen til at kontakte os.\n\nMed venlig hilsen\nLasse Larsen\nNextview360\nTlf: 23 27 07 86`,
    bodyHtml: `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #1d1d1f; line-height: 1.5;">
<p>Kære ${name}</p>
<p>Vi er nu klar med en besøgsrapport for jeres virtuelle tour, ${period}.</p>
<p>Se vedhæftede PDF</p>
<p>Hvis I har nogle spørgsmål, eller har andre lokaler, som giver mening at vise frem med en virtuel tour, så er I meget velkommen til at kontakte os.</p>
<p>Med venlig hilsen<br>
<b>Lasse Larsen</b><br>
Nextview360<br>
Tlf: 23 27 07 86</p>
</div>`,
  };
}

function buildCombinedReportEmailText(
  customerName: string,
  interval: ReportInterval | null,
  language: ReportLanguage
): { subject: string; bodyText: string; bodyHtml: string } {
  const name = escapeHtml(customerName);
  const period = periodPhrase(interval, language);

  if (language === "EN") {
    return {
      subject: `Visitor report for your virtual tours – ${currentMonthLabel("EN")}`,
      bodyText: `Dear ${customerName}\n\nWe're pleased to share a combined visitor report covering all your virtual tours, ${period}.\n\nPlease see the attached PDF - it has one section per location.\n\nIf you have any questions, or have other spaces that would make sense to showcase with a virtual tour, please don't hesitate to contact us.\n\nBest regards,\nLasse Larsen\nNextview360\nPhone: +45 23 27 07 86`,
      bodyHtml: `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #1d1d1f; line-height: 1.5;">
<p>Dear ${name}</p>
<p>We're pleased to share a combined visitor report covering all your virtual tours, ${period}.</p>
<p>Please see the attached PDF - it has one section per location.</p>
<p>If you have any questions, or have other spaces that would make sense to showcase with a virtual tour, please don't hesitate to contact us.</p>
<p>Best regards,<br>
<b>Lasse Larsen</b><br>
Nextview360<br>
Phone: +45 23 27 07 86</p>
</div>`,
    };
  }

  return {
    subject: `Besøgsrapport for jeres virtuelle tours – ${currentMonthLabel("DA")}`,
    bodyText: `Kære ${customerName}\n\nVi er nu klar med en samlet besøgsrapport for alle jeres virtuelle tours, ${period}.\n\nSe vedhæftede PDF - den har et afsnit pr. lokation.\n\nHvis I har nogle spørgsmål, eller har andre lokaler, som giver mening at vise frem med en virtuel tour, så er I meget velkommen til at kontakte os.\n\nMed venlig hilsen\nLasse Larsen\nNextview360\nTlf: 23 27 07 86`,
    bodyHtml: `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #1d1d1f; line-height: 1.5;">
<p>Kære ${name}</p>
<p>Vi er nu klar med en samlet besøgsrapport for alle jeres virtuelle tours, ${period}.</p>
<p>Se vedhæftede PDF - den har et afsnit pr. lokation.</p>
<p>Hvis I har nogle spørgsmål, eller har andre lokaler, som giver mening at vise frem med en virtuel tour, så er I meget velkommen til at kontakte os.</p>
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

export type ReportPdfDeal = {
  companyName: string;
  displayName: string | null;
  mpSkinId: string | null;
  reportLanguage: ReportLanguage;
};

/**
 * Just the rendering half of generateAndSendCustomerReport - scrapes
 * explore.nextview360.dk and renders the PDF, with none of the email/Drive-
 * archiving/schedule side effects. Used by the /stats page's "Download PDF"
 * button, which is a plain export a seller can grab on demand and isn't a
 * "send" in any sense that should touch nextReportDueAt or the send history.
 */
export async function generateCustomerReportPdfBuffer(deal: ReportPdfDeal): Promise<Buffer> {
  const mpSkinIds = parseMpSkinIds(deal.mpSkinId);
  if (mpSkinIds.length === 0) throw new Error("Dealen har intet MP-Skin nummer udfyldt.");

  const customerName = deal.displayName || deal.companyName;
  const language = deal.reportLanguage;
  const monthLabel = currentMonthLabel(language);

  const tourData = await fetchMatterportTourData(mpSkinIds);
  const html = buildCustomerReportHtml({
    customerName,
    monthLabel,
    coverImage: tourData.coverImage,
    stats: tourData.stats,
    language,
  });
  return renderCustomerReportPdf(html);
}

/**
 * Just the rendering half of generateAndSendCombinedCustomerReport - one
 * combined PDF (one cover, one stats page per included branch) for a deal
 * and its linked branches, with none of the email/Drive-archiving/schedule
 * side effects. Used by the /stats page's "PDF" button when the deal has
 * linked branches, mirroring how "Send samlet" already offers a combined
 * report for email - the same choice, just for a download instead of a send.
 */
export async function generateCombinedCustomerReportPdfBuffer(
  deal: ReportPdfDeal,
  branches: Pick<ReportPdfDeal, "companyName" | "displayName" | "mpSkinId">[]
): Promise<Buffer> {
  const allDeals = [deal, ...branches];
  const reportableDeals = allDeals.filter((d) => parseMpSkinIds(d.mpSkinId).length > 0);
  if (reportableDeals.length === 0) throw new Error("Ingen af de sammenkoblede deals har et MP-Skin nummer udfyldt.");

  const customerName = deal.displayName || deal.companyName;
  const language = deal.reportLanguage;
  const monthLabel = currentMonthLabel(language);

  const branchReports: CombinedCustomerReportBranch[] = [];
  let coverImage: Buffer | null = null;
  for (const d of reportableDeals) {
    const tourData = await fetchMatterportTourData(parseMpSkinIds(d.mpSkinId));
    branchReports.push({ name: d.displayName || d.companyName, stats: tourData.stats });
    if (!coverImage) coverImage = tourData.coverImage;
  }
  if (!coverImage) throw new Error("Kunne ikke hente et cover-billede for nogen af de sammenkoblede deals.");

  const html = buildCombinedCustomerReportHtml({ customerName, monthLabel, coverImage, language, branches: branchReports });
  return renderCustomerReportPdf(html);
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

    const tourData = await fetchMatterportTourData(mpSkinIds);
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

    await logActivity({
      type: "CUSTOMER_REPORT_SENT",
      message:
        method === "AUTOMATIC"
          ? `Besøgsrapport sendt automatisk til ${dealName(deal)}`
          : `Besøgsrapport sendt til ${dealName(deal)}`,
      dealId: deal.id,
    });

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

/**
 * Same as generateAndSendCustomerReport, but for a linked customer (parent +
 * branches, see the customer-linking feature) whose stats should go out as
 * ONE combined email with ONE PDF - one stats section per included branch -
 * instead of a separate report per branch. `branches` is every OTHER deal
 * being folded into this report (the parent itself is `deal`); each of them
 * keeps its own independent contract/CVR, only the reporting is merged here.
 *
 * The email goes to the parent deal's contact/invoice address; any branch
 * whose own contact/invoice email differs is added as CC, so a branch with
 * its own on-site contact still gets the report even though it's not the
 * primary recipient.
 */
export async function generateAndSendCombinedCustomerReport(
  deal: ReportableDeal,
  branches: ReportableDeal[],
  method: ReportSendMethod,
  existingReportId?: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const allDeals = [deal, ...branches];
    const reportableDeals = allDeals.filter((d) => parseMpSkinIds(d.mpSkinId).length > 0);
    if (reportableDeals.length === 0) throw new Error("Ingen af de sammenkoblede deals har et MP-Skin nummer udfyldt.");

    const recipient = deal.invoiceEmail || deal.contactEmail;
    if (!recipient) throw new Error("Dealen har ingen e-mail at sende rapporten til.");

    const customerName = deal.displayName || deal.companyName;
    const language = deal.reportLanguage;
    const monthLabel = currentMonthLabel(language);

    const pdf = await generateCombinedCustomerReportPdfBuffer(deal, branches);

    const account = await findReportSenderAccount();
    const fileName = `${customerName} - ${language === "EN" ? "combined visitor report" : "samlet besøgsrapport"} ${monthLabel}.pdf`;

    let pdfDriveUrl: string | null = null;
    try {
      const folderId = await findOrCreateCustomerReportsFolder(account);
      const uploaded = await uploadPdfToDrive(account, folderId, fileName, pdf);
      pdfDriveUrl = uploaded.webViewLink;
    } catch (err) {
      console.error("Kunne ikke arkivere samlet besøgsrapport i Google Drev", err);
    }

    const ccEmails = new Set<string>();
    for (const d of allDeals) {
      for (const cc of parseCcEmails(d.reportCcEmails)) ccEmails.add(cc);
      if (d !== deal) {
        const branchEmail = d.invoiceEmail || d.contactEmail;
        if (branchEmail && branchEmail !== recipient) ccEmails.add(branchEmail);
      }
    }

    const emailText = buildCombinedReportEmailText(customerName, deal.reportInterval, language);
    await sendGmailMessage(account, {
      to: [recipient],
      cc: [...ccEmails],
      subject: emailText.subject,
      bodyText: emailText.bodyText,
      bodyHtml: emailText.bodyHtml,
      attachment: { filename: fileName, contentType: "application/pdf", data: pdf },
      fromName: "Nextview360 ApS",
    });

    const branchDealIds = branches.map((b) => b.id).join(",") || null;
    await prisma.$transaction([
      existingReportId
        ? prisma.customerReport.update({
            where: { id: existingReportId },
            data: { status: "SENT", pdfDriveUrl, branchDealIds, errorMessage: null, sentAt: new Date() },
          })
        : prisma.customerReport.create({
            data: { dealId: deal.id, method, status: "SENT", pdfDriveUrl, branchDealIds },
          }),
      // Sending the combined report fulfils the schedule for every included
      // deal, not just the parent - otherwise a branch would still show up
      // as "due" again right away even though its stats just went out.
      ...allDeals.map((d) =>
        prisma.deal.update({ where: { id: d.id }, data: { nextReportDueAt: computeNextReportDueAt(d, method) } })
      ),
    ]);

    await logActivity({
      type: "CUSTOMER_REPORT_SENT",
      message:
        method === "AUTOMATIC"
          ? `Samlet besøgsrapport sendt automatisk til ${dealName(deal)} (${reportableDeals.length} lokationer)`
          : `Samlet besøgsrapport sendt til ${dealName(deal)} (${reportableDeals.length} lokationer)`,
      dealId: deal.id,
    });

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
      console.error("Kunne ikke gemme fejlet samlet besøgsrapport-forsøg", recordErr);
    }
    return { ok: false, error: errorMessage };
  }
}

const REPORTABLE_STAGES = ["FILMED", "LIVE"] as const;

/**
 * Queues every deal whose nextReportDueAt has arrived as a PENDING
 * CustomerReport row - the actual sending happens afterwards via the
 * one-report-at-a-time queue (see processOneQueuedReport/kickCustomerReportQueue),
 * not here, so this returns almost instantly regardless of how many are due.
 */
export async function enqueueScheduledCustomerReports(): Promise<{ queued: number }> {
  if (!(await isIntegrationEnabled("CUSTOMER_REPORTS_AUTO_RUN"))) {
    return { queued: 0 };
  }

  const deals = await prisma.deal.findMany({
    where: {
      reportInterval: { not: null },
      nextReportDueAt: { lte: new Date() },
      mpSkinId: { not: null },
      churnedAt: null,
      stage: { in: [...REPORTABLE_STAGES] },
    },
    select: { id: true },
  });

  if (deals.length > 0) {
    await prisma.customerReport.createMany({
      data: deals.map((d) => ({ dealId: d.id, method: "AUTOMATIC" as const, status: "PENDING" as const })),
    });
  }

  return { queued: deals.length };
}

/**
 * Processes exactly one PENDING CustomerReport (the oldest first) and
 * reports how many are still waiting - the unit of work each invocation of
 * the self-chaining /api/internal/process-customer-reports route performs.
 * Kept to a single report per call so no single request's duration depends
 * on how many are queued: a batch of 3 and a batch of 30 both process at the
 * same safe, bounded pace, one after another, instead of one request trying
 * (and risking a timeout) to get through all of them at once.
 */
export async function processOneQueuedReport(): Promise<{ processed: boolean; remaining: number }> {
  const report = await prisma.customerReport.findFirst({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    include: { deal: true },
  });

  if (!report) return { processed: false, remaining: 0 };

  if (report.branchDealIds) {
    const branchIds = report.branchDealIds.split(",").filter(Boolean);
    const branches = await prisma.deal.findMany({ where: { id: { in: branchIds } } });
    await generateAndSendCombinedCustomerReport(report.deal, branches, report.method, report.id);
  } else {
    await generateAndSendCustomerReport(report.deal, report.method, report.id);
  }

  const remaining = await prisma.customerReport.count({ where: { status: "PENDING" } });
  return { processed: true, remaining };
}

/**
 * Fires (without blocking on the result) the internal route that processes
 * one queued report and re-triggers itself while more remain - a real HTTP
 * call rather than an in-process loop, so each report is processed by its
 * own fresh serverless invocation with a full, un-eaten-into maxDuration
 * budget. Call this once after queuing new PENDING rows (or to nudge a
 * stalled queue) - it's a no-op if nothing is PENDING.
 */
export async function kickCustomerReportQueue(): Promise<void> {
  try {
    const secret = process.env.CRON_SECRET;
    await fetch(`${getAppBaseUrl()}/api/internal/process-customer-reports`, {
      method: "POST",
      headers: secret ? { Authorization: `Bearer ${secret}` } : undefined,
    });
  } catch (err) {
    console.error("Kunne ikke starte kø for besøgsrapporter", err);
  }
}
