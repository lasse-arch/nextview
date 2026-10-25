import "server-only";

/** The parts of the `var cfg = {...}` object MPSkins renders into every tour page that we read. */
export type MpskinsCfg = {
  mpModel?: string;
  /** Scan points in the order a U-link's ss number counts them (from 1); `hide` = turned off under "Scan Points / Floor". */
  sweep?: { uuid?: string; floor?: number; hide?: boolean }[];
  /** MPSkins' "Color filter", as CSS: "brightness(1.1) contrast(1.06) saturate(1.02) grayscale(0) hue-rotate(0deg)". */
  modelCssFilter?: string;
};

/** MPSkins' colour filter as a tour setup's `filter` (null when it changes nothing). */
export function filterFromCss(css: string | undefined): { brightness?: number; contrast?: number; saturate?: number; grayscale?: number; hue?: number } | null {
  if (!css) return null;
  const n = (name: string) => {
    const m = new RegExp(`${name}\\(([-\\d.]+)`).exec(css);
    return m ? Number(m[1]) : undefined;
  };
  const f = { brightness: n("brightness"), contrast: n("contrast"), saturate: n("saturate"), grayscale: n("grayscale"), hue: n("hue-rotate") };
  const neutral = (f.brightness ?? 1) === 1 && (f.contrast ?? 1) === 1 && (f.saturate ?? 1) === 1 && !f.grayscale && !f.hue;
  return neutral ? null : f;
}

function extractCfg(html: string): MpskinsCfg | null {
  const start = html.indexOf("var cfg = ");
  if (start < 0) return null;
  const from = html.indexOf("{", start);
  let depth = 0;
  let inString = false;
  for (let i = from; i < html.length; i++) {
    const c = html[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      try {
        return JSON.parse(html.slice(from, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** Fetches an explore.nextview360.dk tour page (cached for an hour) and returns its config. */
export async function fetchMpskinsCfg(tourUrl: string): Promise<MpskinsCfg | null> {
  const parsed = new URL(tourUrl);
  if (parsed.hostname !== "explore.nextview360.dk") return null;
  const res = await fetch(new URL(parsed.pathname, parsed.origin), {
    signal: AbortSignal.timeout(10_000),
    next: { revalidate: 3600 },
  });
  if (!res.ok) return null;
  return extractCfg(await res.text());
}

/** The ss number of an MPSkins/Matterport link, if it has one. */
export function ssOf(url: string): number | null {
  try {
    const raw = new URL(url).searchParams.get("ss");
    return raw && /^\d+$/.test(raw) ? Number(raw) : null;
  } catch {
    return null;
  }
}

export function sweepForSs(cfg: MpskinsCfg, ss: number | null): string | null {
  return ss != null ? cfg.sweep?.[ss - 1]?.uuid ?? null : null;
}

/** The scan points hidden in MPSkins ("Scan Points / Floor"), to be disabled in our tour too. */
export function hiddenSweeps(cfg: MpskinsCfg): string[] {
  return (cfg.sweep ?? []).filter((s) => s.hide && s.uuid).map((s) => s.uuid!);
}
