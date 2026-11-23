"use client";

import { useEffect, useState } from "react";
import { tourHeatFor } from "@/lib/actions/tour-insights";
import type { HeatData } from "@/lib/tour-heat";
import { placeHref } from "../../tours/places";
import type { TourConfig } from "../../tours/types";
import { HeatmapView } from "./heatmap-view";
import { Group, type PreviewApi } from "./ui";

/*
 * Resultater → "Heatmap": where the visitors spend their time inside the tour
 * (the floor plan) and what they open on the aerial photo / map - the last 60
 * days. The same view the customer gets in their statistics (heatmap-view.tsx),
 * here with "Vis stedet" to fly the preview there.
 */
export function HeatmapPanel({ slug, config, preview }: { slug: string; config: TourConfig; preview?: PreviewApi }) {
  const [data, setData] = useState<HeatData | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    tourHeatFor(slug)
      .then((r) => live && setData(r))
      .catch(() => live && setData(null));
    return () => {
      live = false;
    };
  }, [slug]);
  return (
    <Group title="Heatmap - hvor folk opholder sig">
      <p className="text-[13px] leading-snug text-[#6e6e73]">Hvor de besøgende står længst inde i touren (plantegningen), og hvilke punkter de åbner på luftfotoet. Jo varmere, jo mere. De seneste 60 dage - samme billede, som kunden ser i sin statistik.</p>
      {data === undefined ? (
        <p className="text-[13px] text-[#8e8e93]">Henter…</p>
      ) : !data || (!data.plan && !data.aerial) ? (
        <p className="text-[13px] text-[#8e8e93]">Ingen målinger endnu - eller touren har hverken plantegning fra Matterport eller luftfoto.</p>
      ) : (
        <HeatmapView data={data} onGo={preview ? (ss, name) => preview.go(name, placeHref(config, ss)) : undefined} />
      )}
    </Group>
  );
}
