import { NextResponse, type NextRequest } from "next/server";
import { runScheduledCustomerReports } from "@/lib/customer-report-service";

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
