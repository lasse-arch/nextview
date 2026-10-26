import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSettingValue } from "@/lib/integration-settings";
import { blobReady } from "@/lib/tour-files";
import { tourStats } from "@/lib/tour-stats";
import { shareOf } from "@/lib/tour-share";
import { ensureToursSeeded } from "@/lib/tours";
import type { TourConfig } from "../../tours/types";
import { TourEditor } from "./editor";
import { fetchScanMap } from "@/lib/matterport-graph";
import { fetchMpskinsCfg, hiddenSweeps } from "@/lib/mpskins";
import type { TourEconomy } from "./economy";


/** Claude may take a minute or two to build or change a tour. */
export const maxDuration = 300;
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  return { title: `Rediger tour – ${(await params).slug}` };
}

/** The tour editor: a tour's whole setup, with a live preview and its versions. */
export default async function TourEditPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await getCurrentUser();
  if (user?.role !== "ADMIN") redirect("/");
  await ensureToursSeeded().catch(() => {});
  const tour = await prisma.tour.findUnique({
    where: { slug: (await params).slug },
    select: {
      slug: true,
      config: true,
      published: true,
      share: true,
      shareToken: true,
      deal: { select: { id: true, companyName: true, displayName: true, filmingActualMinutes: true } },
      versions: { orderBy: { createdAt: "desc" }, take: 40, select: { id: true, note: true, createdByName: true, createdAt: true } },
    },
  });
  if (!tour) notFound();
  const setup = tour.config as unknown as TourConfig;
  // The scan points from above (the map in "Scanpunkter") and the ones hidden in MPSkins.
  const cfg = setup.tourPage ? await fetchMpskinsCfg(setup.tourPage).catch(() => null) : null;
  const modelId = setup.modelId ?? cfg?.mpModel ?? null;
  const [work, ai, scanMap] = await Promise.all([
    prisma.tourWork.groupBy({ by: ["userName"], where: { tourSlug: tour.slug }, _sum: { seconds: true } }),
    prisma.tourAiUsage.aggregate({ where: { tourSlug: tour.slug }, _sum: { costUsd: true }, _count: true }),
    modelId ? fetchScanMap(modelId) : Promise.resolve(null),
  ]);
  const stats = await tourStats(tour.slug);
  const share = shareOf(tour.share);
  const economy: TourEconomy = {
    filmingMinutes: tour.deal?.filmingActualMinutes ?? null,
    work: work.map((w) => ({ name: w.userName, seconds: w._sum.seconds ?? 0 })).sort((a, b) => b.seconds - a.seconds),
    ai: { calls: ai._count, usd: ai._sum.costUsd ?? 0 },
    dealId: tour.deal?.id ?? null,
  };
  return (
    <TourEditor
      slug={tour.slug}
      initial={tour.config as unknown as TourConfig}
      deal={tour.deal ? { id: tour.deal.id, name: tour.deal.displayName ?? tour.deal.companyName } : null}
      stats={stats}
      share={share}
      shareStats={share.days === 30 ? stats : await tourStats(tour.slug, share.days)}
      shareToken={tour.shareToken}
      blob={blobReady()}
      published={tour.published}
      economy={economy}
      scanMap={scanMap}
      mpskinsHidden={cfg ? hiddenSweeps(cfg) : []}
      scanCount={cfg?.sweep?.length ?? null}
      aiReady={Boolean(process.env.ANTHROPIC_API_KEY || (await getSettingValue("ANTHROPIC_API_KEY")))}
      versions={tour.versions.map((v) => ({ id: v.id, note: v.note, by: v.createdByName, at: v.createdAt.toISOString() }))}
    />
  );
}
