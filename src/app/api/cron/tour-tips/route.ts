import { NextResponse, type NextRequest } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { prisma } from "@/lib/db";
import { tourStats } from "@/lib/tour-stats";
import { runTourInsights } from "@/lib/tour-insights-core";
import { ringBell } from "@/lib/team-notifications";
import type { TourConfig } from "@/app/arpo/tour-lab/tours/types";

/*
 * Tips that come by themselves: once a month for each published tour with
 * enough visits, nextviewAI reads its numbers (what leads on to booking, where
 * people stop, where they look) and writes a few concrete tips. They're kept
 * (Resultater shows them) and the admins get a notification in the bell.
 * Runs daily, a few tours at a time, so each run stays short.
 */

export const maxDuration = 300;

/** At least this many visits in the last 60 days - fewer and the numbers can't be trusted. */
const MIN_VISITS = 40;
/** A tour gets new tips at most this often. */
const EVERY_DAYS = 28;
const PER_RUN = 3;

export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const since = new Date(Date.now() - EVERY_DAYS * 86_400_000);
  const tours = await prisma.tour.findMany({ where: { published: true }, select: { slug: true, name: true, config: true } });
  const recent = new Set((await prisma.tourTipRun.findMany({ where: { createdAt: { gte: since } }, select: { tourSlug: true } })).map((r) => r.tourSlug));
  const done: string[] = [];
  const skipped: string[] = [];
  for (const t of tours) {
    if (done.length >= PER_RUN) break;
    if (recent.has(t.slug)) continue;
    const stats = await tourStats(t.slug, 60).catch(() => null);
    if (!stats || stats.visits < MIN_VISITS) continue;
    const r = await runTourInsights(t.slug, t.config as unknown as TourConfig, "nextviewAI (månedlige forslag)");
    if (!r.ok) {
      skipped.push(`${t.slug}: ${r.error}`);
      continue;
    }
    await prisma.tourTipRun.create({ data: { tourSlug: t.slug, summary: r.summary, suggestions: r.suggestions, visits: r.visits, source: "auto" } });
    await ringBell({
      kind: "tips",
      title: `${r.suggestions.length} forslag til ${t.name}`,
      text: r.suggestions.map((s) => s.title).join(", "),
      href: `/arpo/tour-lab/${t.slug}/rediger?fane=resultater`,
      tourSlug: t.slug,
      audience: "admin",
    });
    done.push(t.slug);
  }
  return NextResponse.json({ done, skipped });
}
