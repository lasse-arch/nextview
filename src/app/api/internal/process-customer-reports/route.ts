import { NextResponse, type NextRequest } from "next/server";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { processOneQueuedReport, kickCustomerReportQueue } from "@/lib/customer-report-service";

// One report's own scrape + PDF render + email easily takes 30-60+ seconds -
// comfortable headroom for a single one, which is all this route ever does
// per invocation (see processOneQueuedReport).
export const maxDuration = 300;

/**
 * Processes exactly one queued visitor-stats report, then - if more are
 * still waiting - triggers a fresh invocation of itself to pick up the next
 * one. This is what lets a bulk "Send nu" for many customers (or the daily
 * automatic run) work through an arbitrarily large queue without any single
 * request's duration growing with the queue size: 3 queued or 30 queued both
 * process at the same steady, bounded pace instead of one request looping
 * through the whole batch and risking a timeout partway through.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await processOneQueuedReport();

  // Only the worker that just processed a report chains on - one that found
  // another worker busy leaves the queue to that worker, so there is only
  // ever one chain running.
  if (result.processed && result.remaining > 0) {
    after(() => kickCustomerReportQueue());
  }

  revalidatePath("/stats");
  return NextResponse.json(result);
}
