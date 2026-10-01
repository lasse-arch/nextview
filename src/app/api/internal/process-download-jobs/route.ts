import { NextResponse, type NextRequest } from "next/server";
import { after } from "next/server";
import { processOneQueuedDownloadJob, kickDownloadJobQueue } from "@/lib/report-download-service";

// Same reasoning as process-customer-reports: one report's own scrape + PDF
// render easily takes 30-60+ seconds, and this route only ever processes one
// job per invocation (see processOneQueuedDownloadJob).
export const maxDuration = 300;

/**
 * Processes exactly one queued PDF download, then - if more are still
 * waiting - triggers a fresh invocation of itself to pick up the next one.
 * Mirrors process-customer-reports/route.ts exactly, just for the download
 * queue instead of the send queue.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await processOneQueuedDownloadJob();

  if (result.remaining > 0) {
    after(() => kickDownloadJobQueue());
  }

  return NextResponse.json(result);
}
