"use client";

import { useState } from "react";
import { DEFAULT_EMBED, embedCode, type EmbedSize } from "@/app/arpo/tour-lab/[slug]/rediger/share";

/*
 * The customer portal's "Touren på jeres hjemmeside": a code for the whole
 * tour and one for each place in it (starting right there), with the page on
 * their site it belongs on - and how to put a code on a page in the systems
 * websites are usually made with.
 */

export type PortalPlace = { key: string; name: string; group: string | null; page: string | null };

const GUIDES_EN: [string, string[]][] = [
  ["WordPress (block editor)", ["Open the page, and click + to add a block.", 'Pick the "Custom HTML" block (search "HTML").', "Paste the code, and press Update."]],
  ["WordPress with Elementor", ['Drag the "HTML" widget to where the tour should be.', "Paste the code in the field.", "Press Update."]],
  ["Wix", ['Click "Add" (+) → "Embed code" → "Embed HTML".', 'Pick "Code", and paste the code.', "Drag the box large, and press Publish."]],
  ["Squarespace", ['Click "Add block" → "Code".', 'Paste the code, and turn "Display source" off.', "Save the page."]],
  ["Shopify", ["Go to Online Store → Pages → pick the page.", 'Click "<>" (show HTML) in the text field.', "Paste the code, and save."]],
  ["Webflow", ['Drag the "Embed" element in.', "Paste the code, and save.", "Publish the site."]],
  ["Other / your web agency", ["Send the code to whoever makes your website.", "It goes in as HTML where the tour should be.", "Contact us if you'd like help - we'll put it in together with you."]],
];

const T = {
  da: {
    copied: "Kopieret ✓",
    copy: "Kopiér kode",
    on: "På",
    title: "Touren på jeres hjemmeside",
    lead: "Sæt touren ind på de sider, den passer til - på siden om et sted starter touren lige dér. Kopiér koden, og sæt den ind på siden (se hvordan nedenfor).",
    whole: "Hele touren",
    wholeSub: "Til forsiden eller en side om jer",
    other: (n: number) => `Andre steder i touren (${n})`,
    how: "Sådan sætter I koden ind",
  },
  en: {
    copied: "Copied ✓",
    copy: "Copy code",
    on: "On",
    title: "The tour on your website",
    lead: "Put the tour on the pages it fits - on the page about a place, the tour starts right there. Copy the code, and paste it on the page (see how below).",
    whole: "The whole tour",
    wholeSub: "For the front page or a page about you",
    other: (n: number) => `Other places in the tour (${n})`,
    how: "How to put the code in",
  },
};

const GUIDES: [string, string[]][] = [
  ["WordPress (blok-editoren)", ["Åbn siden, og klik på + for at tilføje en blok.", 'Vælg blokken "Tilpasset HTML" (søg "HTML").', "Indsæt koden, og tryk Opdater."]],
  ["WordPress med Elementor", ['Træk widget\'en "HTML" ind, hvor touren skal være.', "Indsæt koden i feltet.", "Tryk Opdater."]],
  ["Wix", ['Klik "Tilføj" (+) → "Integrer kode" → "Integrer HTML".', 'Vælg "Kode", og indsæt koden.', "Træk boksen stor, og tryk Udgiv."]],
  ["Squarespace", ['Klik "Tilføj blok" → "Kode".', "Indsæt koden, og slå \"Vis kilde\" fra.", "Gem siden."]],
  ["Shopify", ['Gå til Online Store → Sider → vælg siden.', 'Klik på "<>" (vis HTML) i tekstfeltet.', "Indsæt koden, og gem."]],
  ["Webflow", ['Træk elementet "Embed" ind.', "Indsæt koden, og gem.", "Udgiv sitet."]],
  ["Andet / jeres webbureau", ["Send koden til den, der laver jeres hjemmeside.", "Den skal sættes ind som HTML der, hvor touren skal være.", "Kontakt os, hvis I vil have hjælp - så sætter vi den ind sammen med jer."]],
];

export function PortalEmbeds({ url, title, size, places, whole, lang = "da", heading = true }: { url: string; title: string; size?: EmbedSize; places: PortalPlace[]; whole: string | null; lang?: "da" | "en"; heading?: boolean }) {
  const t = T[lang];
  const [copied, setCopied] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const copy = (key: string) => {
    navigator.clipboard?.writeText(embedCode(key ? `${url}?rum=${key}` : url, title, size ?? DEFAULT_EMBED)).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied(null), 1800);
  };
  const suggested = places.filter((p) => p.page);
  const rest = places.filter((p) => !p.page);
  const row = (key: string, name: string, sub: string | null, page: string | null) => (
    <li key={key || "_hele"} className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-medium">{name}</div>
        {page ? (
          <a href={page} target="_blank" rel="noopener" className="block truncate text-[12px] text-[#0071e3]">
            {t.on}: {page.replace(/^https?:\/\/(www\.)?/, "")}
          </a>
        ) : (
          sub && <div className="text-[12px] text-[#8e8e93]">{sub}</div>
        )}
      </div>
      <button type="button" onClick={() => copy(key)} className="flex-none rounded-full bg-[#0071e3] px-3.5 py-1.5 text-[13px] font-medium text-white">
        {copied === key ? t.copied : t.copy}
      </button>
    </li>
  );
  return (
    <section className="space-y-3">
      {heading && (
        <div>
          <h2 className="text-[20px] font-semibold tracking-tight">{t.title}</h2>
          <p className="mt-1 text-[14px] leading-snug text-[#6e6e73]">{t.lead}</p>
        </div>
      )}
      <ul className="divide-y divide-black/[.05] overflow-hidden rounded-2xl bg-white ring-1 ring-black/[.05]">
        {row("", t.whole, t.wholeSub, whole)}
        {suggested.map((p) => row(p.key, p.name, p.group, p.page))}
      </ul>
      {rest.length > 0 && (
        <details className="rounded-2xl bg-white ring-1 ring-black/[.05]">
          <summary className="cursor-pointer select-none px-4 py-3 text-[14px] font-medium">{t.other(rest.length)}</summary>
          <ul className="divide-y divide-black/[.05] border-t border-black/[.05]">{rest.map((p) => row(p.key, p.name, p.group, null))}</ul>
        </details>
      )}
      <div className="rounded-2xl bg-white ring-1 ring-black/[.05]">
        <div className="px-4 pt-3 text-[15px] font-semibold">{t.how}</div>
        <ul className="divide-y divide-black/[.05]">
          {(lang === "en" ? GUIDES_EN : GUIDES).map(([name, steps]) => (
            <li key={name}>
              <button type="button" onClick={() => setOpen(open === name ? null : name)} className="flex w-full items-center justify-between px-4 py-3 text-left text-[14px]">
                {name}
                <span className="text-[#8e8e93]">{open === name ? "−" : "+"}</span>
              </button>
              {open === name && (
                <ol className="list-decimal space-y-1 px-4 pb-3 pl-9 text-[14px] leading-snug text-[#3a3a3c]">
                  {steps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
