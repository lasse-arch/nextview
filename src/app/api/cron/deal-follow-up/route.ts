import { cronAuthorized } from "@/lib/cron-auth";
import { NextResponse, type NextRequest } from "next/server";
import { runAutoFollowUp } from "@/lib/deal-pipeline-service";

/** Runs daily - a pure pipeline-hygiene job with no billing dependency, so
 * unlike the Dinero cron it isn't gated behind any integration toggle. */
export async function GET(request: NextRequest) {

  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const summary = await runAutoFollowUp();
  return NextResponse.json(summary);
}
