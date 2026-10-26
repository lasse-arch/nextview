import { NextResponse, type NextRequest } from "next/server";
import { createBackup } from "@/lib/backup";

// The whole database is read and packed in one go.
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const querySecret = request.nextUrl.searchParams.get("secret");
  const authorized = secret && (authHeader === `Bearer ${secret}` || querySecret === secret);
  if (!authorized) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await createBackup();
  // The URL stays out of the response - the file is encrypted, but there's no reason to hand it out.
  return NextResponse.json(result.ok ? { ...result, url: undefined } : result, { status: result.ok ? 200 : 500 });
}
