"use client";

import { isPlaceHref } from "../../tours/places";
import { tourConfigProblem } from "@/lib/tour-validate";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Component, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { logTourWork, renameTourSlug, restoreTourVersion, saveTour, searchDeals, setTourDeal } from "@/lib/actions/tours";
import { askClaudeForTour, saveAnthropicKey, type ChatTurn } from "@/lib/actions/tour-ai";
import type { LinkOpen, MenuEntry, TourConfig } from "../../tours/types";
import type { TourStats } from "@/lib/tour-stats";
import { CardsEditor, GuideEditor, StartEditor, TagsEditor } from "./content";
import { ResultsPanel } from "./results";
import { DesignGallery } from "./design-gallery";
import { currentPreset } from "../../tours/presets";
import { EconomyPanel, type TourEconomy } from "./economy";
import { DEFAULT_EMBED, SharePanel, SitePreview, type EmbedSize } from "./share";
import { Choice, Field, FilesContext, Group, Icon, input, outsideFiles, Toggle, UploadButton, type PreviewApi } from "./ui";
import { hostTourFiles } from "@/lib/actions/tour-files";

type Version = { id: string; note: string | null; by: string | null; at: string };
type Tab = "claude" | "okonomi" | "resultater" | "del" | "tags" | "start" | "rundvisning" | "kort" | "generelt" | "design" | "menu" | "funktioner" | "links" | "avanceret" | "versioner";

/** Claude's mark: a small sunburst. */
const SPARK = '<path d="M12 3v5M12 16v5M3 12h5M16 12h5M5.6 5.6l3.5 3.5M14.9 14.9l3.5 3.5M5.6 18.4l3.5-3.5M14.9 9.1l3.5-3.5"/>';

/** The sections, with a small icon each (SF Symbols-like, drawn with strokes), under their headings. */
const TABS: [Tab, string, string, string?][] = [
  ["claude", "Claude", SPARK],
  ["resultater", "Resultater", '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'],
  ["del", "Del og udgiv", '<path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>'],
  ["start", "Start", '<path d="M5 4v16M5 5h11l-2 4 2 4H5"/>', "Indhold"],
  ["menu", "Menu", '<path d="M4 6h16M4 12h16M4 18h10"/>'],
  ["rundvisning", "Vis mig rundt", '<circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l5.5-3.5z"/>'],
  ["tags", "Tags", '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="8" cy="8" r="1.5"/>'],
  ["kort", "Stedkort", '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 10h8M8 14h5"/>'],
  ["links", "Knapper og links", '<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>'],
  ["design", "Design", '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.3A4.7 4.7 0 0 0 21 9.7C21 5.9 17 3 12 3z"/><circle cx="7.5" cy="11.5" r="1"/><circle cx="10.5" cy="7.5" r="1"/><circle cx="15.5" cy="8" r="1"/>', "Udseende og opsætning"],
  ["funktioner", "Funktioner", '<path d="M12 3l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 15.4 7.2 18l.9-5.4L4.2 8.7l5.4-.8z"/>'],
  ["generelt", "Generelt", '<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/>'],
  ["okonomi", "Tid og pris", '<circle cx="12" cy="12" r="9"/><path d="M14.5 9.5a2.5 2 0 0 0-2.5-1.5c-1.4 0-2.5.8-2.5 2s1.1 1.6 2.5 2 2.5.8 2.5 2-1.1 2-2.5 2a2.5 2 0 0 1-2.5-1.5M12 6.5v1.5M12 16v1.5"/>', "Mere"],
  ["versioner", "Versioner", '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'],
  ["avanceret", "Avanceret", '<path d="M8 6l-5 6 5 6M16 6l5 6-5 6"/>'],
];

const when = (iso: string) => new Date(iso).toLocaleString("da-DK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function TourEditor({
  slug,
  initial,
  deal,
  versions,
  aiReady,
  stats,
  blob,
  published,
  economy,
}: {
  slug: string;
  initial: TourConfig;
  deal: { id: string; name: string } | null;
  versions: Version[];
  aiReady: boolean;
  stats: TourStats;
  /** Vercel Blob is set up (uploads of big files, videos). */
  blob: boolean;
  published: boolean;
  economy: TourEconomy;
}) {
  const router = useRouter();
  const [config, setConfig] = useState<TourConfig>(initial);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<Tab>("claude");
  // A tour Claude just built (see new-tour.tsx): its account of what it did starts the chat.
  const [chat, setChat] = useState<ChatMsg[]>(() => {
    try {
      const reply = typeof window === "undefined" ? null : sessionStorage.getItem(`tour-claude:${slug}`);
      return reply ? [{ role: "assistant", text: reply }] : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      sessionStorage.removeItem(`tour-claude:${slug}`);
    } catch {}
  }, [slug]);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [device, setDevice] = useState<"computer" | "mobil" | "site">("computer");
  const [siteWidth, setSiteWidth] = useState<"computer" | "mobil">("computer");
  const [embed, setEmbed] = useState<EmbedSize>(DEFAULT_EMBED);
  const [previewKey, setPreviewKey] = useState(0);
  const [pending, start] = useTransition();
  const [json, setJson] = useState<string | null>(null);

  /* Time spent on the tour: a minute at a time while the page is open and someone is active (typing, clicking, or in the preview). */
  useEffect(() => {
    let last = Date.now();
    const active = () => (last = Date.now());
    const events = ["keydown", "pointerdown", "wheel", "input"] as const;
    events.forEach((e) => window.addEventListener(e, active, { passive: true }));
    const timer = setInterval(() => {
      const inPreview = document.activeElement instanceof HTMLIFrameElement;
      if (document.visibilityState === "visible" && (inPreview || Date.now() - last < 120_000)) logTourWork(slug, 60).catch(() => {});
    }, 60_000);
    return () => {
      clearInterval(timer);
      events.forEach((e) => window.removeEventListener(e, active));
    };
  }, [slug]);

  /* Live preview: the tour in the iframe shows the draft as it's edited (see the bridge in experience.tsx). */
  const frame = useRef<HTMLIFrameElement>(null);
  const latest = useRef(config);
  useEffect(() => {
    // Only a whole setup goes to the preview - a half-typed one would break the tour there.
    if (tourConfigProblem(config)) return;
    latest.current = config;
    const t = setTimeout(() => frame.current?.contentWindow?.postMessage({ type: "tour-draft", config }, location.origin), 250);
    return () => clearTimeout(t);
  }, [config]);
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin === location.origin && e.source === frame.current?.contentWindow && e.data?.type === "tour-ready") {
        frame.current?.contentWindow?.postMessage({ type: "tour-draft", config: latest.current }, location.origin);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  const preview = useMemo<PreviewApi>(() => {
    /** Asks the preview something and waits for its answer (or gives up after a while). */
    const ask = <T extends object>(type: string, wait = 5000) =>
      new Promise<T & { error?: string }>((resolve) => {
        const id = Math.random().toString(36).slice(2);
        const done = (r: T & { error?: string }) => {
          window.removeEventListener("message", onMessage);
          clearTimeout(timer);
          resolve(r);
        };
        const onMessage = (e: MessageEvent) => {
          if (e.origin === location.origin && e.data?.type === type && e.data.id === id) done(e.data);
        };
        const timer = setTimeout(() => done({ error: "Forhåndsvisningen svarede ikke - er touren indlæst?" } as T & { error?: string }), wait);
        window.addEventListener("message", onMessage);
        frame.current?.contentWindow?.postMessage({ type, id }, location.origin);
      });
    return {
      view: () => ask<{ href?: string; room?: string | null }>("tour-view"),
      shot: () => ask<{ image?: string }>("tour-shot", 15000),
      pick: () => ask<{ position?: { x: number; y: number; z: number }; ss?: number | null; room?: string | null }>("tour-pick", 120000),
      go: (name, href) => frame.current?.contentWindow?.postMessage({ type: "tour-go", name, href }, location.origin),
    };
  }, []);

  /** Changes the draft (a copy - the saved tour is untouched until "Gem"). */
  function edit(fn: (draft: TourConfig) => void) {
    setConfig((c) => {
      const next = structuredClone(c);
      fn(next);
      return next;
    });
    setDirty(true);
    setMsg(null);
  }

  function save() {
    start(async () => {
      const r = await saveTour(slug, config, note);
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      setDirty(false);
      setNote("");
      setMsg({ ok: true, text: "Gemt" });
      setTimeout(() => setMsg(null), 2500);
      setPreviewKey((k) => k + 1);
      router.refresh();
    });
  }

  const menuStyle = config.design?.menu ?? "side";

  return (
    <FilesContext.Provider value={{ slug, blob }}>
    <div
      className="-mx-4 -mb-4 flex h-[calc(100vh-6rem)] flex-col overflow-hidden rounded-t-2xl bg-[#f5f5f7] text-[#1d1d1f] sm:-mx-6 sm:-mb-6 lg:-mx-8 lg:-mb-8"
      style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif' }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-black/[.06] bg-white/80 px-5 py-3 backdrop-blur-xl">
        <Link href="/tour-lab" className="flex items-center gap-1 text-[15px] text-[#0071e3] hover:opacity-80">
          <Icon d='<path d="M15 5l-7 7 7 7"/>' className="h-4 w-4" />
          Tours
        </Link>
        <div className="mx-auto min-w-0 text-center">
          <h1 className="text-[15px] font-semibold tracking-tight">{config.title}</h1>
          <p className="text-[12px] text-[#8e8e93]">{dirty ? "Ændringer ikke gemt" : `Gemt · ${versions[0] ? when(versions[0].at) : ""}`}</p>
        </div>
        {/* Saving lives up here - never over the preview (where the tour's own bottom menu is). */}
        <div className="flex items-center gap-2">
          {msg && <span className={`text-[13px] ${msg.ok ? "text-[#248a3d]" : "text-[#ff3b30]"}`}>{msg.ok ? "✓ " : ""}{msg.text}</span>}
          {dirty ? (
            <>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Hvad har du ændret? (valgfrit)"
                className="w-56 rounded-full border-0 bg-[#f2f2f7] px-3.5 py-1.5 text-[13px] placeholder:text-[#8e8e93] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
              />
              <button
                type="button"
                onClick={() => {
                  setConfig(initial);
                  setDirty(false);
                  setMsg(null);
                }}
                className="rounded-full px-3 py-1.5 text-[13px] font-medium text-[#0071e3] hover:bg-[#0071e3]/10"
              >
                Fortryd
              </button>
              <button type="button" onClick={save} disabled={pending} className="rounded-full bg-[#0071e3] px-5 py-1.5 text-[13px] font-semibold text-white hover:bg-[#0077ed] disabled:opacity-50">
                {pending ? "Gemmer…" : "Gem"}
              </button>
            </>
          ) : (
            <a href={`/tour-lab/${slug}`} target="_blank" rel="noopener" className="rounded-full bg-[#f2f2f7] px-3.5 py-1.5 text-[13px] font-medium hover:bg-[#e9e9eb]">
              Åbn tour ↗
            </a>
          )}
        </div>
      </div>

      <SafeArea onUndo={() => { setConfig(initial); setDirty(false); }}>
      <div className="flex min-h-0 flex-1">
        {/* Sections */}
        <nav className="flex w-[210px] flex-none flex-col gap-0.5 p-3">
          {TABS.map(([t, text, icon, heading]) => (
            <div key={t} className="contents">
            {heading && <div className="mt-4 px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-[#8e8e93]">{heading}</div>}
            <button
              type="button"
              onClick={() => setTab(t)}
              className={`flex items-center gap-2.5 rounded-[9px] px-2.5 py-[7px] text-left text-[14px] transition ${tab === t ? "bg-white font-medium shadow-[0_1px_3px_rgba(0,0,0,.08)]" : "text-[#1d1d1f]/80 hover:bg-black/[.04]"}`}
            >
              <span className={`flex h-7 w-7 items-center justify-center rounded-[7px] ${tab === t ? "bg-[#0071e3] text-white" : "bg-white text-[#6e6e73] ring-1 ring-black/[.06]"}`}>
                <Icon d={icon} className="h-4 w-4" />
              </span>
              {text}
            </button>
            </div>
          ))}
        </nav>

        {/* Settings */}
        <div className="flex w-[400px] flex-none flex-col">
          {tab === "claude" ? (
            <ClaudePanel
              config={config}
              chat={chat}
              setChat={setChat}
              ready={aiReady}
              onApply={(c) => {
                setConfig(c);
                setDirty(true);
                setMsg(null);
              }}
            />
          ) : (
          <div className="flex-1 space-y-5 overflow-y-auto px-2 pb-28 pt-3">
            {tab === "generelt" && (
              <>
                <Group title="Tour">
                <Field title="Navn">
                  <input className={input} value={config.title} onChange={(e) => edit((d) => void (d.title = e.target.value))} />
                </Field>
                <DealPicker slug={slug} initial={deal} />
                </Group>
                <SlugField slug={slug} dirty={dirty} />
                <Group title="I touren">
                <Field title="Firmanavn i touren">
                  <input className={input} value={config.brand} onChange={(e) => edit((d) => void (d.brand = e.target.value))} />
                </Field>
                <Field title="Undertitel">
                  <input className={input} value={config.subtitle ?? ""} onChange={(e) => edit((d) => void (d.subtitle = e.target.value || undefined))} />
                </Field>
                </Group>
                <Group title="Matterport">
                <Field title="Matterport-touren (MPSkins-link)" hint="Touren henter scanpunkter og skjulte punkter herfra.">
                  <input className={input} value={config.tourPage} onChange={(e) => edit((d) => void (d.tourPage = e.target.value))} />
                </Field>
                <Field title="Start" hint='Et U-link eller et udsyn kopieret med "Kopiér dette udsyn" i touren.'>
                  <input className={input} value={config.start} onChange={(e) => edit((d) => void (d.start = e.target.value))} />
                </Field>
                </Group>
                <FilesGroup slug={slug} config={config} onHosted={(c) => edit((d) => Object.assign(d, c))} />
              </>
            )}

            {tab === "design" && (
              <>
                <Group title="Design">
                  <p className="px-1 text-[12px] leading-snug text-[#8e8e93]">Hold musen over et design for at se det i forhåndsvisningen. Et klik vælger det - du kan altid fortryde.</p>
                  <DesignGallery
                    colors={config.colors}
                    selected={currentPreset(config)}
                    onHover={(p) => {
                      const shown = p ? { ...structuredClone(config), ...p.apply(config) } : config;
                      frame.current?.contentWindow?.postMessage({ type: "tour-draft", config: shown }, location.origin);
                    }}
                    onPick={(p) => edit((d) => Object.assign(d, p.apply(d)))}
                  />
                </Group>
                <Group title="Finjustering">
                <Field title="Menu">
                  <Choice
                    value={menuStyle}
                    options={[
                      ["side", "Sidemenu"],
                      ["dock", "Bar i bunden"],
                      ["picker", "Rumvælger"],
                    ]}
                    onChange={(v) => edit((d) => void (d.design = { welcome: d.design?.welcome ?? "tiles", menu: v }))}
                  />
                </Field>
                </Group>
                <Group title="Farver og skrift">
                <div className="grid grid-cols-2 gap-3">
                  {(
                    [
                      ["main", "Hovedfarve"],
                      ["accent", "Accent"],
                      ["accentDark", "Accent, mørk"],
                      ["soft", "Baggrund, lys"],
                    ] as const
                  ).map(([k, text]) => (
                    <Field key={k} title={text}>
                      <div className="flex items-center gap-2">
                        <input type="color" className="h-9 w-9 flex-none cursor-pointer appearance-none overflow-hidden rounded-full border-0 bg-transparent p-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-black/10" value={config.colors[k]} onChange={(e) => edit((d) => void (d.colors[k] = e.target.value))} />
                        <input className={input} value={config.colors[k]} onChange={(e) => edit((d) => void (d.colors[k] = e.target.value))} />
                      </div>
                    </Field>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field title="Skrift" hint="Navn på en Google-skrift">
                    <input className={input} value={config.font} onChange={(e) => edit((d) => void (d.font = e.target.value))} />
                  </Field>
                  <Field title="Skrift til overskrifter">
                    <input className={input} value={config.fontHeading ?? ""} placeholder="Samme" onChange={(e) => edit((d) => void (d.fontHeading = e.target.value || undefined))} />
                  </Field>
                </div>
                </Group>
                <Group title="Farvefilter på touren">
                  {(
                    [
                      ["brightness", "Lysstyrke", 0.5, 1.5, 0.01, 1],
                      ["contrast", "Kontrast", 0.5, 1.5, 0.01, 1],
                      ["saturate", "Mætning", 0, 2, 0.01, 1],
                      ["grayscale", "Gråtone", 0, 1, 0.01, 0],
                      ["hue", "Farvetone", -180, 180, 1, 0],
                    ] as const
                  ).map(([k, text, min, max, step, neutral]) => {
                    const value = config.filter?.[k] ?? neutral;
                    return (
                      <Field key={k} title={`${text}: ${k === "hue" ? `${value}°` : value.toFixed(2).replace(".", ",")}`}>
                        <input
                          type="range"
                          min={min}
                          max={max}
                          step={step}
                          className="w-full accent-[#0071e3]"
                          value={value}
                          onChange={(e) =>
                            edit((d) => {
                              const f = { ...d.filter, [k]: Number(e.target.value) };
                              // Back at neutral everywhere = no filter at all.
                              const neutralAll = (f.brightness ?? 1) === 1 && (f.contrast ?? 1) === 1 && (f.saturate ?? 1) === 1 && !f.grayscale && !f.hue;
                              d.filter = neutralAll ? undefined : f;
                            })
                          }
                        />
                      </Field>
                    );
                  })}
                  {config.filter && (
                    <button type="button" className="text-[13px] font-medium text-[#0071e3]" onClick={() => edit((d) => void (d.filter = undefined))}>
                      Nulstil filter
                    </button>
                  )}
                  <p className="px-1 text-[12px] leading-snug text-[#8e8e93]">Lægges over selve 3D-touren - fx lidt lysere og varmere. Se det i forhåndsvisningen.</p>
                </Group>
                <Group title="Logo">
                <Field title="Logo">
                  <div className="flex items-center gap-2">
                    <div className="flex h-10 w-16 flex-none items-center justify-center rounded-lg p-1" style={{ background: config.logoOnLight ? "#f5f5f7" : config.colors.main }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {config.logo && <img src={config.logo} alt="" className="max-h-full max-w-full object-contain" />}
                    </div>
                    <input className={input} value={config.logo} onChange={(e) => edit((d) => void (d.logo = e.target.value))} />
                    <UploadButton accept="image/*" onDone={(url) => edit((d) => void (d.logo = url))} />
                  </div>
                </Field>
                <Field title="Favicon" hint="Det lille ikon i browserfanen. Tomt = logoet.">
                  <div className="flex items-center gap-2">
                    <div className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-[#f2f2f7] p-1.5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {(config.favicon || config.logo) && <img src={config.favicon || config.logo} alt="" className="max-h-full max-w-full object-contain" />}
                    </div>
                    <input className={input} placeholder="Samme som logoet" value={config.favicon ?? ""} onChange={(e) => edit((d) => void (d.favicon = e.target.value || undefined))} />
                    <UploadButton accept="image/png,image/svg+xml,image/x-icon,image/webp" onDone={(url) => edit((d) => void (d.favicon = url))} />
                  </div>
                </Field>
                <Field title={`Logostørrelse: ${config.logoSize ?? 46} px`}>
                  <input type="range" min={28} max={120} className="w-full accent-[#0071e3]" value={config.logoSize ?? 46} onChange={(e) => edit((d) => void (d.logoSize = Number(e.target.value)))} />
                </Field>
                <Toggle on={Boolean(config.logoOnLight)} onChange={(on) => edit((d) => void (d.logoOnLight = on))} title="Mørkt logo" hint="Logoet får et lyst kort bag sig, så det kan læses på alle vægge." />
                </Group>
              </>
            )}

            {tab === "resultater" && <ResultsPanel stats={stats} />}
            {tab === "okonomi" && <EconomyPanel economy={economy} />}
            {tab === "del" && (
              <SharePanel
                slug={slug}
                title={config.title}
                published={published}
                size={embed}
                setSize={(s) => {
                  setEmbed(s);
                  setDevice("site");
                }}
              />
            )}
            {tab === "start" && <StartEditor config={config} edit={edit} slug={slug} preview={preview} />}
            {tab === "rundvisning" && <GuideEditor config={config} edit={edit} preview={preview} />}
            {tab === "tags" && <TagsEditor config={config} edit={edit} slug={slug} preview={preview} />}
            {tab === "kort" && <CardsEditor config={config} edit={edit} preview={preview} />}
            {tab === "menu" && <MenuEditor menu={config.menu} preview={preview} onChange={(menu) => edit((d) => void (d.menu = menu))} />}

            {tab === "funktioner" && (
              <>
                <Group title="Navigation">
                <Field title="Bevægelse">
                  <Choice
                    value={config.navigation}
                    options={[
                      ["free", "Fri gang"],
                      ["points", "Kun menuens steder"],
                    ]}
                    onChange={(v) => edit((d) => void (d.navigation = v))}
                  />
                </Field>
                <Field title="Skift mellem steder">
                  <Choice
                    value={config.jump ?? "fly"}
                    options={[
                      ["fly", "Flyv"],
                      ["instant", "Skift direkte"],
                      ["fade", "Overblænding"],
                    ]}
                    onChange={(v) => edit((d) => void (d.jump = v))}
                  />
                </Field>
                </Group>
                <Group title="Menu og historier">
                  <Toggle on={config.menuOpenOnStart.desktop} onChange={(on) => edit((d) => void (d.menuOpenOnStart.desktop = on))} title="Menu åben på computer" />
                  <Toggle on={config.menuOpenOnStart.mobile} onChange={(on) => edit((d) => void (d.menuOpenOnStart.mobile = on))} title="Menu åben på mobil" />
                <Toggle
                  on={Boolean(config.stories?.mobile)}
                  onChange={(on) => edit((d) => void (d.stories = { mobile: on, desktop: d.stories?.desktop ?? false, rooms: d.stories?.rooms }))}
                  title="Historier på mobil"
                  hint="Rummene som kort nederst, som Instagram-stories."
                />
                <Toggle
                  on={Boolean(config.stories?.desktop)}
                  onChange={(on) => edit((d) => void (d.stories = { mobile: d.stories?.mobile ?? false, desktop: on, rooms: d.stories?.rooms }))}
                  title="Historier på computer"
                />
                </Group>
                <Group title="Ekstra">
                <Toggle on={Boolean(config.wayfinding)} onChange={(on) => edit((d) => void (d.wayfinding = on ? d.wayfinding ?? {} : undefined))} title="Find vej" hint="Vælg et rum, og touren går vejen derhen fra der, man står." />
                <Toggle on={Boolean(config.measure)} onChange={(on) => edit((d) => void (d.measure = on || undefined))} title="Vis mål" hint="En knap, der viser Matterports mål i rummet." />
                <Toggle on={Boolean(config.matterportUi)} onChange={(on) => edit((d) => void (d.matterportUi = on || undefined))} title="Behold Matterports egne knapper" hint="Normalt skjult - tourens egne knapper er brugerfladen." />
                </Group>
                <p className="px-1 text-[12px] leading-snug text-[#8e8e93]">
                  Tags på ting i rummet laves under Tags.
                </p>
              </>
            )}

            {tab === "links" && (
              <>
                <Group title="Åbning">
                <Field title="Links åbner som standard">
                  <Choice
                    value={config.linkOpen?.default ?? "tab"}
                    options={[
                      ["popup", "Popup over touren"],
                      ["tab", "Ny fane"],
                      ["same", "Samme fane"],
                    ]}
                    onChange={(v: LinkOpen) => edit((d) => void (d.linkOpen = { default: v, byUrl: d.linkOpen?.byUrl }))}
                  />
                </Field>
                </Group>
                <Group title="Knapper">
                <CtaEditor cta={config.cta} onChange={(cta) => edit((d) => void (d.cta = cta))} />
                </Group>
                <Group title="Kontakt">
                <p className="px-1 text-[12px] leading-snug text-[#8e8e93]">Vises nederst i menuen. Udfyld kun det, kunden vil have vist.</p>
                {(
                  [
                    ["phone", "Telefon", "Fx 75 75 75 84", "tel"],
                    ["email", "E-mail", "Fx info@kunde.dk", "email"],
                    ["address", "Adresse", "Fx Egelykkevej 2, 9310 Vodskov", "text"],
                    ["instagram", "Instagram", "Fx instagram.com/kunden", "url"],
                  ] as const
                ).map(([k, text, example, type]) => (
                  <Field key={k} title={text} hint={k === "address" ? "Bliver et link, der åbner adressen i Google Maps." : undefined}>
                    <input
                      type={type}
                      className={input}
                      placeholder={example}
                      value={config.contact?.[k] ?? ""}
                      onChange={(e) => edit((d) => void (d.contact = { ...d.contact, [k]: e.target.value || undefined }))}
                      onBlur={(e) => k === "instagram" && e.target.value && edit((d) => void (d.contact = { ...d.contact, instagram: withProtocol(e.target.value) }))}
                    />
                  </Field>
                ))}
                {config.contact?.mapUrl && (
                  <Field title="Eget kort-link" hint="Bruges i stedet for Google Maps-linket. Tøm feltet for at bruge adressen.">
                    <input className={input} value={config.contact.mapUrl} onChange={(e) => edit((d) => void (d.contact = { ...d.contact, mapUrl: e.target.value || undefined }))} onBlur={(e) => e.target.value && edit((d) => void (d.contact = { ...d.contact, mapUrl: withProtocol(e.target.value) }))} />
                  </Field>
                )}
                </Group>
              </>
            )}

            {tab === "avanceret" && (
              <>
                <Group title="Eget design (CSS)">
                  <p className="text-[12px] leading-snug text-[#8e8e93]">Til det, felterne ikke dækker - fx runde former eller en helt bestemt stil. Lettest: bed Claude om det (&quot;gør knapperne runde og giv menuen glas-effekt&quot;), så skrives det her.</p>
                  <textarea
                    className="h-40 w-full rounded-xl border-0 bg-[#1d1d1f] p-3 font-mono text-[11.5px] leading-relaxed text-[#f5f5f7] outline-none focus:ring-2 focus:ring-[#0071e3]"
                    spellCheck={false}
                    placeholder=".hv-btn { border-radius: 999px; }"
                    value={config.customCss ?? ""}
                    onChange={(e) => edit((d) => void (d.customCss = e.target.value || undefined))}
                  />
                </Group>
                <p className="px-1 text-[13px] leading-snug text-[#6e6e73]">Hele opsætningen. Ret direkte her for alt det, der endnu ikke har sine egne felter (velkomstens fliser, punkter, steder, guidet tur, infopunkter…).</p>
                <textarea
                  className="h-[60vh] w-full rounded-2xl border-0 bg-[#1d1d1f] p-4 font-mono text-[11.5px] leading-relaxed text-[#f5f5f7] shadow-inner outline-none focus:ring-2 focus:ring-[#0071e3]"
                  spellCheck={false}
                  value={json ?? JSON.stringify(config, null, 2)}
                  onChange={(e) => setJson(e.target.value)}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={json == null}
                    className="rounded-full bg-[#0071e3] px-4 py-1.5 text-[14px] font-medium text-white disabled:opacity-40"
                    onClick={() => {
                      try {
                        const parsed = JSON.parse(json!) as TourConfig;
                        setConfig(parsed);
                        setDirty(true);
                        setJson(null);
                        setMsg({ ok: true, text: "Anvendt - husk at gemme." });
                      } catch (err) {
                        setMsg({ ok: false, text: `Ikke gyldig JSON: ${err instanceof Error ? err.message : err}` });
                      }
                    }}
                  >
                    Anvend
                  </button>
                  {json != null && (
                    <button type="button" className="rounded-full px-4 py-1.5 text-[14px] text-[#0071e3] hover:bg-[#0071e3]/10" onClick={() => setJson(null)}>
                      Fortryd
                    </button>
                  )}
                </div>
              </>
            )}

            {tab === "versioner" && (
              <ul className="divide-y divide-black/[.06] overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_rgba(0,0,0,.04)] ring-1 ring-black/[.04]">
                {versions.map((v, i) => (
                  <li key={v.id} className="flex items-start justify-between gap-3 px-4 py-3">
                    <div>
                      <div className="text-[15px] text-[#1d1d1f]">
                        {when(v.at)} {i === 0 && <span className="ml-1 rounded-full bg-[#34c759]/15 px-2 py-0.5 text-[11px] font-medium text-[#248a3d]">Nuværende</span>}
                      </div>
                      <div className="text-[12px] text-[#8e8e93]">
                        {v.by ?? "Ukendt"}
                        {v.note ? ` · ${v.note}` : ""}
                      </div>
                    </div>
                    {i > 0 && (
                      <button
                        type="button"
                        disabled={pending}
                        className="flex-none rounded-full bg-[#f2f2f7] px-3 py-1 text-[13px] font-medium text-[#0071e3] hover:bg-[#e8e8ed]"
                        onClick={() =>
                          start(async () => {
                            if (dirty && !confirm("Du har ændringer, der ikke er gemt. Gendan alligevel?")) return;
                            const r = await restoreTourVersion(v.id);
                            if (!r.ok) return setMsg({ ok: false, text: r.error });
                            setMsg({ ok: true, text: "Versionen er gendannet." });
                            setDirty(false);
                            setPreviewKey((k) => k + 1);
                            router.refresh();
                            window.location.reload();
                          })
                        }
                      >
                        Gendan
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          )}
        </div>

        {/* Preview */}
        <div className="relative flex min-w-0 flex-1 flex-col p-3 pl-4">
          <div className="mb-3 flex items-center gap-3">
            <div className="w-80">
              <Choice
                value={device}
                options={[
                  ["computer", "Computer"],
                  ["mobil", "Mobil"],
                  ["site", "På hjemmeside"],
                ]}
                onChange={setDevice}
              />
            </div>
            {device === "site" && (
              <div className="w-40">
                <Choice
                  value={siteWidth}
                  options={[
                    ["computer", "Bred"],
                    ["mobil", "Mobil"],
                  ]}
                  onChange={setSiteWidth}
                />
              </div>
            )}
            <span className="text-[12px] text-[#8e8e93]">{dirty ? "Live · ikke gemt endnu" : "Som den er gemt"}</span>
            <button type="button" onClick={() => setPreviewKey((k) => k + 1)} className="ml-auto rounded-full px-3 py-1 text-[13px] text-[#0071e3] hover:bg-[#0071e3]/10" title="Start touren forfra (fx for at se en ny velkomst)">
              Start forfra
            </button>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center">
            {device === "site" ? (
              <SitePreview config={config} size={embed} width={siteWidth}>
                <iframe ref={frame} key={previewKey} title="Forhåndsvisning" src={`/tour-lab/${slug}`} className="h-full w-full bg-black" allow="fullscreen; xr-spatial-tracking; autoplay; clipboard-write" />
              </SitePreview>
            ) : device === "computer" ? (
              <div className="flex h-full w-full flex-col overflow-hidden rounded-xl bg-white shadow-[0_20px_50px_rgba(0,0,0,.15)] ring-1 ring-black/10">
                <div className="flex items-center gap-1.5 border-b border-black/[.06] bg-[#f6f6f6] px-3 py-2">
                  <i className="h-3 w-3 rounded-full bg-[#ff5f57]" />
                  <i className="h-3 w-3 rounded-full bg-[#febc2e]" />
                  <i className="h-3 w-3 rounded-full bg-[#28c840]" />
                  <span className="mx-auto rounded-md bg-white px-3 py-0.5 text-[11px] text-[#8e8e93] ring-1 ring-black/[.06]">arpo.dk/t/{slug}</span>
                </div>
                <iframe ref={frame} key={previewKey} title="Forhåndsvisning" src={`/tour-lab/${slug}`} className="min-h-0 w-full flex-1 bg-black" allow="fullscreen; xr-spatial-tracking; autoplay; clipboard-write" />
              </div>
            ) : (
              <PhoneFrame>
                <iframe ref={frame} key={previewKey} title="Forhåndsvisning" src={`/tour-lab/${slug}`} className="h-full w-full bg-black" allow="fullscreen; xr-spatial-tracking; autoplay; clipboard-write" />
              </PhoneFrame>
            )}
          </div>

        </div>
      </div>
      </SafeArea>
    </div>
    </FilesContext.Provider>
  );
}

type ChatMsg = { role: "user" | "assistant"; text: string; error?: boolean; changed?: number; before?: TourConfig; undone?: boolean };

const SUGGESTIONS = ["Gør logoet lidt større", "Tilføj en knap til booking", "Gør farverne mørkere og mere eksklusive", "Ryd op i menuen, så den er nemmere at overskue"];

/**
 * Claude in the editor: write what should change, Claude makes the edit, and
 * the preview shows it at once - nothing is saved until "Gem", and each
 * answer can be undone on its own.
 */
function ClaudePanel({
  config,
  chat,
  setChat,
  ready: initiallyReady,
  onApply,
}: {
  config: TourConfig;
  chat: ChatMsg[];
  setChat: React.Dispatch<React.SetStateAction<ChatMsg[]>>;
  ready: boolean;
  onApply: (c: TourConfig) => void;
}) {
  const [ready, setReady] = useState(initiallyReady);
  const [text, setText] = useState("");
  const [key, setKey] = useState("");
  const [keyError, setKeyError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth", block: "end" }), [chat.length, pending]);

  function send(request: string) {
    const ask = request.trim();
    if (!ask || pending) return;
    const history: ChatTurn[] = chat.filter((m) => !m.error).map((m) => ({ role: m.role, text: m.text }));
    setChat((c) => [...c, { role: "user", text: ask }]);
    setText("");
    const before = config;
    start(async () => {
      const r = await askClaudeForTour(config, history, ask).catch((err: unknown) => ({ ok: false as const, error: `Kunne ikke nå Claude (${err instanceof Error ? err.message : err}) - prøv igen.` }));
      if (!r.ok) {
        // A revoked/changed key: ask for the new one right here.
        if (r.error.startsWith("Claude-nøglen")) setReady(false);
        return setChat((c) => [...c, { role: "assistant", text: r.error, error: true }]);
      }
      if (r.changed) onApply(r.config);
      setChat((c) => [...c, { role: "assistant", text: r.reply, changed: r.changed, before: r.changed ? before : undefined }]);
    });
  }

  if (!ready)
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#d97757] text-white">
          <Icon d={SPARK} className="h-6 w-6" />
        </span>
        <h2 className="text-[17px] font-semibold">{initiallyReady ? "Claude-nøglen virker ikke længere" : "Sæt Claude op"}</h2>
        <p className="mt-1 text-[13px] leading-snug text-[#6e6e73]">Indsæt en API-nøgle fra Anthropic. Den gemmes i Arpo, så alle admins kan bruge Claude i editoren.</p>
        <input className={`${input} mt-4 bg-white`} type="password" placeholder="sk-ant-…" value={key} onChange={(e) => setKey(e.target.value)} />
        {keyError && <p className="mt-2 text-[12px] text-[#ff3b30]">{keyError}</p>}
        <button
          type="button"
          disabled={pending || !key.trim()}
          className="mt-3 w-full rounded-xl bg-[#1d1d1f] py-2.5 text-[14px] font-medium text-white disabled:opacity-40"
          onClick={() =>
            start(async () => {
              const r = await saveAnthropicKey(key);
              if (!r.ok) return setKeyError(r.error);
              setKey("");
              setReady(true);
            })
          }
        >
          {pending ? "Tjekker nøglen…" : "Gem nøgle"}
        </button>
      </div>
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto px-3 pb-4 pt-3">
        {chat.length === 0 && (
          <div className="px-2 pt-6">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#d97757] text-white">
              <Icon d={SPARK} className="h-5 w-5" />
            </span>
            <h2 className="mt-3 text-[20px] font-semibold tracking-tight">Hvad skal ændres?</h2>
            <p className="mt-1 text-[14px] leading-snug text-[#6e6e73]">
              Skriv det, som du ville sige det til en kollega. Ændringen vises med det samme i forhåndsvisningen - intet gemmes, før du trykker Gem.
            </p>
            <div className="mt-5 flex flex-col items-start gap-2">
              {SUGGESTIONS.map((sug) => (
                <button key={sug} type="button" onClick={() => send(sug)} className="rounded-full bg-white px-3.5 py-1.5 text-left text-[13px] text-[#1d1d1f] ring-1 ring-black/[.08] transition hover:ring-black/20">
                  {sug}
                </button>
              ))}
            </div>
          </div>
        )}
        {chat.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <p className="max-w-[85%] whitespace-pre-wrap rounded-[18px] bg-[#e9e9eb] px-3.5 py-2 text-[14px] leading-snug">{m.text}</p>
            </div>
          ) : (
            <div key={i} className="flex gap-2.5">
              <span className={`mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full text-white ${m.error ? "bg-[#ff3b30]" : "bg-[#d97757]"}`}>
                <Icon d={m.error ? '<path d="M12 8v5M12 16h.01"/>' : SPARK} className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className={`whitespace-pre-wrap text-[14px] leading-relaxed ${m.error ? "text-[#ff3b30]" : ""}`}>{m.text}</p>
                {m.before && (
                  <div className="mt-1.5 flex items-center gap-2 text-[12px] text-[#8e8e93]">
                    {m.undone ? (
                      <span>Fortrudt</span>
                    ) : (
                      <>
                        <span className="text-[#248a3d]">✓ {m.changed === 1 ? "1 ændring" : `${m.changed} ændringer`} - se forhåndsvisningen</span>
                        <button
                          type="button"
                          className="text-[#0071e3] hover:underline"
                          onClick={() => {
                            onApply(m.before!);
                            setChat((c) => c.map((x, j) => (j >= i && x.before ? { ...x, undone: true } : x)));
                          }}
                        >
                          Fortryd
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        )}
        {pending && (
          <div className="flex items-center gap-2.5">
            <span className="flex h-6 w-6 flex-none animate-spin items-center justify-center rounded-full bg-[#d97757] text-white [animation-duration:2.5s]">
              <Icon d={SPARK} className="h-3.5 w-3.5" />
            </span>
            <span className="text-[14px] text-[#8e8e93]">Arbejder på det…</span>
          </div>
        )}
        <div ref={end} />
      </div>
      <form
        className="mx-2 mb-3 rounded-[22px] bg-white p-2 shadow-[0_2px_12px_rgba(0,0,0,.06)] ring-1 ring-black/[.08] focus-within:ring-black/20"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <textarea
          value={text}
          rows={2}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(text);
            }
          }}
          placeholder="Beskriv en ændring…"
          className="block w-full resize-none border-0 bg-transparent px-2 py-1 text-[15px] placeholder:text-[#8e8e93] focus:outline-none focus:ring-0"
        />
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] text-[#8e8e93]">Claude kan tage fejl - tjek forhåndsvisningen.</span>
          <button type="submit" disabled={pending || !text.trim()} aria-label="Send" className="flex h-8 w-8 items-center justify-center rounded-full bg-[#d97757] text-white transition hover:bg-[#c96442] disabled:bg-[#e9e9eb] disabled:text-[#8e8e93]">
            <Icon d='<path d="M12 19V5M5 12l7-7 7 7"/>' className="h-4 w-4" />
          </button>
        </div>
      </form>
    </div>
  );
}

/** The tour's files: how many still come from other sites, and copying them to us. */
function FilesGroup({ slug, config, onHosted }: { slug: string; config: TourConfig; onHosted: (c: TourConfig) => void }) {
  const outside = outsideFiles(config);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <Group title="Filer">
      {outside.length ? (
        <>
          <p className="text-[14px] leading-snug">
            {outside.length === 1 ? "1 fil" : `${outside.length} filer`} hentes stadig fra andre sider (fx kundens hjemmeside) og kan forsvinde, hvis siden ændres.
          </p>
          <button
            type="button"
            disabled={pending}
            className="w-full rounded-xl bg-[#0071e3] py-2.5 text-[15px] font-medium text-white hover:bg-[#0077ed] disabled:opacity-50"
            onClick={() =>
              start(async () => {
                const r = await hostTourFiles(slug, config);
                onHosted(r.config);
                setMsg(`${r.copied} ${r.copied === 1 ? "fil" : "filer"} gemt hos os - husk at gemme touren.${r.failed.length ? ` Kunne ikke: ${r.failed.join("; ")}` : ""}`);
              })
            }
          >
            {pending ? "Henter filerne…" : "Gem alle filer hos os"}
          </button>
        </>
      ) : (
        <p className="text-[14px] leading-snug">✓ Alle tourens billeder, logo og videoer ligger hos os.</p>
      )}
      {msg && <p className="text-[12px] leading-snug text-[#6e6e73]">{msg}</p>}
    </Group>
  );
}

/**
 * An iPhone (15/16: a 393 × 852 screen) with the tour at its real size,
 * scaled down to fit - so the preview lays out exactly as on a phone.
 */
const PHONE = { w: 393, h: 852, bezel: 12 };
function PhoneFrame({ children }: { children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.8);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setScale(Math.min(1, el.clientHeight / (PHONE.h + 2 * PHONE.bezel), el.clientWidth / (PHONE.w + 2 * PHONE.bezel)));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={box} className="flex h-full w-full items-center justify-center overflow-hidden">
      <div style={{ width: (PHONE.w + 2 * PHONE.bezel) * scale, height: (PHONE.h + 2 * PHONE.bezel) * scale }}>
        <div
          className="relative origin-top-left rounded-[58px] bg-[#1d1d1f] shadow-[0_30px_60px_rgba(0,0,0,.3)]"
          style={{ width: PHONE.w + 2 * PHONE.bezel, height: PHONE.h + 2 * PHONE.bezel, padding: PHONE.bezel, transform: `scale(${scale})` }}
        >
          <span className="absolute left-1/2 top-[23px] z-10 h-[34px] w-[124px] -translate-x-1/2 rounded-full bg-black" />
          <div className="h-full w-full overflow-hidden rounded-[46px] bg-black">{children}</div>
        </div>
      </div>
    </div>
  );
}

/**
 * If a setup can't be shown (a malformed edit), the editor stays up: a short
 * message and a way back to the saved version - never a crashed page.
 */
class SafeArea extends Component<{ onUndo: () => void; children: React.ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(err: unknown) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-[17px] font-semibold">Den seneste ændring kan ikke vises</p>
        <p className="max-w-md text-[13px] text-[#6e6e73]">Noget i opsætningen har en forkert form ({this.state.error}). Intet er gemt - gå tilbage til den gemte version og prøv igen.</p>
        <button
          type="button"
          className="rounded-full bg-[#0071e3] px-5 py-2 text-[15px] font-medium text-white"
          onClick={() => {
            this.props.onUndo();
            this.setState({ error: null });
          }}
        >
          Tilbage til den gemte version
        </button>
      </div>
    );
  }
}

/** "maps.google.dk" -> "https://maps.google.dk" - a link without https:// would point inside Arpo. */
const withProtocol = (url: string) => (/^(https?:|mailto:|tel:|#)/i.test(url.trim()) ? url.trim() : `https://${url.trim()}`);

/** The tour's address - /t/<slug> (MPSkins' "Pretty-URL"). The old address keeps working. */
function SlugField({ slug, dirty }: { slug: string; dirty: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(slug);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Group title="Adresse (Pretty-URL)">
      <Field title="Tourens link" hint="Fx halvorsmindeefterskole. Det gamle link og koden på kundens side virker stadig - de sendes videre.">
        <div className="flex items-center gap-2">
          <span className="flex min-w-0 flex-1 items-center rounded-[10px] bg-[#f2f2f7] pl-3 focus-within:bg-white focus-within:ring-2 focus-within:ring-[#0071e3]">
            <span className="text-[15px] text-[#8e8e93]">/t/</span>
            <input className="min-w-0 flex-1 border-0 bg-transparent py-2 pr-3 text-[15px] focus:outline-none focus:ring-0" value={value} onChange={(e) => setValue(e.target.value.toLowerCase().replace(/[^a-z0-9æøå-]/g, ""))} />
          </span>
          <button
            type="button"
            disabled={pending || value === slug || !value || dirty}
            title={dirty ? "Gem dine ændringer først" : undefined}
            className="flex-none rounded-xl bg-[#0071e3] px-4 py-2 text-[14px] font-medium text-white disabled:opacity-40"
            onClick={() =>
              start(async () => {
                setError(null);
                const r = await renameTourSlug(slug, value);
                if (!r.ok) return setError(r.error);
                router.replace(`/tour-lab/${r.slug}/rediger`);
              })
            }
          >
            {pending ? "Skifter…" : "Skift"}
          </button>
        </div>
        {error && <p className="px-1 text-[12px] text-[#ff3b30]">{error}</p>}
      </Field>
    </Group>
  );
}

function DealPicker({ slug, initial }: { slug: string; initial: { id: string; name: string } | null }) {
  const [deal, setDeal] = useState(initial);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ id: string; companyName: string; displayName: string | null }[]>([]);
  const [, start] = useTransition();
  const pick = (d: { id: string; name: string } | null) =>
    start(async () => {
      await setTourDeal(slug, d?.id ?? null);
      setDeal(d);
      setQ("");
      setHits([]);
    });
  return (
    <Field title="Kunde">
      {deal ? (
        <div className="flex items-center justify-between rounded-[10px] bg-[#f2f2f7] px-3 py-2 text-[15px]">
          <Link href={`/deals/${deal.id}`} className="font-medium text-[#0071e3] hover:underline">
            {deal.name}
          </Link>
          <button type="button" className="text-[13px] text-[#ff3b30]" onClick={() => pick(null)}>
            Fjern
          </button>
        </div>
      ) : (
        <div className="relative">
          <input
            className={input}
            placeholder="Søg kunde…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              const query = e.target.value;
              start(async () => setHits(await searchDeals(query)));
            }}
          />
          {hits.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl bg-white/95 py-1 shadow-[0_10px_30px_rgba(0,0,0,.15)] ring-1 ring-black/[.06] backdrop-blur">
              {hits.map((h) => (
                <li key={h.id}>
                  <button type="button" className="w-full px-3 py-1.5 text-left text-sm hover:bg-[#0071e3] hover:text-white" onClick={() => pick({ id: h.id, name: h.displayName ?? h.companyName })}>
                    {h.displayName ?? h.companyName}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Field>
  );
}

type MenuGroup = { title: string; items: [string, string][] };
/** A row in the menu: a top-level entry (k left out) or a place inside a group. */
type Addr = { i: number; k?: number };
const same = (a: Addr | null, b: Addr | null) => Boolean(a && b && a.i === b.i && a.k === b.k);

/** Moves an entry: before another row, into a group (dropped on its header), or last (no target). */
function moveEntry(menu: MenuEntry[], from: Addr, to: Addr | null): MenuEntry[] {
  if (same(from, to)) return menu;
  const m = structuredClone(menu);
  // Remember the target by identity - indexes shift when the moved entry is taken out.
  const targetEntry = to ? m[to.i] : null;
  const targetItem = to?.k != null ? (m[to.i] as MenuGroup).items[to.k] : null;
  let moving: MenuEntry;
  if (from.k != null) {
    const [[title, href]] = (m[from.i] as MenuGroup).items.splice(from.k, 1);
    moving = { title, href };
  } else [moving] = m.splice(from.i, 1);
  if (!targetEntry || targetEntry === moving) return [...m, moving];
  if ("items" in targetEntry && !("items" in moving)) {
    const at = targetItem ? targetEntry.items.indexOf(targetItem) : 0;
    targetEntry.items.splice(at, 0, [moving.title, moving.href]);
  } else m.splice(m.indexOf(targetEntry), 0, moving);
  return m;
}

type Kind = "sted" | "web" | "luft";
const kindOf = (href: string): Kind => (href === "#luften" ? "luft" : isPlaceHref(href) ? "sted" : "web");
function whereText(href: string) {
  const kind = kindOf(href);
  if (!href) return "Mangler et mål";
  if (kind === "luft") return "Tilbage til luftfotoet";
  if (kind === "sted") {
    const ss = new URLSearchParams(href.split("?")[1] ?? "").get("ss");
    return `Sted i touren${ss ? ` · punkt ${ss}` : ""}`;
  }
  try {
    return new URL(href).hostname.replace(/^www\./, "");
  } catch {
    return href;
  }
}
const KIND_ICON: Record<Kind | "group", [string, string]> = {
  sted: ["bg-[#34c759]", '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>'],
  web: ["bg-[#0071e3]", '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/>'],
  luft: ["bg-[#5ac8fa]", '<path d="M3 14l4-1 4-7 2 1-2 6 5-1 2-3h2l-1 4 1 4h-2l-2-3-5-1 2 6-2 1-4-7-4-1z"/>'],
  group: ["bg-[#ff9500]", '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'],
};


/**
 * The menu as one list - like a phone's settings or a web shop's navigation
 * editor: drag rows to reorder (onto a group's header to put them in it),
 * click a row to edit it, and add places by walking to them in the preview.
 */
function MenuEditor({ menu, onChange, preview }: { menu: MenuEntry[]; onChange: (m: MenuEntry[]) => void; preview: PreviewApi }) {
  const [open, setOpen] = useState<Addr | null>(null);
  const [drag, setDrag] = useState<Addr | null>(null);
  const [over, setOver] = useState<Addr | "end" | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const get = (a: Addr): { title: string; href?: string; group?: boolean } => {
    const e = menu[a.i];
    if (a.k != null) {
      const [title, href] = (e as MenuGroup).items[a.k];
      return { title, href };
    }
    return "items" in e ? { title: e.title, group: true } : { title: e.title, href: e.href };
  };
  const set = (a: Addr, patch: { title?: string; href?: string }) =>
    onChange(
      menu.map((e, i): MenuEntry => {
        if (i !== a.i) return e;
        if (a.k != null && "items" in e) return { ...e, items: e.items.map((it, k): [string, string] => (k === a.k ? [patch.title ?? it[0], patch.href ?? it[1]] : it)) };
        return { ...e, ...patch } as MenuEntry;
      })
    );
  const remove = (a: Addr) => {
    onChange(a.k != null ? menu.map((e, i) => (i === a.i && "items" in e ? { ...e, items: e.items.filter((_, k) => k !== a.k) } : e)) : menu.filter((_, i) => i !== a.i));
    setOpen(null);
  };
  /** Adds an entry - inside the open group (or the group of the open place), otherwise last. */
  const add = (title: string, href: string) => {
    const g = open && "items" in menu[open.i] ? open.i : null;
    if (g != null) {
      const items = (menu[g] as MenuGroup).items;
      onChange(menu.map((e, i) => (i === g ? { ...(e as MenuGroup), items: [...items, [title, href]] } : e)));
      setOpen({ i: g, k: items.length });
    } else {
      onChange([...menu, { title, href }]);
      setOpen({ i: menu.length });
    }
  };
  async function fromPreview(then: (href: string, room: string | null) => void) {
    setBusy(true);
    setNote(null);
    const r = await preview.view();
    setBusy(false);
    if (r.error || !r.href) return setNote(r.error ?? "Forhåndsvisningen svarede ikke.");
    then(r.href, r.room ?? null);
  }

  const rowProps = (a: Addr) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.effectAllowed = "move";
      setDrag(a);
    },
    onDragEnd: () => {
      setDrag(null);
      setOver(null);
    },
    onDragOver: (e: React.DragEvent) => {
      if (!drag) return;
      e.preventDefault();
      if (!same(over as Addr, a)) setOver(a);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      if (drag) onChange(moveEntry(menu, drag, a));
      setDrag(null);
      setOver(null);
      setOpen(null);
    },
  });

  function row(a: Addr, depth: number) {
    const it = get(a);
    const kind = it.group ? "group" : kindOf(it.href ?? "");
    const isOpen = same(open, a);
    const isOver = same(over as Addr, a) && !same(drag, a);
    const groupDrop = isOver && it.group && drag?.k == null && !("items" in menu[drag!.i]);
    return (
      <div key={a.k ?? "top"} {...rowProps(a)} className={`${same(drag, a) ? "opacity-40" : ""}`}>
        {isOver && !groupDrop && <div className="mx-4 h-0.5 rounded-full bg-[#0071e3]" />}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setOpen(isOpen ? null : a)}
          onKeyDown={(e) => e.key === "Enter" && setOpen(isOpen ? null : a)}
          className={`group/row flex cursor-pointer items-center gap-3 py-2.5 pr-3 transition ${groupDrop ? "bg-[#0071e3]/10" : isOpen ? "bg-[#f2f2f7]" : "hover:bg-[#f9f9fb]"}`}
          style={{ paddingLeft: 12 + depth * 28 }}
        >
          <span className="cursor-grab text-[#c7c7cc] active:cursor-grabbing" title="Træk for at flytte">
            <Icon d='<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>' className="h-4 w-4" />
          </span>
          <span className={`flex h-[28px] w-[28px] flex-none items-center justify-center rounded-[7px] text-white ${KIND_ICON[kind][0]}`}>
            <Icon d={KIND_ICON[kind][1]} className="h-[16px] w-[16px]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className={`block truncate text-[15px] ${it.group ? "font-semibold" : ""}`}>{it.title || "Uden navn"}</span>
            <span className={`block truncate text-[12px] ${it.href === "" ? "text-[#ff9500]" : "text-[#8e8e93]"}`}>
              {it.group ? `Gruppe · ${(menu[a.i] as MenuGroup).items.length} steder` : whereText(it.href ?? "")}
            </span>
          </span>
          {kind === "sted" && (
            <button
              type="button"
              title="Vis i forhåndsvisningen"
              onClick={(e) => {
                e.stopPropagation();
                preview.go(it.title, it.href!);
              }}
              className="rounded-full px-2 py-1 text-[12px] font-medium text-[#0071e3] opacity-0 transition hover:bg-[#0071e3]/10 group-hover/row:opacity-100"
            >
              Vis
            </button>
          )}
          <Icon d={isOpen ? '<path d="M6 9l6 6 6-6"/>' : '<path d="M9 6l6 6-6 6"/>'} className="h-4 w-4 flex-none text-[#c7c7cc]" />
        </div>
        {isOpen && (
          <div className="space-y-3 border-t border-black/[.04] bg-[#f9f9fb] px-4 py-3" style={{ paddingLeft: 52 + depth * 28 }}>
            <Field title="Navn">
              <input autoFocus className={`${input} bg-white`} value={it.title} onChange={(e) => set(a, { title: e.target.value })} />
            </Field>
            {!it.group && (
              <Field title="Fører til">
                <Choice
                  value={kindOf(it.href ?? "") === "web" ? "web" : "sted"}
                  options={[
                    ["sted", "Et sted i touren"],
                    ["web", "En webside"],
                  ]}
                  onChange={(v) => set(a, { href: v === "web" ? "https://" : "" })}
                />
                {kindOf(it.href ?? "") === "web" ? (
                  <input className={`${input} mt-2 bg-white`} value={it.href} placeholder="https://…" onChange={(e) => set(a, { href: e.target.value })} />
                ) : (
                  <div className="mt-2 space-y-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => fromPreview((href) => set(a, { href }))}
                      className="flex w-full items-center justify-center gap-2 rounded-[10px] bg-white py-2 text-[14px] font-medium text-[#0071e3] ring-1 ring-black/[.06] hover:bg-[#0071e3]/5 disabled:opacity-50"
                    >
                      <Icon d={KIND_ICON.sted[1]} className="h-4 w-4" />
                      {it.href ? "Brug det udsyn, forhåndsvisningen viser nu" : "Brug det sted, forhåndsvisningen viser"}
                    </button>
                    <p className="text-[12px] leading-snug text-[#8e8e93]">Gå hen og drej, så det ser rigtigt ud i forhåndsvisningen til højre - tryk så her. Den retning, du kigger, kommer med.</p>
                    <details className="text-[12px] text-[#8e8e93]">
                      <summary className="cursor-pointer select-none">Indsæt link i stedet</summary>
                      <input className={`${input} mt-1.5 bg-white text-[13px]`} value={it.href} placeholder="U-link fra Matterport eller MPSkins-link" onChange={(e) => set(a, { href: e.target.value })} />
                    </details>
                  </div>
                )}
              </Field>
            )}
            <button type="button" onClick={() => remove(a)} className="text-[13px] text-[#ff3b30] hover:underline">
              {it.group ? "Slet gruppen og dens steder" : "Slet"}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Group>
        <div className="-m-4">
          {menu.length === 0 && <p className="px-4 py-6 text-center text-[14px] text-[#8e8e93]">Menuen er tom. Gå til et sted i forhåndsvisningen, og tryk &quot;Tilføj det sted, du ser&quot;.</p>}
          <div className="divide-y divide-black/[.05]">
            {menu.map((e, i) => (
              <div key={i}>
                {row({ i }, 0)}
                {"items" in e && e.items.map((_, k) => row({ i, k }, 1))}
              </div>
            ))}
          </div>
          {drag && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setOver("end");
              }}
              onDrop={(e) => {
                e.preventDefault();
                onChange(moveEntry(menu, drag, null));
                setDrag(null);
                setOver(null);
              }}
              className={`m-2 rounded-xl border-2 border-dashed py-2 text-center text-[12px] ${over === "end" ? "border-[#0071e3] text-[#0071e3]" : "border-black/10 text-[#8e8e93]"}`}
            >
              Slip her for at lægge nederst
            </div>
          )}
        </div>
      </Group>

      <div className="space-y-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => fromPreview((href, room) => add(room ?? "Nyt sted", href))}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0071e3] py-2.5 text-[15px] font-medium text-white shadow-sm hover:bg-[#0077ed] disabled:opacity-50"
        >
          <Icon d='<path d="M12 5v14M5 12h14"/>' className="h-4 w-4" />
          {busy ? "Henter stedet…" : "Tilføj det sted, du ser"}
        </button>
        {note && <p className="px-1 text-[12px] text-[#ff3b30]">{note}</p>}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => add("Ny side", "https://")} className="rounded-xl bg-white py-2 text-[14px] font-medium text-[#0071e3] ring-1 ring-black/[.06] hover:bg-[#0071e3]/5">
            + Webside
          </button>
          <button
            type="button"
            onClick={() => {
              onChange([...menu, { title: "Ny gruppe", items: [] }]);
              setOpen({ i: menu.length });
            }}
            className="rounded-xl bg-white py-2 text-[14px] font-medium text-[#0071e3] ring-1 ring-black/[.06] hover:bg-[#0071e3]/5"
          >
            + Gruppe
          </button>
        </div>
        <p className="px-1 text-[12px] leading-snug text-[#8e8e93]">
          Træk i <span className="tracking-tighter">⋮⋮</span> for at flytte. Slip et sted på en gruppe for at lægge det i gruppen. Er en gruppe åben, lægges nye steder i den.
        </p>
      </div>
    </div>
  );
}

function CtaEditor({ cta, onChange }: { cta: TourConfig["cta"]; onChange: (c: TourConfig["cta"]) => void }) {
  return (
    <Field title="Knapper (fx Book, Kontakt)">
      <div className="space-y-2">
        {cta.map((c, i) => (
          <div key={i} className="space-y-1.5 rounded-xl bg-[#f2f2f7]/60 p-2.5">
            <div className="flex gap-1.5">
              <input className={input} value={c.label} placeholder="Tekst" onChange={(e) => onChange(cta.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
              <button type="button" className="text-[#c7c7cc] hover:text-[#ff3b30]" onClick={() => onChange(cta.filter((_, j) => j !== i))} aria-label="Slet">
                ×
              </button>
            </div>
            <input className={input} value={c.href} placeholder="https://…" onChange={(e) => onChange(cta.map((x, j) => (j === i ? { ...x, href: e.target.value } : x)))} onBlur={(e) => e.target.value && onChange(cta.map((x, j) => (j === i ? { ...x, href: withProtocol(e.target.value) } : x)))} />
            <label className="flex items-center gap-2 text-[13px] text-[#1d1d1f]">
              <input type="checkbox" className="accent-[#0071e3]" checked={c.primary} onChange={(e) => onChange(cta.map((x, j) => (j === i ? { ...x, primary: e.target.checked } : x)))} />
              Hovedknap (fremhævet)
            </label>
          </div>
        ))}
        <button type="button" className="text-sm font-medium text-[#0071e3]" onClick={() => onChange([...cta, { label: "Ny knap", href: "", primary: cta.length === 0 }])}>
          + Knap
        </button>
      </div>
    </Field>
  );
}
