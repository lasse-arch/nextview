import { PDFDocument } from "pdf-lib";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { fetchMatterportTourData } from "@/lib/explore-matterport";
import {
  COLLECT_BUDGET_MS,
  SEND_STEP_MIN_REMAINING_MS,
  collectCombinedReportData,
  generateCustomerReportPdfBuffer,
  generateCombinedCustomerReportPdfBuffer,
  type CollectedDataStore,
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

/** Just past the processing route's own 300s maxDuration - a claim older
 * than this belongs to a step that was cut off. */
const CLAIM_EXPIRES_AFTER_MS = 6 * 60 * 1000;

/** What a multi-deal download has done so far: the deals already merged
 * into pdfData, and the ones that failed (with the last error). */
type MergeProgress = { done: string[]; failed: string[]; lastError?: string };

/**
 * A step that was cut off (it ran past the time limit, or a deployment went
 * live mid-run) leaves its job claimed - it's failed, so it can't block the
 * downloads queued after it. Each step saves as it goes and stays far
 * inside the limit, so this only happens if a single tour hangs.
 */
async function failAbandonedClaims(): Promise<void> {
  await prisma.reportDownloadJob.updateMany({
    where: { status: "PENDING", claimedAt: { lt: new Date(Date.now() - CLAIM_EXPIRES_AFTER_MS) } },
    data: { status: "FAILED", claimedAt: null, errorMessage: "Afbrudt undervejs - prøv igen." },
  });
}

/** Takes the oldest waiting job - one at a time, like the send queue. */
async function claimNextJob() {
  await failAbandonedClaims();
  if (await prisma.reportDownloadJob.count({ where: { status: "PENDING", claimedAt: { not: null } } })) return null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const next = await prisma.reportDownloadJob.findFirst({
      where: { status: "PENDING", claimedAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!next) return null;
    const claimed = await prisma.reportDownloadJob.updateMany({
      where: { id: next.id, status: "PENDING", claimedAt: null },
      data: { claimedAt: new Date() },
    });
    if (claimed.count === 1) return prisma.reportDownloadJob.findUniqueOrThrow({ where: { id: next.id } });
  }
  return null;
}

/**
 * One step of the oldest PENDING ReportDownloadJob. Each step stays well
 * inside the route's time limit - a combined report gathers its locations'
 * stats a few at a time (collectCombinedReportData, as when sending), and a
 * multi-deal download renders a few deals per step, merging each into the
 * job's PDF as it goes - so a big download takes several steps instead of
 * one request that runs out of time (which used to leave the job waiting
 * forever, blocking every download after it).
 */
export async function processOneQueuedDownloadJob(
  // Swappable in tests (no real tour scraping).
  deps = {
    fetchTour: fetchMatterportTourData,
    singlePdf: generateCustomerReportPdfBuffer,
    budgetMs: COLLECT_BUDGET_MS,
  }
): Promise<{ processed: boolean; remaining: number }> {
  const job = await claimNextJob();
  if (!job) return { processed: false, remaining: 0 };

  const started = Date.now();
  const dealIds = job.dealIds.split(",").filter(Boolean);
  let finished = false;

  try {
    if (job.combined && dealIds.length === 1) {
      const parent = await prisma.deal.findUnique({
        where: { id: dealIds[0] },
        include: { branches: { select: { id: true, companyName: true, displayName: true, mpSkinId: true, reportLanguage: true } } },
      });
      if (!parent) throw new Error("Dealen findes ikke.");

      const store: CollectedDataStore = {
        load: async () =>
          (await prisma.reportDownloadJob.findUniqueOrThrow({ where: { id: job.id }, select: { collectedData: true } }))
            .collectedData,
        save: async (collectedData) => {
          await prisma.reportDownloadJob.update({ where: { id: job.id }, data: { collectedData } });
        },
      };
      const collected = await collectCombinedReportData(store, parent, parent.branches, started, deps.fetchTour, deps.budgetMs);
      if (collected.complete && (!collected.fetchedNow || Date.now() - started < SEND_STEP_MIN_REMAINING_MS)) {
        const pdf = await generateCombinedCustomerReportPdfBuffer(parent, parent.branches, collected.data);
        const fileName = `Besøgsrapport ${dealName(parent)} (samlet) ${currentMonthLabel(parent.reportLanguage)}.pdf`;
        await prisma.reportDownloadJob.update({
          where: { id: job.id },
          data: { status: "READY", pdfData: new Uint8Array(pdf), fileName, collectedData: Prisma.DbNull, claimedAt: null, errorMessage: null },
        });
        finished = true;
      }
    } else {
      const deals = await prisma.deal.findMany({
        where: { id: { in: dealIds } },
        select: { id: true, companyName: true, displayName: true, mpSkinId: true, reportLanguage: true },
      });
      const progress: MergeProgress = (job.collectedData as MergeProgress | null) ?? { done: [], failed: [] };
      let pdfData: Buffer | null = job.pdfData ? Buffer.from(job.pdfData) : null;

      let renderedNow = false;
      for (const deal of deals) {
        if (progress.done.includes(deal.id) || progress.failed.includes(deal.id)) continue;
        if (renderedNow && Date.now() - started > deps.budgetMs) break;
        renderedNow = true;
        try {
          const pdf = await deps.singlePdf(deal);
          pdfData = pdfData ? await mergePdfs(pdfData, pdf) : pdf;
          progress.done.push(deal.id);
        } catch (err) {
          console.error(`Kunne ikke generere besøgsrapport-PDF for ${dealName(deal)}`, err);
          progress.failed.push(deal.id);
          progress.lastError = err instanceof Error ? err.message : undefined;
        }
        await prisma.reportDownloadJob.update({
          where: { id: job.id },
          data: { collectedData: progress, ...(pdfData ? { pdfData: new Uint8Array(pdfData) } : {}) },
        });
      }

      if (deals.every((d) => progress.done.includes(d.id) || progress.failed.includes(d.id))) {
        if (!pdfData || progress.done.length === 0) {
          throw new Error(
            progress.lastError
              ? `Ingen af de valgte kunder kunne hente statistik. Sidste fejl: ${progress.lastError}`
              : "Ingen af de valgte kunder har et gyldigt MP-Skin nummer, eller PDF-generering fejlede."
          );
        }
        const only = progress.done.length === 1 && deals.length === 1 ? deals[0] : null;
        const fileName = only
          ? `Besøgsrapport ${dealName(only)} ${currentMonthLabel(only.reportLanguage)}.pdf`
          : `Besøgsrapporter ${currentMonthLabel("DA")}.pdf`;
        await prisma.reportDownloadJob.update({
          where: { id: job.id },
          data: { status: "READY", fileName, collectedData: Prisma.DbNull, claimedAt: null, errorMessage: null },
        });
        finished = true;
      }
    }
    // Not done yet: back to the queue, which carries on in a fresh request.
    if (!finished) await prisma.reportDownloadJob.update({ where: { id: job.id }, data: { claimedAt: null } });
  } catch (err) {
    console.error(`Kunne ikke generere PDF for download-job ${job.id}`, err);
    await prisma.reportDownloadJob.update({
      where: { id: job.id },
      data: { status: "FAILED", claimedAt: null, errorMessage: err instanceof Error ? err.message : "Ukendt fejl." },
    });
  }

  const remaining = await prisma.reportDownloadJob.count({ where: { status: "PENDING" } });
  return { processed: true, remaining };
}

async function mergePdfs(first: Buffer, next: Buffer): Promise<Buffer> {
  const merged = await PDFDocument.load(first);
  const doc = await PDFDocument.load(next);
  const pages = await merged.copyPages(doc, doc.getPageIndices());
  pages.forEach((page) => merged.addPage(page));
  return Buffer.from(await merged.save());
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
