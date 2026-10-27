import "server-only";
import { hash as blake3 } from "blake3-wasm";
import { prisma } from "@/lib/db";
import { loadTour } from "@/app/arpo/tour-lab/[slug]/load";
import type { TourConfig } from "@/app/arpo/tour-lab/tours/types";

/*
 * Tours published as plain files on Cloudflare Pages (tour.nextview360.dk):
 * every publication is a frozen version - the tour's page with its data,
 * its pictures, the engine it was built with (scripts/build-tour-engine.mjs)
 * and Matterport's viewer - so a tour keeps running even if Arpo, the
 * database or Vercel are down, and new features only reach a tour when it is
 * published again. One Cloudflare deployment holds every tour's live
 * version; publishing, going back to an older version or taking a tour
 * offline makes a new one. Files are known by Cloudflare's hash of their
 * content, so each is only ever uploaded once.
 *
 * Needs CLOUDFLARE_API_TOKEN (Cloudflare Pages: Edit, nothing else) and
 * CLOUDFLARE_ACCOUNT_ID. The token never leaves the server.
 */

const API = "https://api.cloudflare.com/client/v4";
export const PAGES_PROJECT = process.env.CLOUDFLARE_PAGES_PROJECT || "nextview-tours";
/** Where Arpo is for a published tour (measurement, live units) - its own address. */
const ARPO_ORIGIN = () => (process.env.APP_BASE_URL || "https://nextview360.dk").replace(/\/+$/, "");

const TYPES: Record<string, string> = { js: "application/javascript", css: "text/css", html: "text/html", json: "application/json", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", svg: "image/svg+xml", ico: "image/x-icon", mp3: "audio/mpeg", mp4: "video/mp4", woff2: "font/woff2" };
const EXT: Record<string, string> = Object.fromEntries(Object.entries(TYPES).map(([e, t]) => [t, e]));

/** One file of a version: Cloudflare's hash, its type, and where its content can be had again (Arpo's own path, or the content itself for the small generated page). */
export type PublishedFile = { h: string; t: string; src?: string; d?: string };
export type Files = Record<string, PublishedFile>;

const cfHash = (data: Buffer, ext: string) => blake3(data.toString("base64") + ext).toString("hex").slice(0, 32);
const extOf = (p: string) => (p.split("?")[0].match(/\.([a-z0-9]+)$/i)?.[1] ?? "").toLowerCase();

export function cloudflareReady(): boolean {
  return Boolean(process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID);
}

/* ---------- Building a version ---------- */

type ManifestFile = { path: string; hash: string; type: string };
type EngineManifest = { version: string; engine: ManifestFile[]; shared: ManifestFile[]; tours: ManifestFile[] };

async function own(origin: string, path: string): Promise<Response> {
  // Only ever Arpo's own address and a path starting with "/" - never an address from the tour's setup.
  if (!path.startsWith("/") || path.startsWith("//")) throw new Error(`Ugyldig sti: ${path}`);
  return fetch(`${origin}${path}`, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
}

/** Pictures and files the tour's data points at on Arpo itself (files kept in the database, the story pictures). */
const LOCAL = /(?<=["'(\s]|^)\/(?:api\/tour-files\/[A-Za-z0-9_-]+|t\/[a-z0-9-]+\/historie\?[^"'\s)\\]+)/g;
/** Folders in public/tours the tour uses - a folder goes along whole (drone tiles and 360 pictures are read from it by name). */
const TOUR_FOLDERS = /(?<=["'(\s]|^)\/tours\/([a-z0-9_-]+)\//gi;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** JSON inside a <script> tag: nothing in it can close the tag or start markup. */
const scriptJson = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

/**
 * Builds a version of the tour: its page (/<slug>, data inside), its pictures
 * (/_t/<slug>/<hash>.<ext>, or /tours/… as they are), the engine and the
 * viewer. `origin`: where Arpo itself answers right now (to read the engine
 * and the pictures from). Returns the files, the content of what was made
 * here, and the pictures that couldn't be read (left pointing at Arpo).
 */
export async function buildVersion(slug: string, origin: string) {
  const tour = await prisma.tour.findUnique({ where: { slug }, select: { slug: true, config: true } });
  if (!tour) throw new Error("Touren findes ikke.");
  const engine = (await (await own(origin, "/tour-engine/manifest.json")).json()) as EngineManifest;
  const data = await loadTour(tour.config as unknown as TourConfig);

  const files: Files = {};
  const contents = new Map<string, Buffer>();
  const missing: string[] = [];
  for (const f of [...engine.engine, ...engine.shared]) {
    files[f.path] = { h: f.hash, t: f.type, src: f.path.startsWith("/_engine/") ? f.path.replace(/^\/_engine\//, "/tour-engine/") : f.path };
  }

  let json = JSON.stringify(data);
  const folders = new Set([...json.matchAll(TOUR_FOLDERS)].map((m) => `/tours/${m[1]}/`));
  for (const f of engine.tours) if ([...folders].some((d) => f.path.startsWith(d))) files[f.path] = { h: f.hash, t: f.type, src: f.path };

  // The tour's own pictures kept in Arpo: fetched now and put next to the page.
  const urls = [...new Set(json.match(LOCAL) ?? [])];
  const moved = new Map<string, string>();
  for (const url of urls) {
    const res = await own(origin, url).catch(() => null);
    if (!res?.ok) {
      missing.push(url);
      moved.set(url, `${ARPO_ORIGIN()}${url}`);
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim() || TYPES[extOf(url)] || "application/octet-stream";
    const ext = EXT[type] || extOf(url) || "bin";
    const h = cfHash(buf, ext);
    const path = `/_t/${slug}/${h}.${ext}`;
    files[path] = { h, t: type, src: url };
    contents.set(h, buf);
    moved.set(url, path);
  }
  json = json.replace(LOCAL, (u) => moved.get(u) ?? u);
  const ready = JSON.parse(json) as typeof data;

  const icon = ready.tour.favicon || ready.tour.logo || "";
  const page = `<!doctype html>
<html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex">
<title>${esc(`${ready.tour.title} – virtuel tour`)}</title>${icon ? `<link rel="icon" href="${esc(icon)}">` : ""}
<link rel="stylesheet" href="/_engine/${engine.version}/tour.css"><style>html,body{margin:0;height:100%;background:#0d1b20}</style></head>
<body><div id="tour"></div><script>window.__TOUR_API__=${scriptJson(ARPO_ORIGIN())}</script><script id="tour-data" type="application/json">${scriptJson(ready)}</script><script type="module" src="/_engine/${engine.version}/tour.js"></script></body></html>`;
  const pageBuf = Buffer.from(page);
  const pageHash = cfHash(pageBuf, "html");
  files[`/${slug}.html`] = { h: pageHash, t: "text/html", d: pageBuf.toString("base64") };
  contents.set(pageHash, pageBuf);
  return { files, contents, engine: engine.version, missing };
}

/* ---------- Cloudflare ---------- */

async function cf<T>(path: string, init: RequestInit = {}, bearer = process.env.CLOUDFLARE_API_TOKEN): Promise<T> {
  const res = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${bearer}`, ...(init.headers ?? {}) }, cache: "no-store", signal: AbortSignal.timeout(120_000) });
  const body = (await res.json().catch(() => null)) as { success?: boolean; result?: T; errors?: { message?: string }[] } | null;
  // Cloudflare's error text only - never the request (it holds the token in its headers).
  if (!res.ok || !body?.success) throw new Error(`Cloudflare svarede ${res.status}: ${body?.errors?.map((e) => e.message).join("; ") || "ukendt fejl"}`);
  return body.result as T;
}

const account = () => `/accounts/${encodeURIComponent(process.env.CLOUDFLARE_ACCOUNT_ID ?? "")}`;

async function ensureProject(): Promise<void> {
  try {
    await cf(`${account()}/pages/projects/${PAGES_PROJECT}`);
  } catch (err) {
    if (!String(err).includes("404")) throw err;
    await cf(`${account()}/pages/projects`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: PAGES_PROJECT, production_branch: "main" }) });
  }
}

const HEADERS = `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Robots-Tag: noindex
/_engine/*
  Cache-Control: public, max-age=31536000, immutable
/_t/*
  Cache-Control: public, max-age=31536000, immutable
  Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; img-src data:
/tours/*
  Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; img-src data:
`;

/**
 * Puts every tour's live version out on Cloudflare as one deployment.
 * `fresh`: content made just now (it isn't on Arpo to be fetched again).
 */
async function deploy(fresh: Map<string, Buffer>, origin: string): Promise<void> {
  if (!cloudflareReady()) throw new Error("Cloudflare er ikke sat op - CLOUDFLARE_API_TOKEN og CLOUDFLARE_ACCOUNT_ID mangler i Vercel.");
  await ensureProject();
  const live = await prisma.tour.findMany({ where: { liveVersion: { not: null } }, select: { id: true, slug: true, oldSlugs: true, liveVersion: true } });
  const pubs = await prisma.tourPublication.findMany({ where: { OR: live.map((t) => ({ tourId: t.id, version: t.liveVersion! })) }, select: { files: true } });
  const all: Files = {};
  for (const p of pubs) Object.assign(all, p.files as Files);

  const { jwt } = await cf<{ jwt: string }>(`${account()}/pages/projects/${PAGES_PROJECT}/upload-token`);
  const hashes = [...new Set(Object.values(all).map((f) => f.h))];
  const missing = new Set(
    hashes.length ? await cf<string[]>("/pages/assets/check-missing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hashes }) }, jwt) : []
  );

  // Up in batches of at most ~20 MB.
  const byHash = new Map(Object.values(all).map((f) => [f.h, f]));
  let batch: { key: string; value: string; metadata: { contentType: string }; base64: true }[] = [];
  let size = 0;
  const send = async () => {
    if (!batch.length) return;
    await cf("/pages/assets/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(batch) }, jwt);
    batch = [];
    size = 0;
  };
  for (const h of missing) {
    const f = byHash.get(h);
    if (!f) continue;
    let buf = fresh.get(h) ?? (f.d ? Buffer.from(f.d, "base64") : null);
    if (!buf && f.src) {
      const res = await own(origin, f.src);
      if (!res.ok) throw new Error(`Kunne ikke hente ${f.src} til Cloudflare (${res.status}).`);
      buf = Buffer.from(await res.arrayBuffer());
    }
    if (!buf) throw new Error("En fil i en tidligere version findes ikke længere - udgiv touren igen.");
    if (size + buf.length > 20 * 1024 * 1024) await send();
    batch.push({ key: h, value: buf.toString("base64"), metadata: { contentType: f.t }, base64: true });
    size += buf.length;
  }
  await send();
  if (hashes.length) await cf("/pages/assets/upsert-hashes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hashes }) }, jwt).catch(() => {});

  // Old addresses of a tour go to its new one; the bare address to the website.
  const redirects = ["/ https://nextview360.dk 302", ...live.flatMap((t) => t.oldSlugs.map((o) => `/${o} /${t.slug} 301`))].join("\n");
  const form = new FormData();
  form.set("manifest", JSON.stringify(Object.fromEntries(Object.entries(all).map(([p, f]) => [p, f.h]))));
  form.set("branch", "main");
  form.set("_headers", new File([HEADERS], "_headers"));
  form.set("_redirects", new File([redirects + "\n"], "_redirects"));
  await cf(`${account()}/pages/projects/${PAGES_PROJECT}/deployments`, { method: "POST", body: form });
}

/* ---------- Publishing ---------- */

/**
 * Where Arpo reads the engine and pictures from while publishing: its own
 * fixed address once deployed (never the address a request came in on), the
 * local one while developing.
 */
export function arpoOrigin(requestOrigin: string): string {
  return process.env.VERCEL ? ARPO_ORIGIN() : requestOrigin;
}

export async function publishTour(slug: string, who: string, note: string | null, origin: string) {
  const tour = await prisma.tour.findUnique({ where: { slug }, select: { id: true, published: true } });
  if (!tour) throw new Error("Touren findes ikke.");
  const built = await buildVersion(slug, origin);
  const last = await prisma.tourPublication.findFirst({ where: { tourId: tour.id }, orderBy: { version: "desc" }, select: { version: true } });
  const version = (last?.version ?? 0) + 1;
  await prisma.tourPublication.create({ data: { tourId: tour.id, version, slug, files: built.files, engine: built.engine, note, createdByName: who } });
  const before = await prisma.tour.findUnique({ where: { slug }, select: { liveVersion: true } });
  await prisma.tour.update({ where: { slug }, data: { liveVersion: version, published: true } });
  try {
    await deploy(built.contents, origin);
  } catch (err) {
    // Not out there after all: the tour stays on what was live before.
    await prisma.tour.update({ where: { slug }, data: { liveVersion: before?.liveVersion ?? null } });
    throw err;
  }
  return { version, missing: built.missing };
}

/** Puts an older version live again (or `null`: takes the tour off Cloudflare). */
export async function setLiveVersion(slug: string, version: number | null, origin: string) {
  const tour = await prisma.tour.findUnique({ where: { slug }, select: { id: true, liveVersion: true } });
  if (!tour) throw new Error("Touren findes ikke.");
  if (version != null && !(await prisma.tourPublication.findUnique({ where: { tourId_version: { tourId: tour.id, version } } }))) throw new Error("Den version findes ikke.");
  await prisma.tour.update({ where: { slug }, data: { liveVersion: version } });
  try {
    await deploy(new Map(), origin);
  } catch (err) {
    await prisma.tour.update({ where: { slug }, data: { liveVersion: tour.liveVersion } });
    throw err;
  }
}
