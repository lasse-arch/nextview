import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSettingValue } from "@/lib/integration-settings";
import { fetchMpskinsCfg, hiddenSweeps, ssOf, sweepForSs } from "@/lib/mpskins";
import { halvorsminde } from "./data";
import { Experience } from "./experience";

export const metadata = { title: "Halvorsminde – prototype" };

/**
 * Prototype of our own premium tour on a real customer: the drone scene as
 * the front door, gliding down into the Matterport tour, our own menu.
 * The scan points behind every link are looked up once here, from the
 * current MPSkins tour's own config.
 */
export default async function HalvorsmindePrototypePage() {
  const user = await getCurrentUser();
  if (user?.role !== "ADMIN") redirect("/");
  const [sdkKey, ga4Id, cfg] = await Promise.all([
    getSettingValue("MATTERPORT_SDK_KEY"),
    getSettingValue("TOUR_PROTOTYPE_GA4_ID"),
    fetchMpskinsCfg(halvorsminde.tourPage).catch(() => null),
  ]);

  const links = [
    halvorsminde.start,
    ...halvorsminde.points.map((p) => p.tour).filter((t): t is string => Boolean(t)),
    ...halvorsminde.menu.flatMap((m) => ("items" in m ? m.items.map((i) => i[1]) : [m.href])),
  ];
  const sweepBySs: Record<number, string> = {};
  for (const link of links) {
    const ss = ssOf(link);
    const sweep = cfg ? sweepForSs(cfg, ss) : null;
    if (ss != null && sweep) sweepBySs[ss] = sweep;
  }

  // Scan points hidden in MPSkins stay hidden here (plus any listed in data.ts).
  const hidden = [...new Set([...(cfg ? hiddenSweeps(cfg) : []), ...halvorsminde.hiddenSweeps])];

  return <Experience sdkKey={sdkKey} ga4Id={ga4Id} modelId={cfg?.mpModel ?? null} sweepBySs={sweepBySs} hiddenSweeps={hidden} />;
}
