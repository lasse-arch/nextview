import { cronAuthorized } from "@/lib/cron-auth";
import { NextResponse, type NextRequest, after } from "next/server";
import { enqueueScheduledCustomerReports, kickCustomerReportQueue } from "@/lib/customer-report-service";
import { cleanupOldDownloadJobs } from "@/lib/report-download-service";

/** Runs daily (like the Dinero cron) - most days this finds nothing due,
 * since reports only go out monthly/bimonthly/quarterly per deal. Only
 * queues the due reports here; the actual sending happens via the
 * self-chaining /api/internal/process-customer-reports route, one report at
 * a time, so this returns instantly no matter how many are due today.
 * Kicking the queue unconditionally (not just when something new was queued)
 * also gives any report stuck PENDING from an earlier interrupted run a
 * daily chance to resume, without any separate retry mechanism. */
export async function GET(request: NextRequest) {

  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await enqueueScheduledCustomerReports();
  after(() => kickCustomerReportQueue());
  after(() => cleanupOldDownloadJobs());
  return NextResponse.json(result);
}
