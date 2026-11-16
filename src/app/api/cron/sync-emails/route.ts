import { cronAuthorized } from "@/lib/cron-auth";
import { NextResponse, type NextRequest } from "next/server";
import { syncDealEmails } from "@/lib/email-sync-service";
import { resealEmailTokens } from "@/lib/google-calendar";

export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Gmail tokens still in plain text (from before they were encrypted) are sealed first.
  const sealed = await resealEmailTokens().catch((err) => (console.error("resealEmailTokens", err instanceof Error ? err.message : err), 0));
  const summary = await syncDealEmails();
  return NextResponse.json({ ...summary, sealed });
}
