import "server-only";
import type { BentoTile, MenuEntry } from "@/app/arpo/tour-lab/tours/types";

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

/* ---------- An explore tour, read for converting it to an Arpo tour ---------- */

/** What an explore.nextview360.dk tour holds, as an Arpo tour wants it. */
export type ExploreTour = {
  url: string;
  title: string;
  modelId: string;
  /** Where it starts (a Matterport link with ss/sr), if it says. */
  start: string | null;
  hiddenSweeps: string[];
  filter: ReturnType<typeof filterFromCss>;
  /** The menu's colour and background (MPSkins' "--nav-color" / "--nav-bg-color"), as hex. */
  color: string | null;
  background: string | null;
  favicon: string | null;
  /** The menu, as an Arpo tour's menu: a spot in the tour becomes a Matterport link (same scan point and view). */
  menu: MenuEntry[];
  /** Fonts the page loads (its own CSS). */
  fonts: string[];
  /** How many menu links go elsewhere than a spot in this model (another tour, a web page). */
  outside: number;
  /** A tile menu made on the page itself (as Fitness United's "Power House" menu), as Arpo's "Fliser". */
  bento: BentoTile[] | null;
};

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " };
const text = (html: string) =>
  html
    .replace(/<[^>]*>/g, "")
    .replace(/&(#\d+|#x[\da-f]+|\w+);/gi, (m, e: string) =>
      ENTITIES[e.toLowerCase()] ?? (e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : m)
    )
    .replace(/\s+/g, " ")
    .trim();
const hex = (rgb: string | undefined) => {
  const n = (rgb ?? "").match(/\d+(\.\d+)?/g)?.slice(0, 3).map(Number);
  return n && n.length === 3 && n.every((x) => x >= 0 && x <= 255) ? `#${n.map((x) => Math.round(x).toString(16).padStart(2, "0")).join("")}` : null;
};

/**
 * Reads an explore tour page (only explore.nextview360.dk/…/tour/<code>):
 * the model, start, hidden scan points, colour filter, colours and the menu
 * with its groups - every spot turned into a Matterport link. The page is
 * someone else's HTML: only names, links and colours are taken from it.
 */
export async function readExploreTour(raw: string): Promise<ExploreTour | null> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== "explore.nextview360.dk" || !/^\/(?:[a-z]{2}\/)?tour\/[\w-]+\/?$/.test(url.pathname)) return null;
  const res = await fetch(new URL(url.pathname, url.origin), { signal: AbortSignal.timeout(15_000), redirect: "error" }).catch(() => null);
  if (!res?.ok) return null;
  const html = (await res.text()).slice(0, 3_000_000);
  const cfg = extractCfg(html);
  const modelId = cfg?.mpModel && /^[\w-]{6,20}$/.test(cfg.mpModel) ? cfg.mpModel : null;
  if (!modelId) return null;

  const place = (href: string): string | null => {
    try {
      const u = new URL(href.replace(/&amp;/g, "&"));
      const ss = u.searchParams.get("ss");
      if (u.hostname !== "explore.nextview360.dk" || !ss || !/^\d+$/.test(ss)) return null;
      const out = new URL(`https://my.matterport.com/show/?m=${modelId}`);
      out.searchParams.set("ss", ss);
      const sr = u.searchParams.get("sr");
      if (sr && /^-?[\d.]+,-?[\d.]+$/.test(sr)) out.searchParams.set("sr", sr);
      return out.toString();
    } catch {
      return null;
    }
  };
  let outside = 0;
  const link = (href: string): string | null => {
    const p = place(href);
    if (p) return p;
    outside++;
    const clean = href.replace(/&amp;/g, "&");
    return /^https?:\/\//i.test(clean) ? clean : null;
  };

  // The menu: each "section" is a group (its title) with its links; one without a title gives plain entries.
  const nav = html.slice(html.indexOf('class="nav-cnt"') >= 0 ? html.indexOf('class="nav-cnt"') : 0);
  const sections = nav.split(/<div\s+class="section\s/).slice(1);
  const menu: MenuEntry[] = [];
  for (const s of sections) {
    if (/^title\b/.test(s)) continue; // the header ("Præsenteret af …")
    const title = text(/class="icnt cnt-title"[^>]*>([\s\S]*?)<\/div>/.exec(s)?.[1] ?? "");
    const items: [string, string][] = [];
    for (const m of s.matchAll(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
      const name = text(/class="name"[^>]*>([\s\S]*?)<\/span>/.exec(m[2])?.[1] ?? m[2]);
      const href = name ? link(m[1]) : null;
      if (name && href) items.push([name.slice(0, 120), href]);
    }
    if (!items.length) continue;
    if (title && (items.length > 1 || title !== items[0][0])) menu.push({ title: title.slice(0, 120), items });
    else for (const [t, h] of items) menu.push({ title: t, href: h });
  }

  const bento = readBento(html, menu);
  const p = (cfg as { mpParams?: { ss?: string | number; sr?: string } } | null)?.mpParams;
  const start = p?.ss && /^\d+$/.test(String(p.ss)) ? `https://my.matterport.com/show/?m=${modelId}&ss=${p.ss}${p.sr && /^-?[\d.]+,-?[\d.]+$/.test(p.sr) ? `&sr=${p.sr}` : ""}` : null;
  const rootStyle = /<html[^>]*style="([^"]*)"/.exec(html)?.[1] ?? "";
  const icon = /<link[^>]*rel="icon"[^>]*href="(https:\/\/[^"]+)"/.exec(html)?.[1] ?? null;
  return {
    url: url.toString(),
    title: text(/<title>([\s\S]*?)<\/title>/.exec(html)?.[1] ?? "").slice(0, 160) || "Tour",
    modelId,
    start,
    hiddenSweeps: hiddenSweeps(cfg!),
    filter: filterFromCss(cfg?.modelCssFilter),
    color: hex(/--nav-color:([^;"]+)/.exec(rootStyle)?.[1]),
    background: hex(/--nav-bg-color:([^;"]+)/.exec(rootStyle)?.[1]),
    favicon: icon,
    menu,
    fonts: [...new Set([...html.matchAll(/fonts\.googleapis\.com\/css2?\?family=([\w+]+)/g)].map((m) => m[1].replace(/\+/g, " ")))].slice(0, 4),
    outside,
    bento,
  };
}

/**
 * A tile menu someone wrote into the page's own script (MENU_TILES = [{cls,
 * k, t, tag, m | href}, …]): read as text, never run. `m` is the name of a
 * menu item to fly to; `href` a link or the name of a variable holding one.
 */
function readBento(html: string, menu: MenuEntry[]): BentoTile[] | null {
  const list = /MENU_TILES\s*=\s*\[([\s\S]*?)\]\s*;/.exec(html)?.[1];
  if (!list) return null;
  const str = (body: string, key: string) => new RegExp(`\\b${key}\\s*:\\s*'((?:[^'\\\\]|\\\\.)*)'`).exec(body)?.[1]?.replace(/\\'/g, "'") ?? null;
  const named = (name: string) => new RegExp(`(?:^|[^\\w$])${name.replace(/\$/g, "\\$")}\\s*=\\s*'(https?:\\/\\/[^']+)'`).exec(html)?.[1] ?? null;
  const places = menu.flatMap((m) => ("items" in m ? m.items : [[m.title, m.href] as [string, string]]));
  const tiles: BentoTile[] = [];
  for (const [body] of list.matchAll(/\{[^{}]*\}/g)) {
    const cls = str(body, "cls") ?? "";
    const title = text((str(body, "t") ?? "").replace(/<br\s*\/?>/gi, "\n").replace(/\n/g, "\u0000")).replace(/\u0000/g, "\n").replace(/ ?\n ?/g, "\n");
    if (!title) continue;
    const target = str(body, "m");
    const rawHref = str(body, "href") ?? /\bhref\s*:\s*([A-Za-z_$][\w$]*)/.exec(body)?.[1] ?? null;
    const href = target ? places.find(([n]) => n === target)?.[1] : rawHref ? (/^https?:\/\//.test(rawHref) ? rawHref : named(rawHref)) : null;
    if (!href) continue;
    const kicker = str(body, "k");
    const tag = str(body, "tag");
    tiles.push({
      title: title.slice(0, 80),
      ...(kicker ? { kicker: text(kicker).slice(0, 80) } : {}),
      ...(tag ? { tag: text(tag).slice(0, 30) } : {}),
      href,
      ...(/\bt-tall\b/.test(cls) ? { size: "tall" as const } : /\bt-wide\b/.test(cls) ? { size: "wide" as const } : {}),
      ...(/\bcta\b/.test(cls) ? { style: "accent" as const } : /\bdark\b/.test(cls) ? { style: "dark" as const } : {}),
    });
  }
  return tiles.length ? tiles.slice(0, 16) : null;
}
