import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { tourStats } from "@/lib/tour-stats";
import { shareOf } from "@/lib/tour-share";
import { CustomerReport } from "@/app/(app)/tour-lab/[slug]/rediger/customer-report";
import type { TourConfig } from "@/app/(app)/tour-lab/tours/types";
import { startPlaces } from "@/app/(app)/tour-lab/tours/places";
import { PortalEmbeds } from "./embeds";

/*
 * The customer portal: /r/<token> - no login. The tour's numbers (only the
 * ones chosen to be shared in Resultater → Kundens rapport, always fresh),
 * and the tour on their own website: a code for each place, the page it
 * belongs on, and how to put it in.
 */

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Kundeportal - jeres virtuelle tour" };

export default async function CustomerReportPage({ params }: { params: Promise<{ token: string }> }) {
  const tour = await prisma.tour.findUnique({ where: { shareToken: (await params).token }, select: { slug: true, config: true, share: true, published: true } });
  if (!tour) notFound();
  const config = tour.config as unknown as TourConfig;
  const share = shareOf(tour.share);
  const stats = await tourStats(tour.slug, share.days);
  return (
    <main
      className="min-h-screen bg-[#f5f5f7] px-4 py-8 text-[#1d1d1f]"
      style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif', ["--report-accent" as string]: config.colors.accent }}
    >
      <div className="mx-auto max-w-[560px] space-y-5">
        <div className="flex h-16 items-center justify-center rounded-2xl" style={{ background: config.logoOnLight ? "#fff" : config.colors.main }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={config.logo} alt={config.brand} className="max-h-10 max-w-[60%] object-contain" />
        </div>
        <CustomerReport stats={stats} share={share} brand={config.title} />
        {tour.published && (
          <PortalEmbeds
            url={`${(await headers()).get("x-forwarded-proto") ?? "https"}://${(await headers()).get("host")}/t/${tour.slug}`}
            title={config.title}
            size={config.embeds?.size}
            whole={config.embeds?.pages?._hele ?? null}
            places={startPlaces(config).map((p) => ({ key: p.key, name: p.name, group: p.group, page: config.embeds?.pages?.[p.key] ?? null }))}
          />
        )}
        <p className="text-center text-[12px] text-[#8e8e93]">Målt af Nextview360 · tallene opdateres løbende</p>
      </div>
    </main>
  );
}
