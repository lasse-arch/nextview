import { cronAuthorized } from "@/lib/cron-auth";
import { NextResponse, type NextRequest } from "next/server";
import { runQuarterlyInvoiceGeneration, runAutoChurn, checkAllPendingPayments } from "@/lib/invoice-service";
import { isIntegrationEnabled } from "@/lib/integration-settings";
import { syncAllFixedTermEnds } from "@/lib/fixed-term";

export async function GET(request: NextRequest) {

  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // The automatic daily run can be turned off independently of manual
  // triggers ("Kør nu" / "Opret faktura-kladde" on a deal), which always
  // work regardless of this setting.
  const autoRunEnabled = await isIntegrationEnabled("DINERO_AUTO_RUN");
  if (!autoRunEnabled) {
    return NextResponse.json({ skipped: true, reason: "Automatisk kørsel er slået fra" });
  }

  // Bill any final due period up to a deal's contract end date before
  // churning it, so churn never pre-empts the last invoice.
  // Contracts that end with their binding period: their end dates first, so no invoice goes past it.
  const fixedTerms = await syncAllFixedTermEnds().catch(() => 0);
  const summary = await runQuarterlyInvoiceGeneration();
  const churn = await runAutoChurn();
  const payments = await checkAllPendingPayments();
  return NextResponse.json({ ...summary, ...churn, payments, fixedTerms });
}
