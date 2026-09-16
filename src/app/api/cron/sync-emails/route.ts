import { NextResponse, type NextRequest } from "next/server";
import { syncInboundEmails } from "@/lib/email-sync-service";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const querySecret = request.nextUrl.searchParams.get("secret");
  const authorized = secret && (authHeader === `Bearer ${secret}` || querySecret === secret);
  if (!authorized) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const summary = await syncInboundEmails();
  return NextResponse.json(summary);
}
