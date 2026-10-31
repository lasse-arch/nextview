import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { publicWebUrl } from "@/lib/public-host";
import { cached } from "@/lib/site-digest";
import { previewSuggestion, tourPoster, type Placement } from "@/lib/site-placement";
import { placementAccess, siteKey } from "../access";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Pictures per person an hour (each is two page loads in a browser) - in this instance; the kept ones are free. */
const PER_HOUR = 24;
const asks = new Map<string, number[]>();

/*
 * POST { slug, site, lang, i } → pictures of suggestion i (from the analysis
 * already made and kept - the page and the spot come from there, never from
 * the request): their page with the tour drawn in, on a computer and a phone.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { slug?: unknown; site?: unknown; lang?: unknown; i?: unknown } | null;
  const access = await placementAccess(request, body?.slug);
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  const lang = body?.lang === "en" ? "en" : "da";
  const site = typeof body?.site === "string" && body.site.length < 300 ? await publicWebUrl(body.site) : null;
  const i = typeof body?.i === "number" && Number.isInteger(body.i) ? body.i : -1;
  const kept = site ? await prisma.siteCache.findUnique({ where: { url: `placement:v1:${access.slug}:${lang}:${siteKey(site)}` } }) : null;
  const s = kept ? (JSON.parse(kept.text) as Placement).suggestions[i] : undefined;
  if (!site || !s) return NextResponse.json({ error: "Find stederne først." }, { status: 404 });

  const key = `placement-shot:v1:${access.slug}:${lang}:${siteKey(site)}:${i}:${kept!.fetchedAt.getTime()}`;
  const have = await prisma.siteCache.findUnique({ where: { url: key }, select: { fetchedAt: true } });
  if (!have) {
    const now = Date.now();
    const mine = (asks.get(access.who) ?? []).filter((t) => now - t < 3_600_000);
    if (mine.length >= PER_HOUR) return NextResponse.json({ error: lang === "en" ? "Too many pictures this hour - try again later." : "For mange billeder på en time - prøv igen senere." }, { status: 429 });
    if (asks.size > 5000) asks.clear();
    asks.set(access.who, [...mine, now]);
  }
  try {
    const text = await cached(
      key,
      async () => {
        const poster = await cached(`placement-poster:v1:${access.slug}`, async () => (await tourPoster(access.T).catch(() => null)) ?? "", 7);
        return JSON.stringify(await previewSuggestion(access.T, s, poster || null, lang));
      },
      1
    );
    return NextResponse.json(JSON.parse(text));
  } catch (err) {
    console.error("placement shot", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: lang === "en" ? "The picture couldn't be made." : "Billedet kunne ikke laves." }, { status: 502 });
  }
}
