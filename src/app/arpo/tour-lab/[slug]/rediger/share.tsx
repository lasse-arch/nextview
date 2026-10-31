"use client";

import { tourUrl } from "@/lib/public-urls";
import { useEffect, useState, useTransition } from "react";
import { setTourPublished, tourEmbedsOf } from "@/lib/actions/tours";
import type { TourEmbed } from "@/lib/tour-embeds";
import { EMBED_WORDS, TourEmbedList } from "@/components/tour-embed-list";
import { suggestEmbedPages } from "@/lib/actions/tour-embeds";
import { startPlaces } from "../../tours/places";
import type { TourConfig } from "../../tours/types";
import { Choice, Field, Group, input } from "./ui";
import { CloudflarePublish } from "./cloudflare";

/*
 * "Del": the tour goes on the customer's website as an iframe. The size is
 * chosen here, the code to paste is made from it, and the preview's
 * "På hjemmeside" shows the tour in that size on a page like theirs -
 * on a computer and a phone.
 */

export type EmbedSize = { kind: "16:9" | "4:3" | "fast" | "skaerm"; height: number };
export const DEFAULT_EMBED: EmbedSize = { kind: "16:9", height: 600 };

/** The box the tour sits in on the page - the same in the preview and in the code to paste. */
export function embedBox(size: EmbedSize): React.CSSProperties {
  if (size.kind === "fast") return { position: "relative", width: "100%", height: size.height };
  if (size.kind === "skaerm") return { position: "relative", width: "100%", height: "100vh", maxHeight: 900 };
  // A wide box on a computer, never too low on a phone (a tour needs height there).
  return { position: "relative", width: "100%", aspectRatio: size.kind === "16:9" ? "16 / 9" : "4 / 3", minHeight: 520, maxHeight: "90vh" };
}

const css = (style: React.CSSProperties) =>
  Object.entries(style)
    .map(([k, v]) => `${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}:${typeof v === "number" && k !== "aspectRatio" ? `${v}px` : v}`)
    .join(";");

export function embedCode(url: string, title: string, size: EmbedSize) {
  return `<div style="${css(embedBox(size))}">
  <iframe src="${url}" title="${title.replace(/"/g, "&quot;")}" style="position:absolute;inset:0;width:100%;height:100%;border:0;border-radius:12px"
    allow="fullscreen; xr-spatial-tracking; gyroscope; accelerometer; autoplay; clipboard-write" allowfullscreen loading="lazy"></iframe>
</div>`;
}

export function SharePanel({
  config,
  edit,
  slug,
  title,
  published: initial,
  onCloudflare,
  size,
  setSize,
}: {
  config: TourConfig;
  edit: (fn: (d: TourConfig) => void) => void;
  slug: string;
  title: string;
  published: boolean;
  onCloudflare: boolean;
  size: EmbedSize;
  setSize: (s: EmbedSize) => void;
}) {
  const [published, setPublished] = useState(initial);
  const [copied, setCopied] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const url = tourUrl(slug, typeof window === "undefined" ? "" : location.origin, onCloudflare);
  const code = embedCode(url, title, size);
  const copy = (text: string, what: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(what);
    setTimeout(() => setCopied(null), 1800);
  };
  return (
    <>
      <Group title="Udgiv">
        {/* One way out: "Udgiv på tour.nextview360.dk" below. Before that, the customer sees the tour through the review link (Gennemgang). */}
        {published && onCloudflare ? (
          <>
            <p className="px-1 text-[13px] text-[#1d1d1f]">Touren er udgivet på tour.nextview360.dk.</p>
            <div className="flex gap-2">
              <input readOnly className={`${input} text-[13px]`} value={url} onFocus={(e) => e.target.select()} />
              <button type="button" className="flex-none rounded-xl bg-white px-3 text-[14px] font-medium text-[#0071e3] ring-1 ring-black/[.06]" onClick={() => copy(url, "link")}>
                {copied === "link" ? "Kopieret" : "Kopiér"}
              </button>
            </div>
          </>
        ) : published ? (
          <>
            <p className="px-1 text-[13px] leading-snug text-[#1d1d1f]">Touren er udgivet på den gamle måde (direkte fra Arpo på {url.replace(/^https?:\/\//, "")}). Udgiv den på tour.nextview360.dk nedenfor - så kører den videre derfra. Eller tag den af nettet.</p>
            <button
              type="button"
              disabled={pending}
              className="w-full rounded-xl bg-white py-2 text-[14px] font-medium text-[#ff3b30] ring-1 ring-black/[.06] disabled:opacity-50"
              onClick={() =>
                confirm("Tag touren af nettet? Linket og koden på kundens hjemmeside holder op med at virke.") &&
                start(async () => {
                  const r = await setTourPublished(slug, false);
                  if (r.ok) setPublished(false);
                })
              }
            >
              {pending ? "Tager af nettet…" : "Tag af nettet"}
            </button>
          </>
        ) : (
          <p className="px-1 text-[13px] leading-snug text-[#6e6e73]">Ikke udgivet - kun Arpo kan se touren. Skal kunden se den først, så send gennemgangslinket under Gennemgang. Når den er klar: Udgiv på tour.nextview360.dk nederst her.</p>
        )}
      </Group>

      <Group title="På kundens hjemmeside">
        <Field title="Størrelse" hint='Se den i forhåndsvisningen under "På hjemmeside" - på computer og mobil.'>
          <Choice
            value={size.kind}
            options={[
              ["16:9", "Bred"],
              ["4:3", "Høj"],
              ["fast", "Fast højde"],
              ["skaerm", "Hele skærmen"],
            ]}
            onChange={(kind) => setSize({ ...size, kind })}
          />
        </Field>
        {size.kind === "fast" && (
          <Field title={`Højde: ${size.height} px`}>
            <input type="range" min={360} max={1000} step={20} className="w-full accent-[#0071e3]" value={size.height} onChange={(e) => setSize({ ...size, height: Number(e.target.value) })} />
          </Field>
        )}
        <p className="px-1 text-[12px] leading-snug text-[#8e8e93]">
          {size.kind === "16:9" && "Fylder bredden, med en høj nok kasse på mobil (min. 520 px). Godt til de fleste sider."}
          {size.kind === "4:3" && "Lidt højere - godt når touren er sidens hovedindhold."}
          {size.kind === "fast" && "Samme højde på alle skærme."}
          {size.kind === "skaerm" && "Fylder hele skærmen (max 900 px) - til en side, der kun er touren."}
        </p>
        <Field title="Kode til hjemmesiden">
          <textarea readOnly className={`${input} h-32 resize-none font-mono text-[11px] leading-snug`} value={code} onFocus={(e) => e.target.select()} />
        </Field>
        <button type="button" disabled={!published} className="w-full rounded-xl bg-[#0071e3] py-2.5 text-[15px] font-medium text-white hover:bg-[#0077ed] disabled:opacity-40" onClick={() => copy(code, "kode")}>
          {copied === "kode" ? "Kopieret ✓" : published ? "Kopiér koden" : "Udgiv touren først"}
        </button>
        <p className="px-1 text-[12px] leading-snug text-[#8e8e93]">Indsæt koden i en HTML-/kode-blok på siden (WordPress: blokken &quot;Tilpasset HTML&quot;).</p>
      </Group>
      <PagesGroup config={config} edit={edit} slug={slug} title={title} size={size} published={published} url={url} />
      <ShownGroup slug={slug} />
      <CloudflarePublish slug={slug} />
    </>
  );
}

/** The site the tour belongs to, guessed from where its main button leads. */
export function guessSite(T: TourConfig): string {
  if (T.embeds?.site) return T.embeds.site;
  const href = [...T.cta.filter((c) => c.primary), ...T.cta].map((c) => c.href).find((h) => /^https?:\/\//.test(h) && !/matterport|nextview360|google\.|instagram|facebook/.test(h));
  try {
    return href ? new URL(href).origin : "";
  } catch {
    return "";
  }
}

/**
 * "Et sted på hver underside": each place in the tour gets its own code that
 * starts there (?rum=…), and the page on the customer's site it belongs on -
 * suggested from their sitemap, confirmed or changed here. The customer sees
 * the same list with the codes in their portal.
 */
/** "Her er touren vist": the pages showing the tour in a frame now (the customer sees the same on their page). */
function ShownGroup({ slug }: { slug: string }) {
  const [embeds, setEmbeds] = useState<TourEmbed[] | null>(null);
  useEffect(() => {
    let off = false;
    tourEmbedsOf(slug)
      .then((e) => !off && setEmbeds(e))
      .catch(() => !off && setEmbeds([]));
    return () => {
      off = true;
    };
  }, [slug]);
  return (
    <Group title="Her er touren vist">
      <p className="px-1 text-[12px] leading-snug text-[#8e8e93]">Sider, hvor touren er sat ind og er blevet åbnet de sidste 90 dage. Kunden ser det samme på sin kundeside.</p>
      {embeds ? <TourEmbedList embeds={embeds} words={EMBED_WORDS.da} /> : <p className="px-1 text-[13px] text-[#8e8e93]">Henter …</p>}
    </Group>
  );
}

function PagesGroup({ config, edit, slug, title, size, published, url }: { config: TourConfig; edit: (fn: (d: TourConfig) => void) => void; slug: string; title: string; size: EmbedSize; published: boolean; url: string }) {
  const places = startPlaces(config);
  const pages = config.embeds?.pages ?? {};
  const [site, setSite] = useState(guessSite(config));
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const setPage = (key: string, page: string) =>
    edit((d) => {
      const next = { ...d.embeds?.pages, [key]: page };
      if (!page) delete next[key];
      d.embeds = { ...d.embeds, pages: next };
    });
  const copy = (key: string) => {
    navigator.clipboard?.writeText(embedCode(key ? `${url}?rum=${key}` : url, title, size)).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied(null), 1600);
  };
  const row = (key: string, name: string, group: string | null) => (
    <li key={key || "_hele"} className="space-y-1 py-2">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[14px] font-medium">
          {name}
          {group && <span className="font-normal text-[#8e8e93]"> · {group}</span>}
        </span>
        <button type="button" disabled={!published} onClick={() => copy(key)} className="flex-none rounded-full bg-[#f2f2f7] px-2.5 py-1 text-[12px] font-medium text-[#0071e3] disabled:opacity-40">
          {copied === key ? "Kopieret ✓" : "Kopiér kode"}
        </button>
      </div>
      <input className={`${input} py-1.5 text-[12px]`} placeholder="Underside, fx https://kunden.dk/minigolf/" value={pages[key || "_hele"] ?? ""} onChange={(e) => setPage(key || "_hele", e.target.value)} />
    </li>
  );
  return (
    <Group title="Et sted på hver underside">
      <p className="text-[12px] leading-snug text-[#8e8e93]">Hvert sted i touren har sin egen kode, der starter dér - fx starter touren i minigolf på siden om minigolf. Find forslag fra kundens hjemmeside, ret til, og gem. Kunden ser koderne i sin kundeportal.</p>
      <div className="flex gap-2">
        <input className={`${input} text-[13px]`} value={site} onChange={(e) => setSite(e.target.value)} placeholder="kunden.dk" />
        <button
          type="button"
          disabled={pending || !site.trim()}
          className="flex-none rounded-xl bg-[#0071e3] px-3 text-[13px] font-medium text-white disabled:opacity-40"
          onClick={() =>
            start(async () => {
              setMsg(null);
              const r = await suggestEmbedPages(slug, site);
              if (!r.ok) return setMsg(r.error);
              const found = Object.entries(r.pages);
              edit((d) => {
                const next = { ...d.embeds?.pages };
                for (const [key, page] of found) if (!next[key]) next[key] = page.url;
                if (!next._hele) next._hele = new URL(/^https?:/.test(site) ? site : `https://${site}`).origin + "/";
                d.embeds = { ...d.embeds, site, pages: next };
              });
              setMsg(`Læste ${r.checked} sider - fandt en side til ${found.length} af ${places.length} steder. Tjek dem, og tryk Gem.`);
            })
          }
        >
          {pending ? "Læser siden…" : "Find forslag"}
        </button>
      </div>
      {msg && <p className="px-1 text-[12px] text-[#6e6e73]">{msg}</p>}
      <ul className="divide-y divide-black/[.05]">
        {row("", "Hele touren", "starter som normalt")}
        {places.map((p) => row(p.key, p.name, p.group))}
      </ul>
      {!published && <p className="px-1 text-[12px] text-[#ff9500]">Koderne virker, når touren er udgivet.</p>}
    </Group>
  );
}

/** The tour as it sits on the customer's page: a page in their colours with the tour in the chosen size. */
export function SitePreview({ config, size, width, children }: { config: TourConfig; size: EmbedSize; width: "computer" | "mobil"; children: React.ReactNode }) {
  const phone = width === "mobil";
  const bar = (w: string) => <div className="h-2.5 rounded-full bg-black/[.08]" style={{ width: w }} />;
  return (
    <div className={`flex h-full flex-col overflow-hidden bg-white shadow-[0_20px_50px_rgba(0,0,0,.15)] ring-1 ring-black/10 ${phone ? "w-[min(390px,100%)] rounded-[40px] border-[10px] border-[#1d1d1f]" : "w-full rounded-xl"}`}>
      <div className="overflow-y-auto" style={{ fontFamily: `${config.font}, system-ui, sans-serif` }}>
        <header className="flex items-center justify-between px-5 py-3" style={{ background: config.colors.main }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {config.logo ? <img src={config.logo} alt="" className="h-7 max-w-[140px] object-contain" style={config.logoOnLight ? { background: "#fff", borderRadius: 6, padding: 3 } : undefined} /> : <b className="text-white">{config.brand}</b>}
          {!phone && <div className="flex gap-4 text-[12px] text-white/80">{["Forside", "Om os", "Kontakt"].map((t) => <span key={t}>{t}</span>)}</div>}
        </header>
        <div className="space-y-2.5 px-5 py-6">
          <div className="text-[20px] font-semibold" style={{ color: config.colors.main }}>{config.brand || "Kundens side"}</div>
          {bar("80%")}
          {bar("60%")}
        </div>
        <div className="px-5" style={{ ...embedBox(size), ...(size.kind === "skaerm" ? { height: phone ? 700 : 620 } : {}) }}>
          <div className="absolute inset-0 mx-5 overflow-hidden rounded-xl bg-black">{children}</div>
        </div>
        <div className="space-y-2.5 px-5 py-6">
          {bar("70%")}
          {bar("85%")}
          {bar("50%")}
        </div>
        <footer className="px-5 py-6" style={{ background: config.colors.soft }}>
          {bar("40%")}
        </footer>
      </div>
    </div>
  );
}
