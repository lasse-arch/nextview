import { cronAuthorized } from "@/lib/cron-auth";
import { NextResponse, type NextRequest } from "next/server";
import { deleteOldVisitorData } from "@/lib/visitor-data-retention";

/** Daily: the Skattejagt lists whose time is up go - and anything from the tours' visitors older than 12 months (lib/visitor-data-retention.ts). */
export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true, deleted: await deleteOldVisitorData() });
}
