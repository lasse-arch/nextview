"use client";

import { useEffect, useRef, useState } from "react";
import { embedCode } from "@/app/arpo/tour-lab/[slug]/rediger/share";
import type { Cms, Placement, Suggestion } from "@/lib/site-placement";

/*
 * "Hvor skal touren sidde?" on the customer's page (På hjemmesiden): they
 * write their website, nextviewAI finds the best places for the tour, and each
 * comes with a picture of their own page with the tour in it (computer and
 * phone), the size, where the tour starts, the code to paste and the steps
 * for the system their site is made with. See site-placement.ts.
 */

export type PlacementTour = { slug: string; title: string; url: string; places: { key: string; name: string }[] };
type Lang = "da" | "en";
type Shots = { desktop: string; phone: string } | { error: string } | null;

const W = {
  da: {
    kicker: "nextviewAI",
    title: "Hvor skal touren sidde på jeres hjemmeside?",
    lead: "Skriv adressen på jeres hjemmeside. nextviewAI kigger den igennem og viser jer de bedste steder til touren - med billeder af, hvordan det ser ud, den rigtige størrelse og koden klar til at sætte ind.",
    tour: "Tour",
    placeholder: "jeresside.dk",
    find: "Find stederne",
    again: "Find igen",
    steps: ["Læser jeres hjemmeside …", "Kigger siderne igennem …", "Finder de bedste steder …", "Næsten klar …"],
    madeWith: (cms: string) => `Jeres hjemmeside er lavet i ${cms}`,
    none: "nextviewAI fandt ikke et godt sted på de sider, den kunne læse. Prøv adressen på en bestemt underside - eller skriv til os, så hjælper vi.",
    computer: "Computer",
    phone: "Mobil",
    drawing: "Tegner touren ind på jeres side …",
    size: "Størrelse",
    starts: "Starter i",
    start: "Tourens start",
    heading: "Overskrift over touren",
    code: "Koden",
    copy: "Kopiér koden",
    copied: "Kopieret ✓",
    how: (cms: string) => `Sådan sætter I den ind i ${cms}`,
    howAny: "Sådan sætter I den ind",
    open: "Åbn siden",
    sizes: { "16:9": "Bred (16:9)", "4:3": "Høj (4:3)", fast: (h: number) => `Fast højde (${h} px)`, skaerm: "Hele skærmen" },
    help: "Er det en anden, der laver jeres hjemmeside? Send dem koden og billedet - eller skriv til os, så hjælper vi.",
  },
  en: {
    kicker: "nextviewAI",
    title: "Where should the tour go on your website?",
    lead: "Write the address of your website. nextviewAI looks through it and shows you the best places for the tour - with pictures of how it looks, the right size and the code ready to paste.",
    tour: "Tour",
    placeholder: "yoursite.com",
    find: "Find the places",
    again: "Find again",
    steps: ["Reading your website …", "Looking through the pages …", "Finding the best places …", "Almost ready …"],
    madeWith: (cms: string) => `Your website is made with ${cms}`,
    none: "nextviewAI didn't find a good place on the pages it could read. Try the address of a specific page - or write to us, and we'll help.",
    computer: "Computer",
    phone: "Phone",
    drawing: "Drawing the tour into your page …",
    size: "Size",
    starts: "Starts in",
    start: "The tour's start",
    heading: "Heading above the tour",
    code: "The code",
    copy: "Copy the code",
    copied: "Copied ✓",
    how: (cms: string) => `How to add it in ${cms}`,
    howAny: "How to add it",
    open: "Open the page",
    sizes: { "16:9": "Wide (16:9)", "4:3": "Tall (4:3)", fast: (h: number) => `Fixed height (${h} px)`, skaerm: "Full screen" },
    help: "Does someone else make your website? Send them the code and the picture - or write to us, and we'll help.",
  },
};

const CMS_NAME: Record<Cms, string> = {
  wordpress: "WordPress",
  wix: "Wix",
  squarespace: "Squarespace",
  shopify: "Shopify",
  webflow: "Webflow",
  joomla: "Joomla",
  drupal: "Drupal",
  umbraco: "Umbraco",
  jimdo: "Jimdo",
  hubspot: "HubSpot",
  one: "one.com",
  simply: "Simply.com",
  weebly: "Weebly",
};

/** The steps for putting the code in, per system - written by us (not by the AI). */
const GUIDE: Record<Lang, Partial<Record<Cms, string[]>> & { any: string[] }> = {
  da: {
    wordpress: ["Åbn siden i WordPress (Sider → Rediger).", "Klik på + der, hvor touren skal være, og vælg blokken \"Brugerdefineret HTML\". Bruger I Elementor, så træk \"HTML\"-widgetten ind.", "Indsæt koden, og tryk Opdater."],
    wix: ["Åbn siden i Wix-editoren.", "Tilføj → Indlejr kode → Indlejr HTML.", "Vælg \"Kode\", indsæt koden, og træk boksen ud i fuld bredde der, hvor touren skal være.", "Tryk Udgiv."],
    squarespace: ["Rediger siden, og klik på + der, hvor touren skal være.", "Vælg blokken \"Kode\".", "Indsæt koden, og gem."],
    shopify: ["Gå til Webshop → Temaer → Tilpas.", "Tilføj en sektion af typen \"Brugerdefineret Liquid\" der, hvor touren skal være.", "Indsæt koden, og gem."],
    webflow: ["Åbn siden i Webflow Designer.", "Træk et \"Embed\"-element ind der, hvor touren skal være.", "Indsæt koden, gem, og udgiv."],
    jimdo: ["Rediger siden, og tilføj et element der, hvor touren skal være.", "Vælg \"Widget/HTML\".", "Indsæt koden, og gem."],
    hubspot: ["Rediger siden i HubSpot.", "Tilføj et \"Rich text\"-modul, og åbn Avanceret → Kildekode, eller brug et HTML-modul.", "Indsæt koden, og udgiv."],
    weebly: ["Træk \"Indlejr kode\" ind der, hvor touren skal være.", "Klik på den, vælg \"Rediger brugerdefineret HTML\", og indsæt koden.", "Udgiv."],
    one: ["Åbn siden i one.com's hjemmesidebygger.", "Tilføj → \"Indlejr\" / HTML der, hvor touren skal være.", "Indsæt koden, og udgiv."],
    any: ["Rediger siden i det system, jeres hjemmeside er lavet i.", "Tilføj en blok, der hedder noget med \"HTML\", \"Kode\" eller \"Indlejr\" - eller skift editoren til kildekode (ikonet <>) - der, hvor touren skal være.", "Indsæt koden, og gem/udgiv."],
  },
  en: {
    wordpress: ["Open the page in WordPress (Pages → Edit).", "Click + where the tour should go, and choose the \"Custom HTML\" block. Using Elementor? Drag in the \"HTML\" widget.", "Paste the code, and press Update."],
    wix: ["Open the page in the Wix editor.", "Add → Embed Code → Embed HTML.", "Choose \"Code\", paste the code, and stretch the box to full width where the tour should go.", "Press Publish."],
    squarespace: ["Edit the page, and click + where the tour should go.", "Choose the \"Code\" block.", "Paste the code, and save."],
    shopify: ["Go to Online Store → Themes → Customize.", "Add a \"Custom Liquid\" section where the tour should go.", "Paste the code, and save."],
    webflow: ["Open the page in the Webflow Designer.", "Drag an \"Embed\" element to where the tour should go.", "Paste the code, save and publish."],
    jimdo: ["Edit the page, and add an element where the tour should go.", "Choose \"Widget/HTML\".", "Paste the code, and save."],
    hubspot: ["Edit the page in HubSpot.", "Add a \"Rich text\" module and open Advanced → Source code, or use an HTML module.", "Paste the code, and publish."],
    weebly: ["Drag \"Embed Code\" to where the tour should go.", "Click it, choose \"Edit Custom HTML\", and paste the code.", "Publish."],
    one: ["Open the page in one.com's website builder.", "Add → \"Embed\" / HTML where the tour should go.", "Paste the code, and publish."],
    any: ["Edit the page in the system your website is made with.", "Add a block called something like \"HTML\", \"Code\" or \"Embed\" - or switch the editor to source code (the <> icon) - where the tour should go.", "Paste the code, and save/publish."],
  },
};

const post = async (path: string, body: unknown) => {
  const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const j = (await r?.json().catch(() => null)) as Record<string, unknown> | null;
  return { ok: Boolean(r?.ok), j };
};

export function SitePlacement({ tours, site: initialSite, lang }: { tours: PlacementTour[]; site: string; lang: Lang }) {
  const w = W[lang];
  const [slug, setSlug] = useState(tours[0]?.slug ?? "");
  const tour = tours.find((t) => t.slug === slug) ?? tours[0];
  const [site, setSite] = useState(initialSite);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<(Placement & { asked: string }) | null>(null);
  const [shots, setShots] = useState<Shots[]>([]);
  const run = useRef(0);

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setStep((s) => Math.min(s + 1, w.steps.length - 1)), 6000);
    return () => clearInterval(t);
  }, [busy, w.steps.length]);

  async function find() {
    if (!tour || !site.trim() || busy) return;
    const n = ++run.current;
    setBusy(true);
    setStep(0);
    setError(null);
    setResult(null);
    setShots([]);
    const { ok, j } = await post("/api/kunde/placering", { slug: tour.slug, site, lang });
    if (n !== run.current) return;
    setBusy(false);
    if (!ok || !j) return setError((j?.error as string) ?? (lang === "en" ? "Something went wrong - try again." : "Noget gik galt - prøv igen."));
    const p = j as unknown as Placement;
    setResult({ ...p, asked: site });
    setShots(p.suggestions.map(() => null));
    // The pictures, one per place - each shows up as soon as it's made.
    p.suggestions.forEach((_, i) =>
      post("/api/kunde/placering/billeder", { slug: tour.slug, site, lang, i }).then(({ ok, j }) => {
        if (n !== run.current) return;
        setShots((all) => all.map((x, k) => (k === i ? (ok && j?.desktop ? (j as { desktop: string; phone: string }) : { error: (j?.error as string) ?? "…" }) : x)));
      })
    );
  }

  if (!tour) return null;
  return (
    <section className="overflow-hidden rounded-3xl bg-white">
      <style>{"@keyframes shimmer{from{transform:translateX(-100%)}to{transform:translateX(100%)}}@keyframes fadeIn{from{opacity:0;transform:translateY(3px)}}"}</style>
      <div className="bg-gradient-to-br from-[#f5f3ff] via-white to-[#eef6ff] p-5 sm:p-7">
        <p className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[.14em] text-[#7a5af8]">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M12 3v5M12 16v5M3 12h5M16 12h5M5.6 5.6l3.5 3.5M14.9 14.9l3.5 3.5M5.6 18.4l3.5-3.5M14.9 9.1l3.5-3.5" />
          </svg>
          {w.kicker}
        </p>
        <h2 className="mt-1.5 text-[22px] font-bold leading-tight tracking-tight sm:text-[26px]">{w.title}</h2>
        <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-[#6e6e73]">{w.lead}</p>
        <form
          className="mt-4 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            void find();
          }}
        >
          {tours.length > 1 && (
            <select aria-label={w.tour} value={slug} onChange={(e) => setSlug(e.target.value)} className="rounded-2xl bg-white px-4 py-3 text-[15px] font-medium shadow-sm ring-1 ring-black/[.08] outline-none focus:ring-2 focus:ring-[#7a5af8]/50">
              {tours.map((t) => (
                <option key={t.slug} value={t.slug}>
                  {t.title}
                </option>
              ))}
            </select>
          )}
          <input
            value={site}
            onChange={(e) => setSite(e.target.value)}
            placeholder={w.placeholder}
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-2xl bg-white px-4 py-3 text-[16px] shadow-sm ring-1 ring-black/[.08] outline-none focus:ring-2 focus:ring-[#7a5af8]/50"
          />
          <button type="submit" disabled={busy || !site.trim()} className="rounded-2xl bg-[#1d1d1f] px-5 py-3 text-[15px] font-semibold text-white transition disabled:opacity-50">
            {busy ? "…" : result ? w.again : w.find}
          </button>
        </form>
        {busy && (
          <div className="mt-4 flex items-center gap-3 rounded-2xl bg-white/80 px-4 py-3 shadow-sm ring-1 ring-black/[.05]">
            <span className="h-5 w-5 flex-none animate-spin rounded-full border-2 border-[#7a5af8]/25 border-t-[#7a5af8]" />
            <span key={step} className="text-[14px] font-medium text-[#3a3a3c] [animation:fadeIn_.4s_ease]">
              {w.steps[step]}
            </span>
          </div>
        )}
        {error && <p className="mt-3 text-[14px] text-[#c4271d]">{error}</p>}
      </div>

      {result && (
        <div className="space-y-4 p-4 sm:p-6">
          {result.cms && (
            <p className="inline-flex items-center gap-1.5 rounded-full bg-[#f2f2f7] px-3 py-1 text-[13px] font-medium text-[#3a3a3c]">
              <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 text-[#34c759]" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                <path d="M4.5 10.5l3.5 3.5 7.5-8" />
              </svg>
              {w.madeWith(CMS_NAME[result.cms])}
            </p>
          )}
          {result.suggestions.length === 0 && <p className="text-[15px] text-[#3a3a3c]">{w.none}</p>}
          {result.suggestions.map((s, i) => (
            <SuggestionCard key={`${s.page}-${s.after}`} n={i + 1} s={s} shots={shots[i] ?? null} tour={tour} cms={result.cms} lang={lang} />
          ))}
          {result.suggestions.length > 0 && <p className="px-1 text-[13px] leading-snug text-[#8e8e93]">{w.help}</p>}
        </div>
      )}
    </section>
  );
}

function SuggestionCard({ n, s, shots, tour, cms, lang }: { n: number; s: Suggestion; shots: Shots; tour: PlacementTour; cms: Cms | null; lang: Lang }) {
  const w = W[lang];
  const [view, setView] = useState<"desktop" | "phone">("desktop");
  const [copied, setCopied] = useState(false);
  const place = s.place ? tour.places.find((p) => p.key === s.place) : null;
  const url = place ? `${tour.url}?rum=${place.key}` : tour.url;
  const code = embedCode(url, place ? `${tour.title} - ${place.name}` : tour.title, s.size);
  const sizeLabel = s.size.kind === "fast" ? w.sizes.fast(s.size.height) : w.sizes[s.size.kind];
  const steps = (cms && GUIDE[lang][cms]) || GUIDE[lang].any;
  let path = s.page;
  try {
    const u = new URL(s.page);
    path = `${u.hostname.replace(/^www\./, "")}${u.pathname === "/" ? "" : u.pathname.replace(/\/$/, "")}`;
  } catch {}
  const ready = shots && "desktop" in shots;

  return (
    <article className="overflow-hidden rounded-[22px] ring-1 ring-black/[.07]">
      <div className="flex items-start gap-3 p-4 sm:p-5">
        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[#7a5af8] text-[14px] font-bold text-white">{n}</span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[17px] font-semibold leading-snug tracking-tight">{s.title}</h3>
          <a href={s.page} target="_blank" rel="noopener noreferrer" className="mt-0.5 inline-block max-w-full truncate text-[13px] text-[#0071e3] hover:underline">
            {path} ↗
          </a>
          <p className="mt-1.5 text-[14.5px] leading-snug text-[#3a3a3c]">{s.why}</p>
        </div>
      </div>

      {/* Their page with the tour in it. */}
      <div className="bg-[#f5f5f7] px-3 pb-4 pt-3 sm:px-5">
        <div className="mx-auto mb-3 flex w-fit rounded-full bg-white p-1 shadow-sm ring-1 ring-black/[.05]">
          {(
            [
              ["desktop", w.computer],
              ["phone", w.phone],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setView(k)} className={`rounded-full px-4 py-1.5 text-[13px] font-semibold transition ${view === k ? "bg-[#1d1d1f] text-white" : "text-[#6e6e73]"}`}>
              {label}
            </button>
          ))}
        </div>
        {view === "desktop" ? (
          <div className="mx-auto max-w-[760px] overflow-hidden rounded-xl bg-white shadow-[0_12px_40px_rgba(0,0,0,.14)] ring-1 ring-black/[.06]">
            <div className="flex items-center gap-1.5 border-b border-black/[.06] bg-[#fafafa] px-3 py-2">
              <i className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
              <i className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
              <i className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
              <span className="mx-auto max-w-[60%] truncate rounded-md bg-white px-3 py-0.5 text-[11px] text-[#8e8e93] ring-1 ring-black/[.06]">{path}</span>
            </div>
            <Shot src={ready ? shots.desktop : null} error={shots && "error" in shots ? shots.error : null} ratio="1280 / 860" waiting={w.drawing} />
          </div>
        ) : (
          <div className="mx-auto w-[230px] rounded-[36px] bg-[#1d1d1f] p-[7px] shadow-[0_12px_40px_rgba(0,0,0,.2)]">
            <div className="overflow-hidden rounded-[30px] bg-white">
              <Shot src={ready ? shots.phone : null} error={shots && "error" in shots ? shots.error : null} ratio="390 / 844" waiting={w.drawing} />
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3 p-4 sm:p-5">
        <dl className="grid grid-cols-1 gap-2 text-[14px] sm:grid-cols-3">
          <div className="rounded-2xl bg-[#f7f7f9] px-3.5 py-2.5">
            <dt className="text-[12px] text-[#8e8e93]">{w.size}</dt>
            <dd className="font-semibold">{sizeLabel}</dd>
          </div>
          <div className="rounded-2xl bg-[#f7f7f9] px-3.5 py-2.5">
            <dt className="text-[12px] text-[#8e8e93]">{w.starts}</dt>
            <dd className="truncate font-semibold">{place?.name ?? w.start}</dd>
          </div>
          {s.heading && (
            <div className="rounded-2xl bg-[#f7f7f9] px-3.5 py-2.5">
              <dt className="text-[12px] text-[#8e8e93]">{w.heading}</dt>
              <dd className="truncate font-semibold">&quot;{s.heading}&quot;</dd>
            </div>
          )}
        </dl>
        <div>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-2xl bg-[#1d1d1f] p-4 text-[12px] leading-relaxed text-white/85">{code}</pre>
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(code).catch(() => {});
                setCopied(true);
                setTimeout(() => setCopied(false), 1600);
              }}
              className="rounded-full bg-[#0071e3] px-4 py-2 text-[14px] font-semibold text-white"
            >
              {copied ? w.copied : w.copy}
            </button>
          </div>
        </div>
        <details className="group rounded-2xl bg-[#f7f7f9] px-4 py-3">
          <summary className="cursor-pointer list-none text-[14px] font-semibold marker:hidden">
            <span className="mr-1.5 inline-block transition group-open:rotate-90">›</span>
            {cms ? w.how(CMS_NAME[cms]) : w.howAny}
          </summary>
          <ol className="mt-2 list-decimal space-y-1 pl-6 text-[14px] leading-snug text-[#3a3a3c]">
            {steps.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ol>
        </details>
      </div>
    </article>
  );
}

function Shot({ src, error, ratio, waiting }: { src: string | null; error: string | null; ratio: string; waiting: string }) {
  if (src)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" className="block w-full" style={{ aspectRatio: ratio }} />;
  return (
    <div className="relative flex w-full items-center justify-center overflow-hidden bg-gradient-to-br from-[#f2f2f7] to-[#e9e9ee]" style={{ aspectRatio: ratio }}>
      {!error && <div className="absolute inset-0 animate-[shimmer_1.6s_infinite] bg-gradient-to-r from-transparent via-white/60 to-transparent" />}
      <span className="relative px-4 text-center text-[13px] font-medium text-[#8e8e93]">{error ?? waiting}</span>
    </div>
  );
}
