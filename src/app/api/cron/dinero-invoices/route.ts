import { NextResponse, type NextRequest } from "next/server";
import { runQuarterlyInvoiceGeneration, runAutoChurn, checkAllPendingPayments } from "@/lib/invoice-service";
import { isIntegrationEnabled } from "@/lib/integration-settings";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (secret && authHeader !== `Bearer ${secret}`) {
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
  const summary = await runQuarterlyInvoiceGeneration();
  const churn = await runAutoChurn();
  const payments = await checkAllPendingPayments();
  return NextResponse.json({ ...summary, ...churn, payments });
}
