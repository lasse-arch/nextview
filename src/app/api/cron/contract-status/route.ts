import { cronAuthorized } from "@/lib/cron-auth";
import { NextResponse, type NextRequest } from "next/server";
import { isDocuSealConfigured } from "@/lib/docuseal";
import { syncWaitingContracts } from "@/lib/contract-sync";

/** Daily: contracts still waiting are checked with DocuSeal - a signature whose webhook never arrived is caught here. */
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (!cronAuthorized(request))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await isDocuSealConfigured()))
    return NextResponse.json({ ok: true, skipped: "DocuSeal er ikke sat op" });
  return NextResponse.json({ ok: true, ...(await syncWaitingContracts()) });
}
