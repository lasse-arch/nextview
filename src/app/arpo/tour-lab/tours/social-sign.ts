import { SOCIALS, type SocialKind } from "./social";

/*
 * "Følg os"-skilte to put on a wall (Virtual staging): the social site's own
 * colours and icon, "Følg os på …" and the account - drawn here as a picture
 * (no file to fetch: it works on every copy of the tour). A tap on it opens
 * the account in a new tab.
 */

const BRAND: Record<SocialKind, { bg: string; fg: string; gradient?: [string, string, string] }> = {
  instagram: { bg: "#d62976", fg: "#fff", gradient: ["#feda75", "#d62976", "#4f5bd5"] },
  facebook: { bg: "#1877f2", fg: "#fff" },
  linkedin: { bg: "#0a66c2", fg: "#fff" },
  tiktok: { bg: "#111111", fg: "#fff" },
  youtube: { bg: "#ff0000", fg: "#fff" },
  x: { bg: "#111111", fg: "#fff" },
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The account as people write it: "@skyumefterskole" from instagram.com/skyumefterskole. */
export function socialHandle(href: string): string {
  const path = href.replace(/^https?:\/\//i, "").replace(/^[^/]+\/?/, "").replace(/[?#].*$/, "").replace(/\/+$/, "");
  const last = path.split("/").filter((p) => p && !["company", "in", "channel", "c", "user", "pages"].includes(p.toLowerCase())).pop() ?? "";
  if (!last) return "";
  return last.startsWith("@") ? last : `@${decodeURIComponent(last)}`;
}

/** The sign as a picture (an SVG data address), 600 × 600. */
export function socialSign(kind: SocialKind, href: string, text = "Følg os"): string {
  const s = SOCIALS.find((x) => x.kind === kind)!;
  const b = BRAND[kind];
  const handle = socialHandle(href).slice(0, 28);
  const fill = b.gradient ? "url(%23g)" : b.bg;
  const line = `${text} på ${s.name}`;
  // Shrunk to fit the sign (about half an em a letter in bold Helvetica).
  const fit = (str: string, max: number, room = 520) => Math.round(Math.min(max, room / Math.max(1, str.length * 0.56)));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">${
    b.gradient ? `<defs><linearGradient id="g" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="${b.gradient[0]}"/><stop offset=".5" stop-color="${b.gradient[1]}"/><stop offset="1" stop-color="${b.gradient[2]}"/></linearGradient></defs>` : ""
  }<rect x="10" y="10" width="580" height="580" rx="120" fill="${fill}"/><g transform="translate(190 92) scale(9.2)" fill="${b.fg}" color="${b.fg}">${s.icon}</g><text x="300" y="440" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="${fit(line, 58)}" font-weight="800" fill="${b.fg}">${esc(line)}</text>${
    handle ? `<text x="300" y="512" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="${fit(handle, 42)}" font-weight="600" fill="${b.fg}" opacity=".9">${esc(handle)}</text>` : ""
  }</svg>`;
  // "#" must be written %23 in a data address (url(#g) above already is).
  return `data:image/svg+xml,${encodeURIComponent(svg).replace(/%2523/g, "%23")}`;
}

/**
 * The sign as a PNG file (in the browser), for uploading to the tour: a tour
 * only takes pictures as files or PNG/JPEG/WebP - never an SVG address, as
 * an SVG can carry script.
 */
export async function socialSignPng(kind: SocialKind, href: string, text = "Følg os"): Promise<File> {
  return svgToPng(socialSign(kind, href, text), `${kind}-skilt.png`);
}

/** An SVG data address drawn onto a 600 × 600 canvas, as a PNG file. */
export async function svgToPng(svgAddress: string, name: string): Promise<File> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Skiltet kunne ikke tegnes."));
    img.src = svgAddress;
  });
  const canvas = document.createElement("canvas");
  canvas.width = 600;
  canvas.height = 600;
  canvas.getContext("2d")!.drawImage(img, 0, 0, 600, 600);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Skiltet kunne ikke laves som billede.");
  return new File([blob], name, { type: "image/png" });
}
