import { cronAuthorized } from "@/lib/cron-auth";
import { NextResponse, type NextRequest } from "next/server";
import { runAutoFollowUp } from "@/lib/deal-pipeline-service";
import { sendDueFilmingAsks } from "@/lib/filming-ask-mail";

/** Runs daily - a pure pipeline-hygiene job with no billing dependency, so
 * unlike the Dinero cron it isn't gated behind any integration toggle. */
export async function GET(request: NextRequest) {

  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const summary = await runAutoFollowUp();
  // The mail asking for dates to film, 24 hours after a signature (also checked while the team uses Arpo).
  const filmingAsks = await sendDueFilmingAsks().catch(() => 0);
  return NextResponse.json({ ...summary, filmingAsks });
}
