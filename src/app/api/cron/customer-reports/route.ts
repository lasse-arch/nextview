import { NextResponse, type NextRequest } from "next/server";
import { runScheduledCustomerReports } from "@/lib/customer-report-service";

// Scraping + PDF rendering + emailing per due deal easily takes 30-60+
// seconds each, and this loops over every deal due that day sequentially -
// give it real headroom instead of the framework's short default.
export const maxDuration = 300;

/** Runs daily (like the Dinero cron) - most days this finds nothing due,
 * since reports only go out monthly/bimonthly/quarterly per deal. */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const summary = await runScheduledCustomerReports();
  return NextResponse.json(summary);
}
