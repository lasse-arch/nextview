import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fetchModelInfo, modelIdsIn } from "@/lib/matterport-graph";
import { fetchMpskinsCfg } from "@/lib/mpskins";
import type { TourConfig } from "@/app/arpo/tour-lab/tours/types";

/*
 * The picture on a card in "Online kunder": the Matterport model's own hero
 * photo. Asked for by id (an Arpo tour's slug or a deal item), never by a
 * link - so it can only look up our own tours. Team only.
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse(null, { status: 401 });
  const q = new URL(req.url).searchParams;
  let modelId: string | null = null;
  const slug = q.get("tour");
  const item = q.get("item");
  if (slug) {
    const tour = await prisma.tour.findUnique({ where: { slug }, select: { config: true } });
    const config = tour?.config as unknown as TourConfig | undefined;
    modelId = config?.modelId ?? (config?.tourPage ? ((await fetchMpskinsCfg(config.tourPage).catch(() => null))?.mpModel ?? null) : null);
  } else if (item) {
    const row = await prisma.dealItem.findUnique({ where: { id: item }, select: { url: true } });
    if (row?.url) {
      const url = /^https?:\/\//i.test(row.url) ? row.url : `https://${row.url}`;
      modelId = modelIdsIn(url)[0] ?? (await fetchMpskinsCfg(url).catch(() => null))?.mpModel ?? null;
    }
  }
  const image = modelId ? (await fetchModelInfo(modelId))?.image : null;
  if (!image) return new NextResponse(null, { status: 404, headers: { "Cache-Control": "private, max-age=3600" } });
  return NextResponse.redirect(image, { status: 302, headers: { "Cache-Control": "private, max-age=86400" } });
}
