import "server-only";
import sharp from "sharp";
import { launchHeadlessChromium } from "@/lib/headless-chromium";
import { openPublicPage } from "@/lib/site-placement";
import { readLimited, safeFetch } from "@/lib/safe-fetch";

/*
 * "Brug hjemmesidens farver", sharper: the customer's front page opened in
 * the guarded headless browser (public sites only - see site-placement.ts)
 * and its colours measured as they are shown - the buttons, the header and
 * menu, the footer, headings, links and the big surfaces, weighted by how
 * much of the page they cover - plus the colours in the logo itself and a
 * picture of the page for nextviewAI to look at. Nothing from the page is run
 * on our side; the page's words and colours are only data.
 */

export type MeasuredLook = {
  /** For nextviewAI, as text. */
  text: string;
  /** The top of the front page as it looks (JPEG), for nextviewAI to see. */
  shot: Buffer | null;
};

/* Run in the page as plain text: what is shown, and in which colours. */
const MEASURE = `(() => {
  const hex = (c) => { const m = /rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([\\d.]+))?/.exec(c || ""); if (!m || (m[4] !== undefined && +m[4] < 0.6)) return null; return "#" + [m[1], m[2], m[3]].map((v) => (+v).toString(16).padStart(2, "0")).join(""); };
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 4 && r.height > 4 && cs.visibility !== "hidden" && cs.display !== "none" && +cs.opacity > 0.3; };
  const add = (m, k, w) => { if (k) m[k] = (m[k] || 0) + w; };
  const top = (m, n) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => k);
  const vw = innerWidth;
  const buttons = {}, buttonText = {}, links = {}, headings = {}, surfaces = {}, header = {}, footer = {};
  for (const el of document.querySelectorAll("a, button, input[type=submit], [role=button], [class*=btn], [class*=button], [class*=cta]")) {
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    const bg = hex(cs.backgroundColor);
    // A button: a filled box of button size (not the whole header).
    if (bg && r.width < vw * 0.6 && r.height >= 24 && r.height < 120) { add(buttons, bg, r.width * r.height); add(buttonText, hex(cs.color), 1); }
    else if (el.tagName === "A" && !bg) add(links, hex(cs.color), 1);
  }
  for (const el of document.querySelectorAll("h1, h2, h3")) if (vis(el)) add(headings, hex(getComputedStyle(el).color), el.tagName === "H1" ? 3 : 1);
  const scrollH = Math.min(document.documentElement.scrollHeight, 9000);
  for (const el of document.querySelectorAll("body, body *")) {
    const r = el.getBoundingClientRect(); if (r.width < vw * 0.7 || r.height < 60 || !vis(el)) continue;
    const bg = hex(getComputedStyle(el).backgroundColor); if (!bg) continue;
    const y = r.top + scrollY; const area = r.width * Math.min(r.height, 2000);
    if (y < 160 && r.height < 260) add(header, bg, area);
    else if (y + r.height > scrollH - 40 && r.height < 900) add(footer, bg, area);
    else add(surfaces, bg, area);
  }
  const logo = [...document.querySelectorAll("img, svg")].filter((el) => vis(el) && el.getBoundingClientRect().top + scrollY < 250 && /logo/i.test((el.getAttribute("src") || "") + " " + (el.getAttribute("alt") || "") + " " + (el.getAttribute("class") || "") + " " + (el.closest("[class*=logo],[id*=logo]") ? "logo" : ""))).sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0];
  const font = (sel) => { const el = document.querySelector(sel); return el ? getComputedStyle(el).fontFamily.split(",")[0].replace(/["']/g, "").trim() : ""; };
  return {
    buttons: top(buttons, 5), buttonText: top(buttonText, 3), links: top(links, 4), headings: top(headings, 4),
    header: top(header, 3), footer: top(footer, 3), surfaces: top(surfaces, 6), body: hex(getComputedStyle(document.body).backgroundColor) || "#ffffff",
    themeColor: (document.querySelector("meta[name=theme-color]") || {}).content || "",
    logo: logo && logo.tagName === "IMG" ? (logo.currentSrc || logo.src) : "",
    fontBody: font("p") || font("body"), fontHeading: font("h1") || font("h2"),
  };
})()`;

type Measured = { buttons: string[]; buttonText: string[]; links: string[]; headings: string[]; header: string[]; footer: string[]; surfaces: string[]; body: string; themeColor: string; logo: string; fontBody: string; fontHeading: string };

/** The logo's own colours - its main, non-white, non-transparent ones, the most used first. */
async function logoColors(url: string): Promise<string[]> {
  if (!/^https?:\/\//i.test(url)) return [];
  const res = await safeFetch(url, { signal: AbortSignal.timeout(10_000), maxRedirects: 2 });
  if (!res.ok || !/^image\//i.test(res.headers.get("content-type") ?? "")) return [];
  const { data, info } = await sharp(await readLimited(res, 3_000_000), { limitInputPixels: 40_000_000 }).resize(80, 80, { fit: "inside" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const buckets = new Map<string, { n: number; r: number; g: number; b: number }>();
  let total = 0;
  for (let i = 0; i < info.width * info.height * 4; i += 4) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    if (a < 160) continue;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    // Near white (the background) left out; near black and greys kept (a black logo is a colour too).
    if (min > 232) continue;
    total++;
    const key = `${r >> 5},${g >> 5},${b >> 5},${max - min < 18 ? "g" : "c"}`;
    const k = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    k.n++;
    k.r += r;
    k.g += g;
    k.b += b;
    buckets.set(key, k);
  }
  return [...buckets.values()]
    .filter((k) => k.n / Math.max(1, total) > 0.04)
    .sort((a, b) => b.n - a.n)
    .slice(0, 5)
    .map((k) => `#${[k.r, k.g, k.b].map((v) => Math.round(v / k.n).toString(16).padStart(2, "0")).join("")}`);
}

export async function measureSiteLook(site: string): Promise<MeasuredLook> {
  const browser = await launchHeadlessChromium();
  try {
    const page = await openPublicPage(browser, site, false);
    const m = (await page.evaluate(MEASURE)) as Measured;
    await page.evaluate("scrollTo(0, 0)").catch(() => {});
    const shot = Buffer.from(await page.screenshot({ type: "jpeg", quality: 70 }));
    const logo = m.logo ? await logoColors(m.logo).catch(() => []) : [];
    const list = (xs: string[]) => (xs.length ? xs.join(", ") : "-");
    const text = [
      `Målt på den viste side (vigtigst først):`,
      `- Knapper (fyldte): ${list(m.buttons)} - tekst på knapperne: ${list(m.buttonText)}`,
      `- Toppen/menuen: ${list(m.header)}`,
      `- Bunden/footer: ${list(m.footer)}`,
      `- Overskrifter: ${list(m.headings)}`,
      `- Links: ${list(m.links)}`,
      `- Store flader (efter areal): ${list(m.surfaces)} - siden selv: ${m.body}`,
      `- theme-color: ${m.themeColor || "-"}`,
      `- Logoets egne farver: ${list(logo)}`,
      `- Skrift: brødtekst ${m.fontBody || "-"}, overskrifter ${m.fontHeading || "-"}`,
    ].join("\n");
    return { text, shot };
  } finally {
    await browser.close().catch(() => {});
  }
}
