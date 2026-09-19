import { NextResponse, type NextRequest } from "next/server";
import { runQuarterlyInvoiceGeneration, runAutoChurn, checkAllPendingPayments } from "@/lib/invoice-service";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Bill any final due period up to a deal's contract end date before
  // churning it, so churn never pre-empts the last invoice.
  const summary = await runQuarterlyInvoiceGeneration();
  const churn = await runAutoChurn();
  const payments = await checkAllPendingPayments();
  return NextResponse.json({ ...summary, ...churn, payments });
}
