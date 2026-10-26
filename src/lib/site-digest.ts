import "server-only";

/*
 * A customer's website, boiled down to what a tour needs to look and sound
 * like it: name, logo, colours, fonts, the links people act on (booking,
 * contact…) and the words the site uses about itself. Read for Claude when a
 * new tour is started from the website (see tour-ai.ts).
 */

const UA = "Mozilla/5.0 (compatible; ArpoTourBuilder/1.0; +https://www.arpo.dk)";

/** Only public web addresses - never our own server or the local network. */
function publicUrl(raw: string): URL {
  const url = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
  if (!/^https?:$/.test(url.protocol)) throw new Error("Kun http(s)-adresser.");
  const h = url.hostname;
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || /^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(":")) throw new Error("Adressen skal være en offentlig hjemmeside.");
  return url;
}

async function fetchText(url: URL, max: number): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,text/css,*/*" }, signal: AbortSignal.timeout(15_000), redirect: "follow" });
  if (!res.ok) throw new Error(`${url.hostname} svarede ${res.status}.`);
  return (await res.text()).slice(0, max);
}

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
const strip = (html: string) => decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const attr = (tag: string, name: string) => decode(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag)?.slice(1).find((x) => x != null) ?? "");

function top<T>(items: T[], n: number): T[] {
  const counts = new Map<T, number>();
  for (const i of items) counts.set(i, (counts.get(i) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
}

export async function siteDigest(address: string): Promise<string> {
  const base = publicUrl(address);
  const html = await fetchText(base, 1_500_000);
  const abs = (href: string) => {
    try {
      return new URL(href, base).toString();
    } catch {
      return null;
    }
  };
  const meta = (name: string) => {
    const tag = [...html.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]).find((t) => [attr(t, "name"), attr(t, "property")].some((v) => v.toLowerCase() === name));
    return tag ? attr(tag, "content") : "";
  };

  // The site's own CSS (the first few files) - colours and fonts live there.
  const cssLinks = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]).filter((t) => /stylesheet/i.test(attr(t, "rel")));
  const css = [
    ...[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]),
    ...(await Promise.all(
      cssLinks
        .map((t) => abs(attr(t, "href")))
        .filter((u): u is string => Boolean(u) && !/fonts\.googleapis/.test(u!))
        .slice(0, 4)
        .map((u) => fetchText(publicUrl(u), 400_000).catch(() => ""))
    )),
  ].join("\n");
  const styleAttrs = [...html.matchAll(/style="([^"]*)"/gi)].map((m) => m[1]).join(";");

  const googleFonts = cssLinks
    .map((t) => attr(t, "href"))
    .filter((h) => /fonts\.googleapis/.test(h))
    .flatMap((h) => [...h.matchAll(/family=([^&:]+)/g)].map((m) => decodeURIComponent(m[1].replace(/\+/g, " "))));
  const fontFamilies = top(
    [...`${css};${styleAttrs}`.matchAll(/font-family\s*:\s*([^;}]+)/gi)].map((m) => m[1].split(",")[0].replace(/["']/g, "").trim()).filter((f) => f && !/^(inherit|initial|var\(|-apple|system-ui|sans-serif|serif|monospace)/i.test(f)),
    6
  );
  const colors = top(
    [...`${css};${styleAttrs}`.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)].map((m) => {
      const h = m[1].toLowerCase();
      return `#${h.length === 3 ? h.replace(/./g, "$&$&") : h}`;
    }),
    16
  );
  const cssVars = top([...css.matchAll(/(--[\w-]*(?:color|primary|secondary|accent|brand|main)[\w-]*)\s*:\s*(#[0-9a-f]{3,8}|rgba?\([^)]*\))/gi)].map((m) => `${m[1]}: ${m[2]}`), 16);

  const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  const icons = [...html.matchAll(/<link\b[^>]*>/gi)]
    .map((m) => m[0])
    .filter((t) => /(^|\s)(icon|apple-touch-icon)(\s|$)/i.test(attr(t, "rel")))
    .map((t) => abs(attr(t, "href")))
    .filter((u): u is string => Boolean(u));
  const logos = [
    ...imgs.filter((t) => /logo/i.test(`${attr(t, "src")} ${attr(t, "alt")} ${attr(t, "class")} ${attr(t, "id")}`)).map((t) => {
        const src = [attr(t, "data-src"), attr(t, "src")].find((u) => u && !u.startsWith("data:"));
        return src ? abs(src) : null;
      }),
    ...[...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]).filter((t) => /apple-touch-icon/i.test(attr(t, "rel"))).map((t) => abs(attr(t, "href"))),
  ].filter((u): u is string => Boolean(u));

  const links = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)]
    .map((m) => ({ href: abs(attr(m[1], "href")), text: strip(m[2]).slice(0, 60) }))
    .filter((l): l is { href: string; text: string } => Boolean(l.href && l.text) && !l.href!.startsWith("javascript:"));
  const uniqueLinks = links.filter((l, i) => links.findIndex((x) => x.href === l.href) === i).slice(0, 70);

  const body = html.replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ");
  const headings = [...body.matchAll(/<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map((m) => `${"#".repeat(Number(m[1]))} ${strip(m[2])}`).filter((h) => h.length > 3);
  const paragraphs = [...body.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => strip(m[1])).filter((p) => p.length > 30);

  return [
    `Adresse: ${base}`,
    `Titel: ${strip(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "")}`,
    `Beskrivelse: ${meta("description") || meta("og:description")}`,
    `Sitenavn: ${meta("og:site_name")}`,
    `Delingsbillede (og:image): ${meta("og:image") ? abs(meta("og:image")) : ""}`,
    `theme-color: ${meta("theme-color")}`,
    `Favicon-kandidater (største først er bedst): ${[...new Set(icons)].slice(0, 4).join(" | ")}`,
    `Logo-kandidater: ${[...new Set(logos)].slice(0, 6).join(" | ")}`,
    `Google Fonts: ${[...new Set(googleFonts)].join(", ")}`,
    `Skrifter i CSS (mest brugt først): ${fontFamilies.join(", ")}`,
    `Farvevariabler: ${cssVars.join("; ")}`,
    `Farver i CSS (mest brugt først): ${colors.join(", ")}`,
    `\nLinks (tekst → adresse):\n${uniqueLinks.map((l) => `- ${l.text} → ${l.href}`).join("\n")}`,
    `\nOverskrifter:\n${headings.slice(0, 30).join("\n")}`,
    `\nTekst:\n${paragraphs.join("\n").slice(0, 5000)}`,
  ].join("\n");
}
