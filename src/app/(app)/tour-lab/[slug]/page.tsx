import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSettingValue } from "@/lib/integration-settings";
import { fetchMpskinsCfg, hiddenSweeps, ssOf, sweepForSs } from "@/lib/mpskins";
import { TOURS } from "../tours";
import { Experience } from "./experience";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const tour = TOURS[(await params).slug];
  return { title: tour ? `${tour.brand} – prototype` : "Tour-lab" };
}

/**
 * A prototype tour: one engine (experience.tsx), one setup per customer
 * (../tours). The scan points behind every link are looked up once here,
 * from the current MPSkins tour's own config.
 */
export default async function TourPrototypePage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await getCurrentUser();
  if (user?.role !== "ADMIN") redirect("/");
  const tour = TOURS[(await params).slug];
  if (!tour) notFound();

  const [sdkKey, ga4Id, cfg] = await Promise.all([
    getSettingValue("MATTERPORT_SDK_KEY"),
    getSettingValue("TOUR_PROTOTYPE_GA4_ID"),
    fetchMpskinsCfg(tour.tourPage).catch(() => null),
  ]);

  const links = [
    tour.start,
    ...tour.points.map((p) => p.tour).filter((t): t is string => Boolean(t)),
    ...tour.menu.flatMap((m) => ("items" in m ? m.items.map((i) => i[1]) : [m.href])),
    ...(tour.welcome?.tiles.flatMap((t) => ("room" in t.go ? [t.go.room] : [])) ?? []),
  ];
  const sweepBySs: Record<number, string> = {};
  for (const link of links) {
    const ss = ssOf(link);
    const sweep = cfg ? sweepForSs(cfg, ss) : null;
    if (ss != null && sweep) sweepBySs[ss] = sweep;
  }

  // Scan points hidden in MPSkins stay hidden here (plus any listed in the tour setup).
  const hidden = [...new Set([...(cfg ? hiddenSweeps(cfg) : []), ...tour.hiddenSweeps])];

  return (
    <Experience tour={tour} sdkKey={sdkKey} ga4Id={ga4Id} modelId={cfg?.mpModel ?? null} sweepBySs={sweepBySs} hiddenSweeps={hidden} />
  );
}
