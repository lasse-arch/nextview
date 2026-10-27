import { NextResponse } from "next/server";
import sharp from "sharp";
import { getCurrentCustomer, getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fetchModelInfo, modelIdsIn } from "@/lib/matterport-graph";
import { fetchMpskinsCfg } from "@/lib/mpskins";
import type { TourConfig } from "@/app/arpo/tour-lab/tours/types";

/*
 * The picture on a card in "Online kunder": the Matterport model's own hero
 * photo. Asked for by id (an Arpo tour's slug or a deal item), never by a
 * link - so it can only look up our own tours. The team, or a customer for
 * their own tours (on their customer page). Made once and kept in the
 * database (TourThumb), so a page of cards doesn't ask Matterport each time.
 */

/** How long a kept picture is used before it's made again (the model's photo can change) - and a "no picture" checked again. */
const KEEP_MS = 30 * 86_400_000;
const NONE_MS = 3_600_000;
export async function GET(req: Request) {
  const user = await getCurrentUser();
  const customer = user ? null : await getCurrentCustomer();
  if (!user && !customer) return new NextResponse(null, { status: 401 });
  const mine = (dealId: string | null | undefined) => Boolean(user) || Boolean(dealId && customer?.deals.some((d) => d.dealId === dealId));
  const q = new URL(req.url).searchParams;
  let modelId: string | null = null;
  const slug = q.get("tour");
  const item = q.get("item");
  const width = Math.min(640, Math.max(96, Number(q.get("w")) || 160));
  const key = slug ? `tour:${slug}:${width}` : item ? `item:${item}:${width}` : null;
  if (!key) return new NextResponse(null, { status: 404 });
  // Who may see it first - then the kept picture, if there is a fresh one.
  const owner = slug
    ? await prisma.tour.findUnique({ where: { slug }, select: { config: true, dealId: true } })
    : await prisma.dealItem.findUnique({ where: { id: item! }, select: { url: true, dealId: true } });
  if (!owner || !mine(owner.dealId)) return new NextResponse(null, { status: 404 });
  const kept = await prisma.tourThumb.findUnique({ where: { key } });
  if (kept && Date.now() - kept.createdAt.getTime() < (kept.data ? KEEP_MS : NONE_MS)) {
    if (!kept.data) return new NextResponse(null, { status: 404, headers: { "Cache-Control": "private, max-age=3600" } });
    return new NextResponse(new Uint8Array(kept.data), { headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=604800" } });
  }
  if (slug) {
    const tour = owner as { config: unknown; dealId: string | null };
    const config = tour?.config as unknown as TourConfig | undefined;
    modelId = config?.modelId ?? (config?.tourPage ? ((await fetchMpskinsCfg(config.tourPage).catch(() => null))?.mpModel ?? null) : null);
  } else {
    const row = owner as { url: string | null; dealId: string };
    if (row.url) {
      const url = /^https?:\/\//i.test(row.url) ? row.url : `https://${row.url}`;
      modelId = modelIdsIn(url)[0] ?? (await fetchMpskinsCfg(url).catch(() => null))?.mpModel ?? null;
    }
  }
  const image = modelId ? (await fetchModelInfo(modelId))?.image : null;
  const keep = (data: Buffer | null) =>
    prisma.tourThumb.upsert({ where: { key }, create: { key, data: data ? new Uint8Array(data) : null }, update: { data: data ? new Uint8Array(data) : null, createdAt: new Date() } }).catch(() => {});
  if (!image) {
    await keep(null);
    return new NextResponse(null, { status: 404, headers: { "Cache-Control": "private, max-age=3600" } });
  }
  // Matterport's photo is full size (often several MB) - made small here, once, and kept.
  const small = await shrink(image, width).catch(() => null);
  if (!small) return NextResponse.redirect(image, { status: 302, headers: { "Cache-Control": "private, max-age=86400" } });
  await keep(small);
  return new NextResponse(new Uint8Array(small), { headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=604800" } });
}

const made = new Map<string, Buffer>();

async function shrink(url: string, width: number): Promise<Buffer | null> {
  // Only Matterport's own picture server - the address comes from their model data.
  if (!/^https:\/\/([a-z0-9-]+\.)*matterport\.com\//i.test(url)) return null;
  const key = `${width}:${url.split("?")[0]}`;
  const hit = made.get(key);
  if (hit) return hit;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000), cache: "no-store" });
  if (!res.ok) return null;
  const out = await sharp(Buffer.from(await res.arrayBuffer())).resize({ width, height: Math.round(width * 0.625), fit: "cover" }).webp({ quality: 72 }).toBuffer();
  if (made.size > 400) made.delete(made.keys().next().value!);
  made.set(key, out);
  return out;
}
