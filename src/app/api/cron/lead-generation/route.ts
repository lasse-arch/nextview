import { NextResponse, type NextRequest } from "next/server";
import { runAllEnabledLeadFilters, runAllEnabledWatchedUrls } from "@/lib/lead-generation-service";

// Filters and watched URLs each run one at a time with a pause in between
// (see lead-generation-service.ts) rather than in parallel, so this can take
// a while if there are several - well within the daily cadence this only
// needs to run at.
export const maxDuration = 300;

/** Runs daily - re-runs every enabled LeadFilter and WatchedUrl, queuing any newly-found companies. */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [filters, watchedUrls] = await Promise.all([runAllEnabledLeadFilters(), runAllEnabledWatchedUrls()]);
  return NextResponse.json({ filters, watchedUrls });
}
