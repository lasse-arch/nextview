import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { publicWebUrl } from "@/lib/public-host";
import { cached } from "@/lib/site-digest";
import { analyzeSite, type Placement } from "@/lib/site-placement";
import { placementAccess, siteKey } from "./access";

export const runtime = "nodejs";
export const maxDuration = 120;

/** New analyses per person an hour (one already made for the same site is free - kept a day). */
const PER_HOUR = 6;

/*
 * POST { slug, site, lang } → where on their website the tour should sit
 * (see site-placement.ts). Read-only towards their site; the answer is kept
 * a day, so asking again costs nothing.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { slug?: unknown; site?: unknown; lang?: unknown } | null;
  const access = await placementAccess(request, body?.slug);
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  const lang = body?.lang === "en" ? "en" : "da";
  const site = typeof body?.site === "string" && body.site.length < 300 ? await publicWebUrl(body.site) : null;
  if (!site) return NextResponse.json({ error: lang === "en" ? "Write the address of your website, e.g. yoursite.com." : "Skriv adressen på jeres hjemmeside, fx jeresside.dk." }, { status: 400 });

  const key = `placement:v1:${access.slug}:${lang}:${siteKey(site)}`;
  const kept = await prisma.siteCache.findUnique({ where: { url: key } });
  if (!kept || Date.now() - kept.fetchedAt.getTime() > 86_400_000) {
    const recent = await prisma.tourAiUsage.count({ where: { kind: "placement", userName: access.who, createdAt: { gt: new Date(Date.now() - 3_600_000) } } });
    if (recent >= PER_HOUR) return NextResponse.json({ error: lang === "en" ? "That's a lot of looks in one hour - try again a little later." : "Det er mange forsøg på en time - prøv igen lidt senere." }, { status: 429 });
  }
  try {
    const text = await cached(key, async () => JSON.stringify(await analyzeSite(access.T, access.slug, site, lang, access.who)), 1);
    const placement = JSON.parse(text) as Placement;
    return NextResponse.json(placement);
  } catch (err) {
    console.error("placement", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: lang === "en" ? "We couldn't read the website. Check the address and try again." : "Vi kunne ikke læse hjemmesiden. Tjek adressen, og prøv igen." }, { status: 502 });
  }
}
