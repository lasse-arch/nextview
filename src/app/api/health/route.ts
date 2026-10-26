import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/*
 * For an uptime monitor (e.g. UptimeRobot or Better Stack, every few
 * minutes): 200 when Arpo and its database answer, 503 when the database
 * doesn't. `dbMs` is one round trip to the database from where Arpo runs
 * (`region`) - a high number means the two are far apart.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    const first = Date.now() - started;
    const again = Date.now();
    await prisma.$queryRawUnsafe("SELECT 1");
    return NextResponse.json({ ok: true, db: "ok", dbMs: Date.now() - again, firstMs: first, region: process.env.VERCEL_REGION ?? null }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, db: "down", region: process.env.VERCEL_REGION ?? null }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
