import { PDFDocument } from "pdf-lib";
import { prisma } from "@/lib/db";
import {
  generateCustomerReportPdfBuffer,
  generateCombinedCustomerReportPdfBuffer,
  type ReportPdfDeal,
} from "@/lib/customer-report-service";
import { currentMonthLabel } from "@/lib/customer-report-template";
import { getAppBaseUrl } from "@/lib/email-oauth";
import { dealName } from "@/lib/labels";

/**
 * Background queue for "Download PDF" on /stats - same one-at-a-time
 * pattern as CustomerReport's send queue (see customer-report-service.ts's
 * processOneQueuedReport/kickCustomerReportQueue), for the same reason: one
 * report's own Matterport/explore.nextview360.dk scrape can take a minute or
 * more, so a bulk "download all" doing this synchronously inside a single
 * request risks the route's maxDuration. Queuing it instead means the click
 * returns instantly and the browser just polls for the finished file,
 * whatever it ends up taking.
 */

/** Creates a PENDING job and returns its id - the caller is responsible for
 * kicking the queue (via `after(() => kickDownloadJobQueue())`), same
 * division of labor as the send flow. */
export async function requestReportDownload(
  dealIds: string[],
  combined: boolean,
  createdById: string
): Promise<{ jobId: string }> {
  const job = await prisma.reportDownloadJob.create({
    data: { dealIds: dealIds.join(","), combined, createdById, status: "PENDING" },
  });
  return { jobId: job.id };
}

/**
 * Processes exactly one PENDING ReportDownloadJob (oldest first) - mirrors
 * the single/combined/bulk-merge logic that used to live directly in
 * /api/stats/download-report/route.ts before downloads moved to this queue.
 */
export async function processOneQueuedDownloadJob(): Promise<{ processed: boolean; remaining: number }> {
  const job = await prisma.reportDownloadJob.findFirst({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
  });
  if (!job) return { processed: false, remaining: 0 };

  const dealIds = job.dealIds.split(",").filter(Boolean);

  try {
    if (job.combined && dealIds.length === 1) {
      const parent = await prisma.deal.findUnique({
        where: { id: dealIds[0] },
        include: { branches: { select: { companyName: true, displayName: true, mpSkinId: true } } },
      });
      if (!parent) throw new Error("Dealen findes ikke.");

      const pdf = await generateCombinedCustomerReportPdfBuffer(parent, parent.branches);
      const fileName = `Besøgsrapport ${dealName(parent)} (samlet) ${currentMonthLabel(parent.reportLanguage)}.pdf`;
      await prisma.reportDownloadJob.update({
        where: { id: job.id },
        data: { status: "READY", pdfData: new Uint8Array(pdf), fileName },
      });
    } else {
      const deals = await prisma.deal.findMany({
        where: { id: { in: dealIds } },
        select: { id: true, companyName: true, displayName: true, mpSkinId: true, reportLanguage: true },
      });

      const pdfBuffers: Buffer[] = [];
      let lastError: unknown;
      for (const deal of deals as ReportPdfDeal[] & { id: string }[]) {
        try {
          pdfBuffers.push(await generateCustomerReportPdfBuffer(deal));
        } catch (err) {
          console.error(`Kunne ikke generere besøgsrapport-PDF for ${dealName(deal)}`, err);
          lastError = err;
        }
      }

      if (pdfBuffers.length === 0) {
        const detail = lastError instanceof Error ? lastError.message : null;
        throw new Error(
          detail
            ? `Ingen af de valgte kunder kunne hente statistik. Sidste fejl: ${detail}`
            : "Ingen af de valgte kunder har et gyldigt MP-Skin nummer, eller PDF-generering fejlede."
        );
      }

      let finalBytes: Buffer;
      if (pdfBuffers.length === 1) {
        finalBytes = pdfBuffers[0];
      } else {
        const merged = await PDFDocument.create();
        for (const buffer of pdfBuffers) {
          const doc = await PDFDocument.load(buffer);
          const pages = await merged.copyPages(doc, doc.getPageIndices());
          pages.forEach((page) => merged.addPage(page));
        }
        finalBytes = Buffer.from(await merged.save());
      }

      const fileName =
        pdfBuffers.length === 1 && deals.length === 1
          ? `Besøgsrapport ${dealName(deals[0])} ${currentMonthLabel(deals[0].reportLanguage)}.pdf`
          : `Besøgsrapporter ${currentMonthLabel("DA")}.pdf`;

      await prisma.reportDownloadJob.update({
        where: { id: job.id },
        data: { status: "READY", pdfData: new Uint8Array(finalBytes), fileName },
      });
    }
  } catch (err) {
    console.error(`Kunne ikke generere PDF for download-job ${job.id}`, err);
    await prisma.reportDownloadJob.update({
      where: { id: job.id },
      data: { status: "FAILED", errorMessage: err instanceof Error ? err.message : "Ukendt fejl." },
    });
  }

  const remaining = await prisma.reportDownloadJob.count({ where: { status: "PENDING" } });
  return { processed: true, remaining };
}

/** Fires (without blocking on the result) the internal route that processes
 * one queued download job and re-triggers itself while more remain - same
 * pattern as kickCustomerReportQueue. */
export async function kickDownloadJobQueue(): Promise<void> {
  try {
    const secret = process.env.CRON_SECRET;
    await fetch(`${getAppBaseUrl()}/api/internal/process-download-jobs`, {
      method: "POST",
      headers: secret ? { Authorization: `Bearer ${secret}` } : undefined,
    });
  } catch (err) {
    console.error("Kunne ikke starte kø for PDF-downloads", err);
  }
}

/** Deletes a job's row once its file has been downloaded, or if it's old
 * enough to be abandoned (a tab closed before ever polling for it) - the
 * stored PDF bytes are only ever meant to be picked up once, shortly after
 * generation, not retained indefinitely. */
export async function cleanupOldDownloadJobs(): Promise<void> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await prisma.reportDownloadJob.deleteMany({ where: { createdAt: { lt: cutoff } } });
}
