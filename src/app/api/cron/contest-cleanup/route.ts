import { cronAuthorized } from "@/lib/cron-auth";
import { NextResponse, type NextRequest } from "next/server";
import { deleteOldContestEntries } from "@/lib/tour-contest";

/** Daily: the Skattejagt lists whose time is up are deleted (see lib/tour-contest.ts). */
export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true, deleted: await deleteOldContestEntries() });
}
