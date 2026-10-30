import "server-only";
import sharp from "sharp";
import { guessIcon } from "@/app/arpo/tour-lab/tours/icons";
import type { TourConfig, TourPoint } from "@/app/arpo/tour-lab/tours/types";
import { blobReady, storeTourFile } from "@/lib/tour-files";

/*
 * "Hent fra en kortside": an aerial-photo map built as its own page (on
 * *.lovable.app - e.g. Nymarksminde's, which MPSkins shows in a frame) taken
 * into an Arpo tour. The page is someone else's: its script is read as text
 * (KATEGORIER, PUNKTER, PROGRAM, START and the file list) and never run, and
 * only names, texts, numbers and its own files are taken. The aerial photo's
 * tiles are put together into one 360° photo, so it can be edited like any
 * 360° map; the points' photos, 360° photos and videos are copied to us.
 */

const MAX_PAGE = 6_000_000;

/* ----- A small reader for the page's JavaScript data (objects, arrays, strings, numbers) - no code is run. ----- */

type Js = string | number | boolean | null | Js[] | { [k: string]: Js };

function readJs(src: string, at: number): Js {
  let i = at;
  const ws = () => {
    for (;;) {
      while (i < src.length && /\s/.test(src[i])) i++;
      if (src.startsWith("//", i)) i = src.indexOf("\n", i) < 0 ? src.length : src.indexOf("\n", i);
      else if (src.startsWith("/*", i)) i = src.indexOf("*/", i) < 0 ? src.length : src.indexOf("*/", i) + 2;
      else return;
    }
  };
  const value = (depth: number): Js => {
    if (depth > 20) throw new Error("for dybt");
    ws();
    const c = src[i];
    if (c === "{") {
      i++;
      const o: { [k: string]: Js } = {};
      for (;;) {
        ws();
        if (src[i] === "}") return i++, o;
        let key: string;
        if (src[i] === "'" || src[i] === '"') key = value(depth + 1) as string;
        else {
          const bare = /^[\w$]+/.exec(src.slice(i, i + 100))?.[0];
          if (!bare) throw new Error("nøgle");
          key = bare;
          i += bare.length;
        }
        ws();
        if (src[i++] !== ":") throw new Error("kolon");
        o[key] = value(depth + 1);
        ws();
        if (src[i] === ",") i++;
      }
    }
    if (c === "[") {
      i++;
      const a: Js[] = [];
      for (;;) {
        ws();
        if (src[i] === "]") return i++, a;
        a.push(value(depth + 1));
        ws();
        if (src[i] === ",") i++;
      }
    }
    if (c === "'" || c === '"') {
      i++;
      let s = "";
      while (i < src.length && src[i] !== c) {
        if (src[i] === "\\") {
          const n = src[i + 1];
          s += n === "n" ? "\n" : n === "t" ? "\t" : n;
          i += 2;
        } else s += src[i++];
      }
      i++;
      return s;
    }
    const lit = /^(-?\d+(\.\d+)?|true|false|null)/.exec(src.slice(i, i + 40))?.[0];
    if (!lit) throw new Error(`ukendt værdi ved ${src.slice(i, i + 20)}`);
    i += lit.length;
    return lit === "true" ? true : lit === "false" ? false : lit === "null" ? null : Number(lit);
  };
  return value(0);
}

/** The value of `var NAME = …` in the page's script, or null. */
function dataOf(doc: string, name: string): Js {
  const m = new RegExp(`\\b(?:var|let|const)\\s+${name}\\s*=\\s*`).exec(doc);
  if (!m) return null;
  try {
    return readJs(doc, m.index + m[0].length);
  } catch {
    return null;
  }
}

const str = (v: Js | undefined, max = 600) => (typeof v === "string" ? v.replace(/<[^>]*>/g, "").trim().slice(0, max) : "");
const num = (v: Js | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const list = (v: Js | undefined): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : typeof v === "string" && v ? [v] : []);

/* ----- The page ----- */

function decodeAttr(s: string): string {
  return s.replace(/&(#\d+|#x[\da-f]+|amp|lt|gt|quot|apos);/gi, (m, e: string) => {
    const k = e.toLowerCase();
    if (k === "amp") return "&";
    if (k === "lt") return "<";
    if (k === "gt") return ">";
    if (k === "quot") return '"';
    if (k === "apos") return "'";
    const n = k[1] === "x" ? parseInt(k.slice(2), 16) : Number(k.slice(1));
    return Number.isFinite(n) ? String.fromCodePoint(n) : m;
  });
}

/** Only a map page on lovable.app - and only the page's own files. */
export function mapPageUrl(raw: string): URL | null {
  try {
    const u = new URL(raw.trim());
    return u.protocol === "https:" && /^[a-z0-9-]+\.lovable\.app$/i.test(u.hostname) ? new URL("/", u.origin) : null;
  } catch {
    return null;
  }
}

async function get(url: string, max: number): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000), redirect: "error", headers: { "User-Agent": "Mozilla/5.0 (compatible; ArpoTourBuilder/1.0)" } });
  if (!res.ok) throw new Error(`${new URL(url).pathname} svarede ${res.status}`);
  if (Number(res.headers.get("content-length") ?? 0) > max) throw new Error(`${new URL(url).pathname} er for stor`);
  const b = Buffer.from(await res.arrayBuffer());
  if (b.length > max) throw new Error(`${new URL(url).pathname} er for stor`);
  return b;
}

export type MapImport = Pick<TourConfig, "points" | "categories"> & { map: NonNullable<TourConfig["map"]>; day?: TourConfig["day"]; copied: number; failed: string[] };

/** Reads a map page and copies what it shows into the tour's own files. */
export async function importMapPage(slug: string, raw: string): Promise<MapImport> {
  const page = mapPageUrl(raw);
  if (!page) throw new Error("Kun kortsider på lovable.app (fx https://nymarksminde.lovable.app).");
  const html = (await get(page.toString(), MAX_PAGE)).toString("utf8");
  // The map is the page's frame (srcDoc) - or the page itself.
  const frame = /srcDoc="([^"]*)"/i.exec(html)?.[1];
  const doc = frame ? decodeAttr(frame) : html;

  const assetsRaw = /window\.[A-Z_]*ASSETS\s*=\s*(\{[\s\S]*?\})\s*;/.exec(doc)?.[1];
  const assets: Record<string, string> = {};
  try {
    for (const [k, v] of Object.entries(JSON.parse(assetsRaw ?? "{}") as Record<string, unknown>)) if (typeof v === "string" && /^\/[^/\\]/.test(v)) assets[k] = v;
  } catch {
    /* none */
  }
  /** A file of the page's own (by its name in the page), as an address on the page's site - never elsewhere. */
  const fileUrl = (name: string) => {
    const p = assets[name] ?? (/^[\w./-]+$/.test(name) ? `/${name.replace(/^\/+/, "")}` : null);
    const u = p ? new URL(p, page) : null;
    return u && u.origin === page.origin ? u.toString() : null;
  };

  const cats = dataOf(doc, "KATEGORIER");
  const pts = dataOf(doc, "PUNKTER");
  if (!cats || typeof cats !== "object" || Array.isArray(cats) || !Array.isArray(pts)) throw new Error("Siden har ikke et kort, Arpo kan læse (KATEGORIER og PUNKTER mangler).");
  const cssVar = (v: string) => {
    const name = /var\(--([\w-]+)\)/.exec(v)?.[1];
    const val = name ? new RegExp(`--${name}\\s*:\\s*(#[0-9a-f]{3,8})\\b`, "i").exec(doc)?.[1] : /^#[0-9a-f]{3,8}$/i.test(v) ? v : null;
    return val ?? "#4e6e78";
  };
  const categories: TourConfig["categories"] = {};
  for (const [key, c] of Object.entries(cats)) {
    if (!/^[\w-]{1,30}$/.test(key) || !c || typeof c !== "object" || Array.isArray(c)) continue;
    categories[key] = { name: str(c.navn ?? c.name, 60) || key, color: cssVar(str(c.farve ?? c.color, 60)) };
  }

  // Files are copied once each (several points may share one).
  const copies = new Map<string, Promise<string | null>>();
  const failed: string[] = [];
  let copied = 0;
  const copy = (name: string, max = 200 * 1024 * 1024): Promise<string | null> => {
    const url = fileUrl(name);
    if (!url) return Promise.resolve(null);
    if (!copies.has(url))
      copies.set(
        url,
        (async () => {
          try {
            const bytes = await get(url, blobReady() ? max : 4 * 1024 * 1024);
            const ext = (name.split(".").pop() ?? "").toLowerCase();
            const type = ext === "mp4" ? "video/mp4" : ext === "webm" ? "video/webm" : ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
            const out = await storeTourFile(slug, name.split("/").pop() ?? name, type, bytes, url);
            copied++;
            return out;
          } catch (err) {
            failed.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
            return null;
          }
        })()
      );
    return copies.get(url)!;
  };

  const spot = (yaw: number, pitch: number): [number, number] => [Math.round(((((yaw + 180) % 360) + 360) % 360) / 3.6 * 100) / 100, Math.round(((90 - pitch) / 1.8) * 100) / 100];
  const points: TourPoint[] = [];
  const spots: Record<string, [number, number]> = {};
  for (const p of pts.slice(0, 80)) {
    if (!p || typeof p !== "object" || Array.isArray(p)) continue;
    const id = str(p.id, 60).toLowerCase().replace(/[^a-z0-9-]+/g, "-");
    const yaw = num(p.yaw);
    const pitch = num(p.pitch);
    const cat = str(p.kat ?? p.cat, 30);
    if (!id || yaw == null || pitch == null || !categories[cat] || spots[id]) continue;
    const name = str(p.navn ?? p.name, 120) || id;
    const [images, panos] = await Promise.all([Promise.all(list(p.billede).slice(0, 8).map((f) => copy(f, 30_000_000))), Promise.all(list(p.pano).slice(0, 4).map((f) => copy(f, 60_000_000)))]);
    const videoFile = list(p.video)[0];
    const video = videoFile ? await copy(videoFile) : null;
    const poster = list(p.poster)[0] ? await copy(list(p.poster)[0], 30_000_000) : null;
    const link = str(p.link, 500);
    const more = str(p.laesmere, 500);
    const facts = Array.isArray(p.fakta)
      ? p.fakta.flatMap((f): [string, string][] => (Array.isArray(f) && str(f[0], 60) && str(f[1], 120) ? [[str(f[0], 60), str(f[1], 120)]] : [])).slice(0, 8)
      : [];
    const pano = panos.filter((x): x is string => Boolean(x));
    // Without the video (too big to copy), its still picture is shown instead.
    const imgs = [...images.filter((x): x is string => Boolean(x)), ...(!video && poster ? [poster] : [])];
    points.push({
      id,
      name,
      cat,
      icon: guessIcon(name),
      yaw,
      pitch,
      tour: /^https:\/\/(explore\.nextview360\.dk|my\.matterport\.com)\//.test(link) ? link : null,
      text: str(p.tekst ?? p.text, 2000),
      chips: list(p.stikord ?? p.chips).map((c) => str(c, 60)).filter(Boolean).slice(0, 6),
      ...(imgs.length ? { images: imgs } : {}),
      ...(pano[0] ? { panorama: pano[0] } : {}),
      ...(video ? { video: { src: video, ...(poster ? { poster } : {}) } } : {}),
      ...(str(p.sted, 120) ? { kicker: str(p.sted, 120) } : {}),
      ...(facts.length ? { facts } : {}),
      ...(str(p.tip, 400) ? { tip: str(p.tip, 400) } : {}),
      ...(/^https?:\/\//.test(more) ? { button: { label: "Læs mere", href: more } } : {}),
    });
    spots[id] = spot(yaw, pitch);
  }
  if (!points.length) throw new Error("Fandt ingen punkter på kortet.");

  // The aerial photo: the tiles of the page's own viewer, put together into one 360° photo.
  const viewer = /pannellum\.viewer\(\s*'pano'[\s\S]{0,600}?basePath:\s*'([\w/-]+)'[\s\S]{0,300}?maxLevel:\s*(\d)[\s\S]{0,100}?cubeResolution:\s*(\d{3,5})/.exec(doc);
  if (!viewer) throw new Error("Fandt ikke luftfotoet på siden.");
  const { url: image, w, h } = await stitch(slug, viewer[1], Number(viewer[2]), Number(viewer[3]), fileUrl);
  copied++;

  // Where it starts: START = { yaw: mobil ? 6 : 10, pitch: …, hfov: … }.
  const start = /\bSTART\s*=\s*\{([^}]*)\}/.exec(doc)?.[1] ?? "";
  const startOf = (k: string, phone: boolean) => {
    const m = new RegExp(`${k}\\s*:\\s*(?:\\w+\\s*\\?\\s*(-?[\\d.]+)\\s*:\\s*(-?[\\d.]+)|(-?[\\d.]+))`).exec(start);
    return m ? Number(m[3] ?? (phone ? m[1] : m[2])) : null;
  };
  const view = (phone: boolean) => {
    const yaw = startOf("yaw", phone) ?? 0;
    const pitch = startOf("pitch", phone) ?? -45;
    const hfov = startOf("hfov", phone) ?? (phone ? 80 : 110);
    const [x, y] = spot(yaw, pitch);
    return { x, y, zoom: Math.round(((phone ? 80 : 110) / hfov) * 100) / 100 };
  };
  const title = str(/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(doc)?.[1], 120);
  const lead = str(/<\/h1>\s*<p[^>]*>([\s\S]*?)<\/p>/.exec(doc)?.[1], 300);

  // PROGRAM = [['10.00', 'Parken åbner', 'punkt-id'], …] → "Sådan ser en dag ud".
  const program = dataOf(doc, "PROGRAM");
  const steps = Array.isArray(program)
    ? program.flatMap((s) => (Array.isArray(s) && str(s[0], 10) && str(s[1], 80) ? [{ time: str(s[0], 10).replace(".", ":"), title: str(s[1], 80), ...(spots[str(s[2], 60)] ? { href: `#punkt:${str(s[2], 60)}` } : {}) }] : [])).slice(0, 20)
    : [];

  return {
    points,
    categories,
    map: { image, w, h, panorama: true, spots, start: view(false), startMobile: view(true), ...(title ? { intro: { title, lead } } : {}) },
    ...(steps.length ? { day: { title: "Sådan ser en dag ud", steps } } : {}),
    copied,
    failed,
  };
}

/** The cube's tiles (pannellum multires: <base>/<level>/<face><row>_<col>.jpg) as one equirectangular photo, kept with the tour. */
async function stitch(slug: string, base: string, level: number, cube: number, fileUrl: (name: string) => string | null): Promise<{ url: string; w: number; h: number }> {
  const T = 512;
  const n = Math.ceil(cube / T);
  if (n > 16) throw new Error("Luftfotoet er for stort.");
  const faces: Record<string, Buffer> = {};
  for (const f of ["f", "b", "u", "d", "l", "r"]) {
    const parts: { input: Buffer; left: number; top: number }[] = [];
    const cells = [...Array(n * n).keys()];
    for (let i = 0; i < cells.length; i += 12)
      await Promise.all(
        cells.slice(i, i + 12).map(async (c) => {
          const y = Math.floor(c / n);
          const x = c % n;
          const url = fileUrl(`${base}/${level}/${f}${y}_${x}.jpg`);
          if (!url) throw new Error("Luftfotoets fliser mangler.");
          parts.push({ input: await get(url, 5_000_000), left: x * T, top: y * T });
        })
      );
    faces[f] = await sharp({ create: { width: cube, height: cube, channels: 3, background: "#000" } }).composite(parts).removeAlpha().raw().toBuffer();
  }
  // Each pixel of the photo looks in one direction; it takes its colour from the cube face that direction hits.
  const W = blobReady() ? Math.min(8192, cube * 4) : 4096;
  const H = W / 2;
  const out = Buffer.alloc(W * H * 3);
  for (let j = 0; j < H; j++) {
    const phi = Math.PI / 2 - ((j + 0.5) / H) * Math.PI;
    const cp = Math.cos(phi);
    const sp = Math.sin(phi);
    for (let i = 0; i < W; i++) {
      const th = ((i + 0.5) / W) * 2 * Math.PI - Math.PI;
      const x = Math.sin(th) * cp;
      const y = sp;
      const z = Math.cos(th) * cp;
      const ax = Math.abs(x);
      const ay = Math.abs(y);
      const az = Math.abs(z);
      let f: string;
      let u: number;
      let v: number;
      if (az >= ax && az >= ay) [f, u, v] = z > 0 ? ["f", x / az, -y / az] : ["b", -x / az, -y / az];
      else if (ax >= ay) [f, u, v] = x > 0 ? ["r", -z / ax, -y / ax] : ["l", z / ax, -y / ax];
      else [f, u, v] = y > 0 ? ["u", x / ay, z / ay] : ["d", x / ay, -z / ay];
      const px = Math.min(cube - 1, Math.max(0, Math.floor(((u + 1) / 2) * cube)));
      const py = Math.min(cube - 1, Math.max(0, Math.floor(((v + 1) / 2) * cube)));
      const s = (py * cube + px) * 3;
      const d = (j * W + i) * 3;
      const F = faces[f];
      out[d] = F[s];
      out[d + 1] = F[s + 1];
      out[d + 2] = F[s + 2];
    }
  }
  const jpg = await sharp(out, { raw: { width: W, height: H, channels: 3 } }).jpeg({ quality: blobReady() ? 85 : 80, mozjpeg: true }).toBuffer();
  return { url: await storeTourFile(slug, "luftfoto-360.jpg", "image/jpeg", jpg), w: W, h: H };
}
