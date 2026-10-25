"use client";

import { useState, useTransition } from "react";
import { setTourPublished } from "@/lib/actions/tours";
import type { TourConfig } from "../../tours/types";
import { Choice, Field, Group, input, Toggle } from "./ui";

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

export function SharePanel({ slug, title, published: initial, size, setSize }: { slug: string; title: string; published: boolean; size: EmbedSize; setSize: (s: EmbedSize) => void }) {
  const [published, setPublished] = useState(initial);
  const [copied, setCopied] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const url = `${typeof window === "undefined" ? "" : location.origin}/t/${slug}`;
  const code = embedCode(url, title, size);
  const copy = (text: string, what: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(what);
    setTimeout(() => setCopied(null), 1800);
  };
  return (
    <>
      <Group title="Udgiv">
        <Toggle
          on={published}
          onChange={(on) =>
            start(async () => {
              await setTourPublished(slug, on);
              setPublished(on);
            })
          }
          title={pending ? "Gemmer…" : published ? "Udgivet" : "Ikke udgivet"}
          hint={published ? "Alle kan se touren på linket og på kundens hjemmeside. Gemte ændringer er live med det samme." : "Kun Arpo kan se touren. Slå til, når den er klar til kunden."}
        />
        {published && (
          <div className="flex gap-2">
            <input readOnly className={`${input} text-[13px]`} value={url} onFocus={(e) => e.target.select()} />
            <button type="button" className="flex-none rounded-xl bg-white px-3 text-[14px] font-medium text-[#0071e3] ring-1 ring-black/[.06]" onClick={() => copy(url, "link")}>
              {copied === "link" ? "Kopieret" : "Kopiér"}
            </button>
          </div>
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
    </>
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
