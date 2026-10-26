import "server-only";
import type { TourConfig } from "@/app/(app)/tour-lab/tours/types";
import { fetchMpskinsCfg, filterFromCss, hiddenSweeps } from "@/lib/mpskins";

/*
 * Moving a tour off MPSkins: everything it took from the MPSkins tour page is
 * copied into the tour itself, so it runs on Matterport alone -
 *  - the Matterport model id,
 *  - the scan points hidden in MPSkins,
 *  - the colour filter,
 *  - every link to a spot (explore.nextview360.dk/…?ss=) becomes Matterport's
 *    own (my.matterport.com/show/?m=…&ss=), with the same scan point and view.
 */

export async function detachFromMpskins(config: TourConfig): Promise<{ ok: true; config: TourConfig; links: number } | { ok: false; error: string }> {
  if (!config.tourPage) return { ok: true, config, links: 0 };
  const cfg = await fetchMpskinsCfg(config.tourPage).catch(() => null);
  const modelId = config.modelId ?? cfg?.mpModel;
  if (!modelId) return { ok: false, error: "Kunne ikke finde Matterport-modellen bag MPSkins-touren." };
  let links = 0;
  const json = JSON.stringify(config).replace(/https?:\/\/explore\.nextview360\.dk\/[^"\s\\]*/g, (link) => {
    let url: URL;
    try {
      url = new URL(link);
    } catch {
      return link;
    }
    const ss = url.searchParams.get("ss");
    if (!ss) return link;
    const next = new URL(`https://my.matterport.com/show/?m=${modelId}`);
    next.searchParams.set("ss", ss);
    for (const keep of ["sr", "rot"]) if (url.searchParams.get(keep)) next.searchParams.set(keep, url.searchParams.get(keep)!);
    links++;
    return next.toString();
  });
  const next = JSON.parse(json) as TourConfig;
  next.modelId = modelId;
  next.tourPage = "";
  if (cfg) {
    next.hiddenSweeps = [...new Set([...next.hiddenSweeps, ...hiddenSweeps(cfg)])];
    next.filter ??= filterFromCss(cfg.modelCssFilter) ?? undefined;
  }
  return { ok: true, config: next, links };
}
