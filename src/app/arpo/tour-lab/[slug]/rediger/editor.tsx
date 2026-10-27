"use client";

import { InsightsPanel } from "./insights";
import { LanguagesPanel } from "./languages";
import { tourUrl } from "@/lib/public-urls";
import { formatPhone, IMAGE_HREF, imageOfHref, isPlaceHref, placeHref, pointOfHref } from "../../tours/places";
import { tourConfigProblem } from "@/lib/tour-validate";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Component, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { detachToursFromMpskins, logTourWork, renameTourSlug, restoreTourVersion, saveTour, saveTourDraft, searchDeals, setTourDeal } from "@/lib/actions/tours";
import { SOCIALS } from "../../tours/social";
import { askClaudeForTour, saveAnthropicKey, type ChatTurn } from "@/lib/actions/tour-ai";
import type { MenuEntry, TourConfig } from "../../tours/types";
import type { TourStats } from "@/lib/tour-stats";
import type { ReportShare } from "@/lib/tour-share";
import { CardsEditor, GuideEditor, StartEditor, TagsEditor } from "./content";
import { ResultsPanel } from "./results";
import { DesignGallery } from "./design-gallery";
import { ScanPointsEditor } from "./scanpoints";
import { LiveDataEditor } from "./live";
import type { ScanMap } from "@/lib/matterport-graph";
import { currentPreset } from "../../tours/presets";
import { EconomyPanel, type TourEconomy } from "./economy";
import { DEFAULT_EMBED, SharePanel, SitePreview, type EmbedSize } from "./share";
import { Choice, Field, FilesContext, Group, Icon, input, outsideFiles, PanoZoom, ssOfHref, Toggle, UploadButton, withProtocol, type PreviewApi } from "./ui";
import { fetchSiteFavicon, hostTourFiles } from "@/lib/actions/tour-files";
import { AiMemoryPanel } from "./memory";
import { MapEditor } from "./map-editor";
import { FeedbackPanel } from "./feedback-panel";
import { LinksOpenEditor } from "./links-open";

/** A zoom level in words, for the Zoom sliders (1 = Matterport's normal view). */
const zoomLabel = (z: number) => (Math.abs(z - 1) < 0.01 ? "normal" : z < 1 ? `zoomet ud (${Math.round(z * 100)} %)` : `zoomet ind (${Math.round(z * 100)} %)`);

type Version = { id: string; note: string | null; by: string | null; at: string };
type Tab = "sprog" | "claude" | "live" | "scan" | "okonomi" | "resultater" | "del" | "tags" | "start" | "rundvisning" | "kort" | "kortet" | "feedback" | "generelt" | "design" | "menu" | "funktioner" | "links" | "avanceret" | "versioner";

/** Claude's mark: a small sunburst. */
const SPARK = '<path d="M12 3v5M12 16v5M3 12h5M16 12h5M5.6 5.6l3.5 3.5M14.9 14.9l3.5 3.5M5.6 18.4l3.5-3.5M14.9 9.1l3.5-3.5"/>';

/** The sections, with a small icon each (SF Symbols-like, drawn with strokes), under their headings. */
const TABS: [Tab, string, string, string?][] = [
  ["claude", "nextviewAI", SPARK],
  ["resultater", "Resultater", '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'],
  ["feedback", "Feedback", '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>'],
  ["del", "Del og udgiv", '<path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>'],
  ["start", "Start", '<path d="M5 4v16M5 5h11l-2 4 2 4H5"/>', "Indhold"],
  ["menu", "Menu", '<path d="M4 6h16M4 12h16M4 18h10"/>'],
  ["rundvisning", "Vis mig rundt", '<circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l5.5-3.5z"/>'],
  ["kortet", "Interaktivt kort", '<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>'],
  ["scan", "Scanpunkter", '<circle cx="6" cy="6" r="2"/><circle cx="18" cy="8" r="2"/><circle cx="9" cy="17" r="2"/><circle cx="17" cy="18" r="2"/><path d="M8 6.5l8 1M7 8l1.5 7M11 17h4"/>'],
  ["tags", "Tags", '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="8" cy="8" r="1.5"/>'],
  ["live", "Live data", '<path d="M3 12h4l3-8 4 16 3-8h4"/>'],
  ["kort", "Stedkort", '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 10h8M8 14h5"/>'],
  ["links", "Knapper og links", '<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>'],
  ["design", "Design", '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.3A4.7 4.7 0 0 0 21 9.7C21 5.9 17 3 12 3z"/><circle cx="7.5" cy="11.5" r="1"/><circle cx="10.5" cy="7.5" r="1"/><circle cx="15.5" cy="8" r="1"/>', "Udseende og opsætning"],
  ["sprog", "Sprog", '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'],
  ["funktioner", "Funktioner", '<path d="M12 3l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 15.4 7.2 18l.9-5.4L4.2 8.7l5.4-.8z"/>'],
  ["generelt", "Generelt", '<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/>'],
  ["okonomi", "Tid og pris", '<circle cx="12" cy="12" r="9"/><path d="M14.5 9.5a2.5 2 0 0 0-2.5-1.5c-1.4 0-2.5.8-2.5 2s1.1 1.6 2.5 2 2.5.8 2.5 2-1.1 2-2.5 2a2.5 2 0 0 1-2.5-1.5M12 6.5v1.5M12 16v1.5"/>', "Mere"],
  ["versioner", "Versioner", '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'],
  ["avanceret", "Avanceret", '<path d="M8 6l-5 6 5 6M16 6l5 6-5 6"/>'],
];

/**
 * What the search over the sections finds: the settings in each section, by
 * the words on them (and a few words people use for them).
 */
const FINDS: Partial<Record<Tab, string[]>> = {
  claude: ["AI", "Spørg", "Lav om", "Hukommelse"],
  resultater: ["Statistik", "Besøg", "Klik", "Rapport", "Leads"],
  feedback: ["Rettelser", "Kundegennemsyn", "Kommentarer"],
  del: ["Udgiv", "Link", "QR-kode", "Indlejr", "iframe", "Kode til hjemmesiden", "Cloudflare"],
  start: ["Startpunkt", "Hvor touren starter", "Startposition", "Forsiden", "Velkomsten", "Fliser", "Kort film før touren", "Intro-video", "Steder med foto", "Træd indenfor", "Sådan ser en dag ud"],
  menu: ["Menupunkter", "Grupper", "Tilføj det sted, du ser", "Billede i menuen", "360°-billede", "Webside", "Luftfotoet", "Scanpunkter i menuen"],
  rundvisning: ["Vis mig rundt", "Guide", "Guidet tur", "Stop", "Drejning", "Sekunder ved hvert stop", "Stemme", "Lav den ud fra menuen"],
  kortet: ["Interaktivt kort", "Luftfoto", "Dronebillede", "360°-kort", "Punkter på kortet", "Kategorier", "Skyer", "Boksen øverst", "Filteret", "Startudsnit", "Ikoner"],
  scan: ["Scanpunkter", "Skjul scanpunkter", "Startpunkt", "Personer i scans"],
  tags: ["Tags", "Infotags", "Hotspots", "Pris", "Video"],
  live: ["Live data", "Ledige pladser", "Ledige rum", "Book-knap", "Hent nye data"],
  kort: ["Stedkort", "Kort ved punkt", "Din plads venter", "Kort efter et stykke tid"],
  links: ["Knapper", "Book", "Kontakt", "Telefon", "E-mail", "Adresse", "Sociale medier", "Kontaktformular", "Skriv til os", "Åbning", "Popup", "Ny fane", "Kort-link"],
  design: ["Farver", "Skrift", "Font", "Logo", "Logostørrelse", "Logoets afstand", "Favicon", "Mørkt logo", "Farvefilter", "Menu-design", "Dock"],
  sprog: ["Sprog", "Engelsk", "Tysk", "Oversæt"],
  funktioner: ["Navigation", "Bevægelse", "Fri bevægelse", "Kun punkter", "Skift mellem steder", "Fade", "Flyv", "Zoom", "Lås zoom på mobil", "Menu åben på computer", "Menu åben på mobil", "Dæmp touren bag menuen", "Historier", "Scroll i historierne", "Find vej", "Vis mål", "Matterports egne knapper", "Hjælp ved start"],
  generelt: ["Navn", "Firmanavn", "Undertitel", "Matterport-model", "Start-link"],
  okonomi: ["Tid", "Pris", "Timer", "Økonomi"],
  versioner: ["Versioner", "Fortryd", "Gendan", "Historik"],
  avanceret: ["Eget design", "CSS", "JSON", "Opsætningen"],
};

/** The sections and settings matching a search (and the tour's own menu items, which are under Menu). */
function searchTabs(q: string, menu: MenuEntry[]): { tab: Tab; label: string; section: string }[] {
  const norm = (x: string) => x.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const words = norm(q).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const hit = (x: string) => words.every((w) => norm(x).includes(w));
  const out: { tab: Tab; label: string; section: string }[] = [];
  for (const [t, title] of TABS) {
    if (hit(title)) out.push({ tab: t, label: title, section: "" });
    for (const f of FINDS[t] ?? []) if (hit(f) && f !== title) out.push({ tab: t, label: f, section: title });
  }
  for (const m of menu) {
    if (hit(m.title)) out.push({ tab: "menu", label: m.title, section: "Menu - menupunkt" });
    if ("items" in m) for (const [name] of m.items) if (hit(name)) out.push({ tab: "menu", label: name, section: `Menu - i ${m.title}` });
  }
  return out.slice(0, 30);
}

const when = (iso: string) => new Date(iso).toLocaleString("da-DK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function TourEditor({
  slug,
  initial,
  serverDraft,
  deal,
  versions,
  aiReady,
  stats,
  share,
  shareStats,
  shareToken,
  blob,
  published,
  onCloudflare,
  economy,
  scanMap,
  mpskinsHidden,
  scanCount,
  reviewToken,
  feedbackOpen,
}: {
  slug: string;
  initial: TourConfig;
  /** Changes autosaved on the server but never saved - offered back when the editor opens. */
  serverDraft: { config: TourConfig; at: string; by: string | null } | null;
  deal: { id: string; name: string } | null;
  versions: Version[];
  aiReady: boolean;
  stats: TourStats;
  share: ReportShare;
  shareStats: TourStats;
  shareToken: string | null;
  /** Vercel Blob is set up (uploads of big files, videos). */
  blob: boolean;
  published: boolean;
  /** The tour has a live version on Cloudflare - its embed code points there. */
  onCloudflare: boolean;
  economy: TourEconomy;
  scanMap: ScanMap | null;
  mpskinsHidden: string[];
  scanCount: number | null;
  /** Kundegennemsyn's link token (null = off), and how much feedback is open. */
  reviewToken: string | null;
  feedbackOpen: number;
}) {
  const router = useRouter();
  const [config, setConfig] = useState<TourConfig>(initial);
  /** The search over the sections (above nextviewAI). */
  const [search, setSearch] = useState("");
  const found = searchTabs(search, config.menu);
  /*
   * Autosave: every change is kept in the browser at once (survives a lost
   * connection or a closed browser) and as a draft on the server every 15
   * seconds - never in the tour itself until "Gem". Opening the editor again
   * offers the newest one back.
   */
  const localKey = `tour-draft:${slug}`;
  const [autosavedAt, setAutosavedAt] = useState<string | null>(null);
  const [offer, setOffer] = useState<{ config: TourConfig; at: string; by: string | null } | null>(null);
  useEffect(() => {
    let local: { config: TourConfig; at: string } | null = null;
    try {
      local = JSON.parse(localStorage.getItem(localKey) ?? "null");
    } catch {}
    const same = (c: TourConfig) => JSON.stringify(c) === JSON.stringify(initial);
    const options = [local && { ...local, by: null }, serverDraft].filter((x): x is { config: TourConfig; at: string; by: string | null } => Boolean(x && !same(x.config)));
    const newest = options.sort((a, b) => b.at.localeCompare(a.at))[0];
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from the browser's storage after loading
    if (newest) setOffer(newest);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function forgetDraft() {
    try {
      localStorage.removeItem(localKey);
    } catch {}
    saveTourDraft(slug, null).catch(() => {});
    setAutosavedAt(null);
  }
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<Tab>("claude");

  /** A request for nextviewAI from elsewhere in the editor (a suggestion from Resultater). */
  const [aiAsk, setAiAsk] = useState<{ request: string; at: number } | null>(null);
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
  const [device, setDeviceNow] = useState<"computer" | "mobil" | "site">("computer");
  /** Where the preview stood before it was reloaded in another frame - flown back to once it's ready. */
  const carry = useRef<string | null>(null);
  const [siteWidth, setSiteWidth] = useState<"computer" | "mobil">("computer");
  /** Which device the preview shows - read by the preview's helpers (bound once). */
  const deviceRef = useRef<"computer" | "mobil">("computer");
  useEffect(() => {
    deviceRef.current = device === "site" ? siteWidth : device;
  });
  const embed: EmbedSize = config.embeds?.size ?? DEFAULT_EMBED;
  const setEmbed = (size: EmbedSize) => edit((d) => void (d.embeds = { ...d.embeds, size }));
  const [previewKey, setPreviewKey] = useState(0);
  /** The preview popped out over the whole window. */
  const [big, setBig] = useState(false);
  const bigBox = useRef<HTMLDivElement>(null);
  /** Big = the whole screen (the browser's own full screen where it can), as a visitor sees the tour full screen. */
  /** The "Luk" hint over the top of the tour, gone after a few seconds so it doesn't cover what's there. */
  const [bigHint, setBigHint] = useState(false);
  function openBig() {
    setBig(true);
    setBigHint(true);
    setTimeout(() => setBigHint(false), 3500);
    bigBox.current?.requestFullscreen?.().catch(() => {});
  }
  function closeBig() {
    setBig(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }
  useEffect(() => {
    if (!big) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setBig(false);
    // Leaving the browser's full screen (Esc, or its own button) closes the big view too.
    const onFull = () => !document.fullscreenElement && setBig(false);
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFull);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFull);
    };
  }, [big]);
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
        const to = carry.current;
        carry.current = null;
        if (to) setTimeout(() => frame.current?.contentWindow?.postMessage({ type: "tour-go", name: "", href: to }, location.origin), 300);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  // Autosave while there are changes: the browser at once, the server every 15 seconds.
  useEffect(() => {
    if (!dirty) return;
    const local = setTimeout(() => {
      try {
        localStorage.setItem(localKey, JSON.stringify({ config, at: new Date().toISOString() }));
      } catch {}
    }, 800);
    return () => clearTimeout(local);
  }, [config, dirty, localKey]);
  useEffect(() => {
    if (!dirty) return;
    const remote = setTimeout(() => {
      if (!navigator.onLine) return;
      saveTourDraft(slug, config)
        .then((r) => r.ok && setAutosavedAt(r.at))
        .catch(() => {});
    }, 15_000);
    return () => clearTimeout(remote);
  }, [config, dirty, slug]);
  // Leaving with unsaved changes: the browser asks first (they're autosaved either way).
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
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
      device: () => deviceRef.current,
      panoView: () => ask<{ yaw?: number; pitch?: number; hfov?: number; phone?: boolean; image?: string }>("tour-pano-view"),
    };
  }, []);

  /**
   * Switches Computer / Mobil / På hjemmeside. Computer and Mobil share one
   * frame (nothing reloads); to or from "På hjemmeside" the tour loads again,
   * so the spot it stood in is taken along and flown back to.
   */
  function setDevice(next: "computer" | "mobil" | "site") {
    if (next === device) return;
    if ((next === "site") === (device === "site")) return setDeviceNow(next);
    preview
      .view()
      .then((r) => {
        carry.current = r.href ?? null;
      })
      .finally(() => setDeviceNow(next));
  }

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
      // Saved for real - the draft is in the tour now (the server cleared its copy).
      try {
        localStorage.removeItem(localKey);
      } catch {}
      setAutosavedAt(null);
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
        <Link href="/arpo/tour-lab" className="flex items-center gap-1 text-[15px] text-[#0071e3] hover:opacity-80">
          <Icon d='<path d="M15 5l-7 7 7 7"/>' className="h-4 w-4" />
          Tours
        </Link>
        <div className="mx-auto min-w-0 text-center">
          <h1 className="text-[15px] font-semibold tracking-tight">{config.title}</h1>
          <p className="text-[12px] text-[#8e8e93]">
            {dirty ? `Ændringer ikke gemt${autosavedAt ? ` · autogemt ${new Date(autosavedAt).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" })}` : ""}` : `Gemt · ${versions[0] ? when(versions[0].at) : ""}`}
          </p>
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
                  forgetDraft();
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
            <a href={`/arpo/tour-lab/${slug}`} target="_blank" rel="noopener" className="rounded-full bg-[#f2f2f7] px-3.5 py-1.5 text-[13px] font-medium hover:bg-[#e9e9eb]">
              Åbn tour ↗
            </a>
          )}
        </div>
      </div>

      {offer && (
        <div className="flex flex-wrap items-center justify-center gap-3 border-b border-[#ff9500]/30 bg-[#fff6e5] px-4 py-2 text-[13px] text-[#8a5300]">
          <span>
            Der er ændringer, der ikke blev gemt (autogemt {new Date(offer.at).toLocaleString("da-DK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            {offer.by ? ` af ${offer.by}` : ""}).
          </span>
          <button
            type="button"
            onClick={() => {
              setConfig(offer.config);
              setDirty(true);
              setOffer(null);
            }}
            className="rounded-full bg-[#ff9500] px-3 py-1 font-semibold text-white"
          >
            Fortsæt med dem
          </button>
          <button
            type="button"
            onClick={() => {
              setOffer(null);
              forgetDraft();
            }}
            className="rounded-full px-3 py-1 font-medium hover:bg-black/5"
          >
            Kassér
          </button>
        </div>
      )}
      <SafeArea onUndo={() => { setConfig(initial); setDirty(false); }}>
      <div className="flex min-h-0 flex-1">
        {/* Sections */}
        <nav className="flex min-h-0 w-[210px] flex-none flex-col gap-0.5 overflow-y-auto overscroll-contain p-3">
          <div className="relative mb-1.5">
            <Icon d='<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>' className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8e8e93]" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setSearch("");
                if (e.key === "Enter" && found[0]) {
                  setTab(found[0].tab);
                  setSearch("");
                }
              }}
              placeholder="Søg i funktioner og menu"
              className="w-full rounded-[9px] bg-black/[.05] py-[7px] pl-8 pr-2 text-[13px] outline-none placeholder:text-[#8e8e93] focus:bg-white focus:ring-2 focus:ring-[#0071e3]/40"
            />
          </div>
          {search.trim() &&
            (found.length ? (
              found.map((f, i) => (
                <button
                  key={`${f.tab}-${f.label}-${i}`}
                  type="button"
                  onClick={() => {
                    setTab(f.tab);
                    setSearch("");
                  }}
                  className="rounded-[9px] px-2.5 py-[6px] text-left hover:bg-black/[.04]"
                >
                  <span className="block text-[14px] text-[#1d1d1f]">{f.label}</span>
                  {f.section && <span className="block text-[11px] text-[#8e8e93]">{f.section}</span>}
                </button>
              ))
            ) : (
              <p className="px-2.5 py-2 text-[12px] text-[#8e8e93]">Intet fundet - prøv et andet ord, eller spørg nextviewAI.</p>
            ))}
          {!search.trim() && TABS.map(([t, text, icon, heading]) => (
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
              {t === "feedback" && feedbackOpen > 0 && <span className="ml-auto rounded-full bg-[#ff9500] px-1.5 text-[11px] font-semibold text-white">{feedbackOpen}</span>}
            </button>
            </div>
          ))}
        </nav>

        {/* Settings */}
        <div className="flex w-[400px] flex-none flex-col">
          {tab === "claude" ? (
            <ClaudePanel
              ask={aiAsk}
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
                <Field title="Matterport-model" hint="Det ID, der står efter m= i Matterport-linket. Scanpunkterne hentes direkte fra Matterport.">
                  <input className={input} value={config.modelId ?? ""} placeholder={config.tourPage ? "Hentes fra MPSkins - frakobl herunder" : "Fx rxaXbNZcETf"} onChange={(e) => edit((d) => void (d.modelId = e.target.value.trim() || undefined))} />
                </Field>
                {config.tourPage && <DetachMpskins slug={slug} dirty={dirty} />}
                <Field title="Start" hint="Vælg startpunktet under Scanpunkter (Start her) - eller indsæt et link her.">
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
                      ["simple", "Helt enkel"],
                    ]}
                    onChange={(v) => edit((d) => void (d.design = { ...d.design, welcome: d.design?.welcome ?? "tiles", menu: v }))}
                  />
                </Field>
                {menuStyle === "picker" && (
                  <Field title="Når man vælger en størrelse, start i" hint="Findes rummet ikke i en størrelse, starter den i størrelsens første">
                    <select
                      className={input}
                      value={config.design?.first ?? ""}
                      onChange={(e) => edit((d) => void (d.design = { welcome: d.design?.welcome ?? "tiles", menu: d.design?.menu ?? "picker", first: e.target.value || undefined }))}
                    >
                      <option value="">Det første i hver størrelse</option>
                      {[...new Set(config.menu.flatMap((m) => ("items" in m ? m.items.map((i) => i[0]) : [])))].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
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
                          onPointerDown={() => frame.current?.contentWindow?.postMessage({ type: "tour-peek" }, location.origin)}
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
                  <p className="px-1 text-[12px] leading-snug text-[#8e8e93]">Lægges over selve 3D-touren - fx lidt lysere og varmere. Forhåndsvisningen går ind i touren, så du ser det, mens du trækker.</p>
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
                  <SiteFavicon slug={slug} config={config} onDone={(url) => edit((d) => void (d.favicon = url))} />
                </Field>
                <Field title={`Logostørrelse: ${config.logoSize ?? 46} px`}>
                  <input type="range" min={28} max={120} className="w-full accent-[#0071e3]" value={config.logoSize ?? 46} onChange={(e) => edit((d) => void (d.logoSize = Number(e.target.value)))} />
                </Field>
                {(["top", "side"] as const).map((k) => {
                  const v = config.logoOffset?.[k];
                  return (
                    <Field key={k} title={`Afstand fra ${k === "top" ? "toppen" : "siden"}: ${v != null ? `${v} px` : "standard"}`}>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={0}
                          max={80}
                          className="w-full accent-[#0071e3]"
                          value={v ?? (k === "top" ? 14 : 16)}
                          onChange={(e) => edit((d) => void (d.logoOffset = { ...d.logoOffset, [k]: Number(e.target.value) }))}
                        />
                        {v != null && (
                          <button
                            type="button"
                            className="shrink-0 text-[12px] font-medium text-[#0071e3]"
                            onClick={() =>
                              edit((d) => {
                                const o = { ...d.logoOffset };
                                delete o[k];
                                d.logoOffset = o.top == null && o.side == null ? undefined : o;
                              })
                            }
                          >
                            Standard
                          </button>
                        )}
                      </div>
                    </Field>
                  );
                })}
                <Field title="Logoet sidder til - menuen tager den anden side">
                  <Choice
                    value={config.logoSide ?? "left"}
                    options={[
                      ["left", "Venstre"],
                      ["right", "Højre"],
                    ]}
                    onChange={(v) => edit((d) => void (d.logoSide = v === "right" ? "right" : undefined))}
                  />
                </Field>
                <Toggle on={Boolean(config.logoOnLight)} onChange={(on) => edit((d) => void (d.logoOnLight = on))} title="Mørkt logo" hint="Et logo lavet til lys baggrund (bruges også i menuens top)." />
                {config.logoOnLight && (
                  <Toggle
                    on={config.logoCard !== false}
                    onChange={(on) => edit((d) => void (d.logoCard = on ? undefined : false))}
                    title="Hvidt kort bag logoet"
                    hint="Fra: logoet ligger gennemsigtigt direkte på touren, præcis som det er - som i MPSkins."
                  />
                )}
                </Group>
              </>
            )}

            {tab === "resultater" && (
              <>
                <InsightsPanel
                  slug={slug}
                  config={config}
                  onAsk={(request) => {
                    setTab("claude");
                    setAiAsk({ request, at: Date.now() });
                  }}
                />
                <ResultsPanel stats={stats} slug={slug} brand={config.brand} share={share} shareStats={shareStats} token={shareToken} />
              </>
            )}
            {tab === "okonomi" && <EconomyPanel economy={economy} />}
            {tab === "feedback" && <FeedbackPanel slug={slug} token={reviewToken} preview={preview} />}
            {tab === "del" && (
              <SharePanel
                config={config}
                edit={edit}
                slug={slug}
                title={config.title}
                published={published}
                onCloudflare={onCloudflare}
                size={embed}
                setSize={(s) => {
                  setEmbed(s);
                  setDevice("site");
                }}
              />
            )}
            {tab === "start" && <StartEditor config={config} edit={edit} slug={slug} preview={preview} />}
            {tab === "rundvisning" && <GuideEditor config={config} edit={edit} preview={preview} />}
            {tab === "scan" && <ScanPointsEditor config={config} edit={edit} preview={preview} map={scanMap} mpskinsHidden={mpskinsHidden} expected={scanCount} />}
            {tab === "tags" && <TagsEditor config={config} edit={edit} slug={slug} preview={preview} />}
            {tab === "live" && <LiveDataEditor config={config} edit={edit} slug={slug} preview={preview} />}
            {tab === "kortet" && <MapEditor config={config} edit={edit} />}
            {tab === "sprog" && (
              <LanguagesPanel slug={slug} config={config} edit={edit} showIn={(lang) => frame.current?.contentWindow?.postMessage({ type: "tour-lang", lang }, location.origin)} />
            )}
            {tab === "kort" && <CardsEditor config={config} edit={edit} preview={preview} />}
            {tab === "menu" && (
              <>
                <MenuEditor
                  menu={config.menu}
                  preview={preview}
                  overview={Boolean(config.drone || config.map)}
                  onChange={(menu) => edit((d) => void (d.menu = menu))}
                  imageView={config.imageView}
                  onImageView={(src, z) =>
                    edit((d) => {
                      const all = { ...d.imageView };
                      if (z) all[src] = z;
                      else delete all[src];
                      d.imageView = Object.keys(all).length ? all : undefined;
                    })}
                />
                <ScanJumper config={config} preview={preview} map={scanMap} count={scanCount} hiddenSweeps={[...config.hiddenSweeps, ...mpskinsHidden]} />
              </>
            )}

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
                <Group title="Zoom">
                  <p className="px-1 text-[12px] leading-snug text-[#8e8e93]">Hvor meget af rummet man ser. Telefonen står på højkant og viser mindre i bredden - zoom lidt ud dér, så man kan se rummet.</p>
                  {(["desktop", "mobile"] as const).map((k) => {
                    const v = config.zoom?.[k] ?? (k === "mobile" && config.mobileZoomLock ? 0.5 : 1);
                    return (
                      <Field key={k} title={`${k === "desktop" ? "Computer" : "Mobil"}: ${zoomLabel(v)}`}>
                        <div className="flex items-center gap-2 text-[12px] text-[#8e8e93]">
                          <span>Ud</span>
                          <input
                            type="range"
                            min={0.5}
                            max={2}
                            step={0.05}
                            className="flex-1 accent-[#0071e3]"
                            value={v}
                            onPointerDown={() => setDevice(k === "desktop" ? "computer" : "mobil")}
                            onFocus={() => setDevice(k === "desktop" ? "computer" : "mobil")}
                            onChange={(e) =>
                              edit((d) => {
                                const n = Number(e.target.value);
                                d.zoom = { ...d.zoom, [k]: n === 1 ? undefined : n };
                                if (d.zoom.desktop == null && d.zoom.mobile == null) d.zoom = undefined;
                              })
                            }
                          />
                          <span>Ind</span>
                        </div>
                      </Field>
                    );
                  })}
                  <Toggle on={Boolean(config.mobileZoomLock)} onChange={(on) => edit((d) => void (d.mobileZoomLock = on || undefined))} title="Lås zoom på mobil" hint="Gæsten kan ikke knibe-zoome - så man ikke ved et uheld zoomer helt ind." />
                </Group>
                <Group title="Menu og historier">
                  <Toggle on={config.menuOpenOnStart.desktop} onChange={(on) => edit((d) => void (d.menuOpenOnStart.desktop = on))} title="Menu åben på computer" />
                  <Toggle on={config.menuOpenOnStart.mobile} onChange={(on) => edit((d) => void (d.menuOpenOnStart.mobile = on))} title="Menu åben på mobil" />
                  <Toggle
                    on={config.menuDim !== false}
                    onChange={(on) => edit((d) => void (d.menuDim = on ? undefined : false))}
                    title="Dæmp touren bag menuen"
                    hint="Touren bliver lidt mørkere, når menuen er åben, og et tryk på den lukker menuen. Fra: touren står klar og kan bruges, mens menuen er åben."
                  />
                <Toggle
                  on={Boolean(config.stories?.mobile)}
                  onChange={(on) => edit((d) => void (d.stories = { mobile: on, desktop: d.stories?.desktop ?? false, rooms: d.stories?.rooms, scroll: d.stories?.scroll }))}
                  title="Historier på mobil"
                  hint="Rummene som kort nederst, som Instagram-stories."
                />
                <Toggle
                  on={Boolean(config.stories?.desktop)}
                  onChange={(on) => edit((d) => void (d.stories = { mobile: d.stories?.mobile ?? false, desktop: on, rooms: d.stories?.rooms, scroll: d.stories?.scroll }))}
                  title="Historier på computer"
                />
                {(config.stories?.mobile || config.stories?.desktop) && (
                  <Field title="Scroll sidelæns i historierne" hint="Fra: alle historierne vises på én gang, fordelt på flere rækker.">
                    <Choice
                      value={config.stories?.scroll?.mobile === false ? (config.stories?.scroll?.desktop === false ? "ingen" : "computer") : config.stories?.scroll?.desktop === false ? "mobil" : "begge"}
                      options={[
                        ["begge", "Begge"],
                        ["mobil", "Kun mobil"],
                        ["computer", "Kun computer"],
                        ["ingen", "Ingen"],
                      ]}
                      onChange={(v) =>
                        edit((d) => {
                          const scroll = { ...(v === "computer" || v === "ingen" ? { mobile: false as const } : {}), ...(v === "mobil" || v === "ingen" ? { desktop: false as const } : {}) };
                          d.stories = { ...d.stories!, scroll: Object.keys(scroll).length ? scroll : undefined };
                        })
                      }
                    />
                  </Field>
                )}
                </Group>
                <Group title="Ekstra">
                <Toggle
                  on={config.autoplay !== false}
                  onChange={(on) => edit((d) => void (on ? delete d.autoplay : (d.autoplay = false)))}
                  title="Start af sig selv på hjemmesider"
                  hint="Slået fra: på en hjemmeside viser touren et billede med en stor afspil-knap (som MPSkins). Intet hentes, før man trykker - og så åbner touren i fuld skærm (på en telefon i sin egen fane). Åbnes touren via sit eget link, starter den altid med det samme."
                />
                <Toggle
                  on={Boolean(config.onboarding)}
                  onChange={(on) => edit((d) => void (d.onboarding = on || undefined))}
                  title="Hjælp, når man går ind"
                  hint='En kort "Sådan går du rundt", når man trykker Træd indenfor: træk for at kigge, tryk på cirklerne for at gå, menuen for at hoppe - og Vis mig rundt, hvis touren har den. Vises én gang pr. besøgende (i forhåndsvisningen hver gang).'
                />
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
                  <LinksOpenEditor config={config} edit={edit} />
                </Group>
                <Group title="Knapper">
                <CtaEditor cta={config.cta} live={Boolean(config.live)} form={Boolean(config.contactForm)} onChange={(cta) => edit((d) => void (d.cta = cta))} />
                </Group>
                <Group title="Kontakt">
                <p className="px-1 text-[12px] leading-snug text-[#8e8e93]">Vises nederst i menuen. Udfyld kun det, kunden vil have vist.</p>
                {(
                  [
                    ["phone", "Telefon", "Fx 75 75 75 84", "tel"],
                    ["email", "E-mail", "Fx info@kunde.dk", "email"],
                    ["address", "Adresse", "Fx Egelykkevej 2, 9310 Vodskov", "text"],
                  ] as const
                ).map(([k, text, example, type]) => (
                  <Field key={k} title={text} hint={k === "address" ? "Bliver et link, der åbner adressen i Google Maps." : undefined}>
                    <input
                      type={type}
                      className={input}
                      placeholder={example}
                      value={config.contact?.[k] ?? ""}
                      onChange={(e) => edit((d) => void (d.contact = { ...d.contact, [k]: e.target.value || undefined }))}
                      onBlur={(e) => k === "phone" && e.target.value && edit((d) => void (d.contact = { ...d.contact, phone: formatPhone(e.target.value) }))}
                    />
                  </Field>
                ))}
                <Field title="Sociale medier" hint="Vises som ikoner nederst i menuen. Udfyld linket til dem, kunden vil have vist.">
                  <div className="space-y-1.5">
                    {SOCIALS.map((so) => {
                      // The old single Instagram field shows (and is moved over) here.
                      const value = config.contact?.social?.[so.kind] ?? (so.kind === "instagram" ? config.contact?.instagram : undefined) ?? "";
                      const setSocial = (v: string | undefined) =>
                        edit((d) => {
                          const social = { ...d.contact?.social, [so.kind]: v };
                          if (!v) delete social[so.kind];
                          const next = { ...d.contact, social: Object.keys(social).length ? social : undefined };
                          if (so.kind === "instagram") delete next.instagram;
                          d.contact = next;
                        });
                      return (
                        <label key={so.kind} className="flex items-center gap-2">
                          <span className={`flex h-9 w-9 flex-none items-center justify-center rounded-lg ${value ? "text-[#1d1d1f]" : "text-[#c7c7cc]"}`} title={so.name}>
                            <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6" dangerouslySetInnerHTML={{ __html: so.icon }} />
                          </span>
                          <input
                            type="url"
                            className={input}
                            placeholder={`${so.name} - fx ${so.example}`}
                            value={value}
                            onChange={(e) => setSocial(e.target.value || undefined)}
                            onBlur={(e) => e.target.value && setSocial(withProtocol(e.target.value))}
                          />
                        </label>
                      );
                    })}
                  </div>
                </Field>
                {config.contact?.mapUrl && (
                  <Field title="Eget kort-link" hint="Bruges i stedet for Google Maps-linket. Tøm feltet for at bruge adressen.">
                    <input className={input} value={config.contact.mapUrl} onChange={(e) => edit((d) => void (d.contact = { ...d.contact, mapUrl: e.target.value || undefined }))} onBlur={(e) => e.target.value && edit((d) => void (d.contact = { ...d.contact, mapUrl: withProtocol(e.target.value) }))} />
                  </Field>
                )}
                </Group>
                <Group title="Kontaktformular i touren">
                  <Toggle
                    on={Boolean(config.contactForm)}
                    onChange={(on) => edit((d) => void (d.contactForm = on ? { to: d.contact?.email ?? "" } : undefined))}
                    title='"Skriv til os" inde i touren'
                    hint="Gæsten skriver navn, e-mail, telefon og besked i touren. Når de trykker, åbner deres eget mailprogram med mailen færdigskrevet til kunden - de trykker Send, og mailen går direkte fra gæst til kunde. Intet går gennem os. Knappen kommer i kontaktboksen; linket #kontakt kan også bruges i menuen og på knapper."
                  />
                  {config.contactForm && (
                    <>
                      <Field title="Mailen skrives til" hint="Kundens e-mail - gæsten ser den i sit mailprogram.">
                        <input type="email" className={input} placeholder="Fx info@kunde.dk" value={config.contactForm.to} onChange={(e) => edit((d) => void (d.contactForm = { ...d.contactForm!, to: e.target.value.trim() }))} />
                      </Field>
                      <Field title="Overskrift">
                        <input className={input} placeholder="Skriv til os" value={config.contactForm.title ?? ""} onChange={(e) => edit((d) => void (d.contactForm = { ...d.contactForm!, title: e.target.value || undefined }))} />
                      </Field>
                      <Field title="Kort tekst (valgfri)">
                        <input className={input} placeholder="Fx Vi svarer inden for en dag." value={config.contactForm.lead ?? ""} onChange={(e) => edit((d) => void (d.contactForm = { ...d.contactForm!, lead: e.target.value || undefined }))} />
                      </Field>
                      <Toggle on={config.contactForm.phone !== false} onChange={(on) => edit((d) => void (d.contactForm = { ...d.contactForm!, phone: on ? undefined : false }))} title="Felt til telefonnummer" />
                      {!config.menu.some((m) => ("items" in m ? m.items.some((i) => i[1] === "#kontakt") : m.href === "#kontakt")) && (
                        <button type="button" onClick={() => edit((d) => void d.menu.push({ title: d.contactForm?.title || "Skriv til os", href: "#kontakt" }))} className="w-full rounded-xl bg-white py-2 text-[14px] font-medium text-[#0071e3] ring-1 ring-black/[.06] hover:bg-[#0071e3]/5">
                          + Læg &quot;Skriv til os&quot; i menuen
                        </button>
                      )}
                      <p className="px-1 text-[12px] leading-snug text-[#8e8e93]">I forhåndsvisningen kan formularen prøves, men mailprogrammet åbnes ikke.</p>
                    </>
                  )}
                </Group>
              </>
            )}

            {tab === "avanceret" && (
              <>
                <Group title="Eget design (CSS)">
                  <p className="text-[12px] leading-snug text-[#8e8e93]">Til det, felterne ikke dækker - fx runde former eller en helt bestemt stil. Lettest: bed nextviewAI om det (&quot;gør knapperne runde og giv menuen glas-effekt&quot;), så skrives det her.</p>
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
            <button type="button" onClick={openBig} className="flex items-center gap-1 rounded-full px-3 py-1 text-[13px] text-[#0071e3] hover:bg-[#0071e3]/10" title="Se forhåndsvisningen i stor skærm">
              <Icon d='<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>' className="h-3.5 w-3.5" />
              Stor skærm
            </button>
          </div>
          {big && <div className="fixed inset-0 z-[59] bg-black" onClick={closeBig} aria-hidden />}
          {/* The same element grows to fill the screen - the tour isn't reloaded, it stays where it is. */}
          <div ref={bigBox} className={big ? "fixed inset-0 z-[60] flex items-center justify-center bg-black" : "flex min-h-0 flex-1 items-center justify-center"}>
            {big && (
              <button
                type="button"
                onClick={closeBig}
                className={`absolute left-1/2 top-1 z-10 flex -translate-x-1/2 transition-opacity duration-500 ${bigHint ? "opacity-100" : "pointer-events-none opacity-0"} items-center gap-1.5 rounded-full bg-[#1d1d1f] px-3 py-1 text-[12px] font-medium text-white shadow-lg`}
              >
                Luk stor skærm <span className="text-[#8e8e93]">Esc</span>
              </button>
            )}
            {device === "site" ? (
              <SitePreview config={config} size={embed} width={siteWidth}>
                <iframe ref={frame} key={previewKey} title="Forhåndsvisning" src={`/arpo/tour-lab/${slug}`} className="h-full w-full bg-black" allow="fullscreen; xr-spatial-tracking; autoplay; clipboard-write" />
              </SitePreview>
            ) : (
              // Computer and phone share one frame, so switching between them (or grabbing a zoom slider) only changes the
              // frame around the tour - the tour itself isn't reloaded and stays where it is.
              <DeviceFrame phone={device === "mobil"} big={big} address={tourUrl(slug, "").replace(/^https?:\/\//, "") || `/t/${slug}`}>
                <iframe ref={frame} key={previewKey} title="Forhåndsvisning" src={`/arpo/tour-lab/${slug}`} className="h-full w-full bg-black" allow="fullscreen; xr-spatial-tracking; autoplay; clipboard-write" />
              </DeviceFrame>
            )}
          </div>

        </div>
      </div>
      </SafeArea>
    </div>
    </FilesContext.Provider>
  );
}

type ChatMsg = { role: "user" | "assistant"; text: string; images?: string[]; error?: boolean; changed?: number; before?: TourConfig; undone?: boolean; remembered?: string[] };

/** A picture made small enough to send to nextviewAI (longest side 1600 px, JPEG) - as a data URL. */
function shrinkImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      const g = c.getContext("2d")!;
      g.fillStyle = "#fff";
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Billedet kunne ikke læses."));
    };
    img.src = url;
  });
}

const SUGGESTIONS = ["Gør det helt enkelt - få store knapper og én menu", "Tilføj en knap til booking", "Gør farverne mørkere og mere eksklusive", "Ryd op i menuen, så den er nemmere at overskue"];

/**
 * Claude in the editor: write what should change, Claude makes the edit, and
 * the preview shows it at once - nothing is saved until "Gem", and each
 * answer can be undone on its own.
 */
function ClaudePanel({
  ask,
  config,
  chat,
  setChat,
  ready: initiallyReady,
  onApply,
}: {
  /** A request from elsewhere in the editor (a suggestion from Resultater) - sent as if typed. */
  ask?: { request: string; at: number } | null;
  config: TourConfig;
  chat: ChatMsg[];
  setChat: React.Dispatch<React.SetStateAction<ChatMsg[]>>;
  ready: boolean;
  onApply: (c: TourConfig) => void;
}) {
  const [ready, setReady] = useState(initiallyReady);
  const [text, setText] = useState("");
  /** Pictures to send with the next message (pasted, dropped or picked). */
  const [images, setImages] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  async function addImages(files: Iterable<File>) {
    const pics = [...files].filter((f) => f.type.startsWith("image/"));
    if (!pics.length) return;
    const made = await Promise.all(pics.map((f) => shrinkImage(f).catch(() => null)));
    setImages((now) => [...now, ...made.filter((x): x is string => Boolean(x))].slice(0, 4));
  }
  const [key, setKey] = useState("");
  const [keyError, setKeyError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [learned, setLearned] = useState(0);
  const end = useRef<HTMLDivElement>(null);
  // A block body on purpose: newer Chrome returns a promise from scrollIntoView, and an effect must return nothing (or a cleanup).
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chat.length, pending]);

  function send(request: string) {
    const pics = images;
    const ask = request.trim() || (pics.length ? "Se billedet" : "");
    if (!ask || pending) return;
    const history: ChatTurn[] = chat
      .filter((m) => !m.error)
      .map((m) => ({ role: m.role, text: m.images?.length ? `${m.text}\n(${m.images.length === 1 ? "sendte et billede" : `sendte ${m.images.length} billeder`})` : m.text }));
    setChat((c) => [...c, { role: "user", text: ask, images: pics.length ? pics : undefined }]);
    setText("");
    setImages([]);
    const before = config;
    start(async () => {
      const r = await askClaudeForTour(config, history, ask, pics).catch((err: unknown) => ({ ok: false as const, error: `Kunne ikke nå nextviewAI (${err instanceof Error ? err.message : err}) - prøv igen.` }));
      if (!r.ok) {
        // A revoked/changed key: ask for the new one right here.
        if (r.error.startsWith("nextviewAI-nøglen")) setReady(false);
        return setChat((c) => [...c, { role: "assistant", text: r.error, error: true }]);
      }
      if (r.changed) onApply(r.config);
      if (r.remembered.length) setLearned((n) => n + 1);
      setChat((c) => [...c, { role: "assistant", text: r.reply, changed: r.changed, before: r.changed ? before : undefined, remembered: r.remembered }]);
    });
  }

  // A suggestion from Resultater: sent once, as if typed (after the render, so not from inside the effect itself).
  const asked = useRef(0);
  useEffect(() => {
    if (!ask || asked.current === ask.at) return;
    asked.current = ask.at;
    requestAnimationFrame(() => send(ask.request));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ask]);

  if (!ready)
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#d97757] text-white">
          <Icon d={SPARK} className="h-6 w-6" />
        </span>
        <h2 className="text-[17px] font-semibold">{initiallyReady ? "nextviewAI-nøglen virker ikke længere" : "Sæt nextviewAI op"}</h2>
        <p className="mt-1 text-[13px] leading-snug text-[#6e6e73]">Indsæt en API-nøgle fra Anthropic. Den gemmes i Arpo, så alle admins kan bruge nextviewAI i editoren.</p>
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
            <div key={i} className="flex flex-col items-end gap-1.5">
              {m.images && (
                <div className="flex max-w-[85%] flex-wrap justify-end gap-1.5">
                  {m.images.map((src, j) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={j} src={src} alt="" className="h-24 rounded-xl object-cover ring-1 ring-black/[.06]" />
                  ))}
                </div>
              )}
              <p className="max-w-[85%] whitespace-pre-wrap rounded-[18px] bg-[#e9e9eb] px-3.5 py-2 text-[14px] leading-snug">{m.text}</p>
            </div>
          ) : (
            <div key={i} className="flex gap-2.5">
              <span className={`mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full text-white ${m.error ? "bg-[#ff3b30]" : "bg-[#d97757]"}`}>
                <Icon d={m.error ? '<path d="M12 8v5M12 16h.01"/>' : SPARK} className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className={`whitespace-pre-wrap text-[14px] leading-relaxed ${m.error ? "text-[#ff3b30]" : ""}`}>{m.text}</p>
                {m.remembered?.map((t) => (
                  <p key={t} className="mt-1 text-[12px] leading-snug text-[#8e8e93]">
                    Husker nu: {t}
                  </p>
                ))}
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
      <AiMemoryPanel slug={config.slug} refresh={learned} />
      <form
        className={`mx-2 mb-3 rounded-[22px] bg-white p-2 shadow-[0_2px_12px_rgba(0,0,0,.06)] ring-1 focus-within:ring-black/20 ${dragging ? "ring-2 ring-[#0071e3]" : "ring-black/[.08]"}`}
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
        onDragOver={(e) => {
          if (![...e.dataTransfer.items].some((it) => it.type.startsWith("image/"))) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          if (!e.dataTransfer.files.length) return;
          e.preventDefault();
          setDragging(false);
          addImages(e.dataTransfer.files);
        }}
      >
        {images.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-1 pb-1.5 pt-0.5">
            {images.map((src, i) => (
              <span key={i} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="h-14 w-14 rounded-lg object-cover ring-1 ring-black/[.08]" />
                <button
                  type="button"
                  aria-label="Fjern billedet"
                  onClick={() => setImages((now) => now.filter((_, j) => j !== i))}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#1d1d1f] text-[12px] leading-none text-white"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <textarea
          value={text}
          rows={2}
          onPaste={(e) => {
            const files = [...e.clipboardData.files].filter((f) => f.type.startsWith("image/"));
            if (!files.length) return;
            e.preventDefault();
            addImages(files);
          }}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(text);
            }
          }}
          placeholder="Beskriv en ændring… (indsæt eller træk et billede ind)"
          className="block w-full resize-none border-0 bg-transparent px-2 py-1 text-[15px] placeholder:text-[#8e8e93] focus:outline-none focus:ring-0"
        />
        <div className="flex items-center justify-between gap-2 px-1">
          <button
            type="button"
            title="Send et billede med (fx et skærmbillede)"
            aria-label="Vedhæft billede"
            disabled={images.length >= 4}
            onClick={() => fileInput.current?.click()}
            className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-[#6e6e73] hover:bg-[#f2f2f7] disabled:opacity-40"
          >
            <Icon d='<rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/>' className="h-[18px] w-[18px]" />
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) addImages(e.target.files);
              e.target.value = "";
            }}
          />
          <span className="flex-1 text-[11px] text-[#8e8e93]">nextviewAI kan tage fejl - tjek forhåndsvisningen.</span>
          <button type="submit" disabled={pending || (!text.trim() && !images.length)} aria-label="Send" className="flex h-8 w-8 items-center justify-center rounded-full bg-[#d97757] text-white transition hover:bg-[#c96442] disabled:bg-[#e9e9eb] disabled:text-[#8e8e93]">
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
/** The browser window (computer) or the phone around the preview - the same elements either way, so the tour inside stays loaded. */
function DeviceFrame({ phone, big, address, children }: { phone: boolean; big: boolean; address: string; children: React.ReactNode }) {
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
      <div style={phone ? { width: (PHONE.w + 2 * PHONE.bezel) * scale, height: (PHONE.h + 2 * PHONE.bezel) * scale } : { width: "100%", height: "100%" }}>
        <div
          className={
            phone
              ? "relative origin-top-left rounded-[58px] bg-[#1d1d1f] shadow-[0_30px_60px_rgba(0,0,0,.3)]"
              : `flex h-full w-full flex-col overflow-hidden bg-white ${big ? "" : "rounded-xl shadow-[0_20px_50px_rgba(0,0,0,.15)] ring-1 ring-black/10"}`
          }
          style={phone ? { width: PHONE.w + 2 * PHONE.bezel, height: PHONE.h + 2 * PHONE.bezel, padding: PHONE.bezel, transform: `scale(${scale})` } : undefined}
        >
          {phone ? (
            <span key="notch" className="absolute left-1/2 top-[23px] z-10 h-[34px] w-[124px] -translate-x-1/2 rounded-full bg-black" />
          ) : (
            <div key="bar" className={`${big ? "hidden" : "flex"} items-center gap-1.5 border-b border-black/[.06] bg-[#f6f6f6] px-3 py-2`}>
              <i className="h-3 w-3 rounded-full bg-[#ff5f57]" />
              <i className="h-3 w-3 rounded-full bg-[#febc2e]" />
              <i className="h-3 w-3 rounded-full bg-[#28c840]" />
              <span className="mx-auto rounded-md bg-white px-3 py-0.5 text-[11px] text-[#8e8e93] ring-1 ring-black/[.06]">{address}</span>
            </div>
          )}
          {/* One tree for both, so switching device never reloads the tour. On a phone, as in Safari on an iPhone: the page starts below the status bar - nothing hides behind the island. */}
          <div key="screen" className={phone ? "flex h-full w-full flex-col overflow-hidden rounded-[46px] bg-black" : "flex min-h-0 w-full flex-1 flex-col bg-black"}>
            <div className={phone ? "flex h-[54px] flex-none items-center justify-between px-9 pt-1 text-[15px] font-semibold text-white" : "hidden"}>
              <span>9:41</span>
              <span className="flex items-center gap-1.5">
                <svg viewBox="0 0 18 12" className="h-3 w-[18px] fill-white" aria-hidden>
                  <rect x="0" y="8" width="3" height="4" rx="1" />
                  <rect x="5" y="5.5" width="3" height="6.5" rx="1" />
                  <rect x="10" y="3" width="3" height="9" rx="1" />
                  <rect x="15" y="0" width="3" height="12" rx="1" />
                </svg>
                <svg viewBox="0 0 27 13" className="h-3 w-[27px]" aria-hidden>
                  <rect x=".5" y=".5" width="23" height="12" rx="3.5" fill="none" stroke="white" opacity=".5" />
                  <rect x="2" y="2" width="18" height="9" rx="2" fill="white" />
                  <rect x="25" y="4.5" width="1.5" height="4" rx=".75" fill="white" opacity=".5" />
                </svg>
              </span>
            </div>
            <div className="min-h-0 flex-1">{children}</div>
          </div>
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

/** "Hent fra hjemmesiden": the customer's own favicon, from the site the tour's main button leads to (or one typed in). */
function SiteFavicon({ slug, config, onDone }: { slug: string; config: TourConfig; onDone: (url: string) => void }) {
  const guess = (() => {
    const href = [...config.cta.filter((c) => c.primary), ...config.cta].map((c) => c.href).find((h) => /^https?:\/\//.test(h) && !/matterport|nextview360|google\.|instagram|facebook/.test(h));
    try {
      return href ? new URL(href).origin : "";
    } catch {
      return "";
    }
  })();
  const [site, setSite] = useState(guess);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2">
      <input className={`${input} min-w-0 flex-1 text-[13px]`} value={site} onChange={(e) => setSite(e.target.value)} placeholder="kunden.dk" />
      <button
        type="button"
        disabled={pending || !site.trim()}
        className="flex-none rounded-xl bg-white px-3 py-2 text-[13px] font-medium text-[#0071e3] ring-1 ring-black/[.06] hover:bg-[#0071e3]/5 disabled:opacity-50"
        onClick={() =>
          start(async () => {
            setMsg(null);
            const r = await fetchSiteFavicon(slug, site);
            if (r.ok) onDone(r.url);
            setMsg(r.ok ? "Hentet ✓ - husk Gem" : r.error);
          })
        }
      >
        {pending ? "Henter…" : "Hent fra hjemmesiden"}
      </button>
      {msg && <span className="w-full px-1 text-[12px] text-[#8e8e93]">{msg}</span>}
    </div>
  );
}

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
                router.replace(`/arpo/tour-lab/${r.slug}/rediger`);
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

/** A tour still running on an MPSkins page: one click moves it onto Matterport alone. */
function DetachMpskins({ slug, dirty }: { slug: string; dirty: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2 rounded-xl bg-[#ff9500]/10 p-3">
      <p className="text-[13px] leading-snug text-[#a05a00]">Touren henter stadig sine scanpunkter fra MPSkins. Flyt den over, så den kun bruger Matterport - links, skjulte punkter og farvefilter kommer med.</p>
      <button
        type="button"
        disabled={pending || dirty}
        title={dirty ? "Gem dine ændringer først" : undefined}
        className="w-full rounded-xl bg-[#1d1d1f] py-2 text-[14px] font-medium text-white disabled:opacity-40"
        onClick={() =>
          start(async () => {
            const r = await detachToursFromMpskins(slug);
            if (!r.ok) return setError(r.error);
            if (r.failed.length) return setError(r.failed.join("; "));
            window.location.reload();
          })
        }
      >
        {pending ? "Flytter…" : "Frakobl MPSkins"}
      </button>
      {error && <p className="text-[12px] text-[#ff3b30]">{error}</p>}
    </div>
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
          <Link href={`/arpo/deals/${deal.id}`} className="font-medium text-[#0071e3] hover:underline">
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

type Kind = "sted" | "web" | "luft" | "billede";
// No target yet (e.g. a menu item nextviewAI made, or just switched to "Et sted i touren") counts as a place waiting to be picked - not a web page.
// A point on the drone scene / map ("#punkt:<id>") counts as the overview too: it opens the point there.
const kindOf = (href: string): Kind => (href === "#luften" || pointOfHref(href) ? "luft" : href.startsWith(IMAGE_HREF) ? "billede" : !href || isPlaceHref(href) ? "sted" : "web");
function whereText(href: string) {
  const kind = kindOf(href);
  if (!href) return "Mangler et mål";
  if (kind === "luft") return pointOfHref(href) ? "Et punkt på kortet / luftfotoet" : "Tilbage til luftfotoet";
  if (kind === "billede") return imageOfHref(href) ? "Viser et billede" : "Mangler et billede";
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
  billede: ["bg-[#af52de]", '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="M21 16l-5-5-8 8"/>'],
  luft: ["bg-[#5ac8fa]", '<path d="M3 14l4-1 4-7 2 1-2 6 5-1 2-3h2l-1 4 1 4h-2l-2-3-5-1 2 6-2 1-4-7-4-1z"/>'],
  group: ["bg-[#ff9500]", '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'],
};


/**
 * The menu as one list - like a phone's settings or a web shop's navigation
 * editor: drag rows to reorder (onto a group's header to put them in it),
 * click a row to edit it, and add places by walking to them in the preview.
 */
function MenuEditor({
  menu,
  onChange,
  preview,
  overview = false,
  imageView,
  onImageView,
}: {
  menu: MenuEntry[];
  onChange: (m: MenuEntry[]) => void;
  preview: PreviewApi;
  /** The tour starts on a drone picture / map - a menu item can lead back to it. */
  overview?: boolean;
  /** How zoomed each 360° picture opens (by its address). */
  imageView?: TourConfig["imageView"];
  onImageView: (src: string, view: NonNullable<TourConfig["imageView"]>[string] | undefined) => void;
}) {
  const [open, setOpen] = useState<Addr | null>(null);
  const [drag, setDrag] = useState<Addr | null>(null);
  const [over, setOver] = useState<Addr | "end" | null>(null);
  /** The row whose handle is held - only it can be dragged. */
  const [armed, setArmed] = useState<Addr | null>(null);
  useEffect(() => {
    if (!armed) return;
    const off = () => setArmed(null);
    window.addEventListener("pointerup", off);
    return () => window.removeEventListener("pointerup", off);
  }, [armed]);
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

  // A row moves only when picked up by its handle (⋮⋮) - dragging a slider or a 360° picture inside it never moves the menu.
  const rowProps = (a: Addr) => ({
    draggable: same(armed, a),
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.effectAllowed = "move";
      setDrag(a);
    },
    onDragEnd: () => {
      setDrag(null);
      setOver(null);
      setArmed(null);
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
          <span className="cursor-grab text-[#c7c7cc] active:cursor-grabbing" title="Træk for at flytte" onPointerDown={() => setArmed(a)} onClick={(e) => e.stopPropagation()}>
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
                  value={kindOf(it.href ?? "")}
                  options={[
                    ["sted", "Sted i touren"],
                    ["billede", "Billede"],
                    ...(overview || kindOf(it.href ?? "") === "luft" ? ([["luft", "Luftfotoet"]] as [string, string][]) : []),
                    ["web", "Webside"],
                  ]}
                  onChange={(v) => set(a, { href: v === "web" ? "https://" : v === "billede" ? IMAGE_HREF : v === "luft" ? "#luften" : "" })}
                />
                {kindOf(it.href ?? "") === "luft" ? (
                  <p className="mt-2 text-[12px] leading-snug text-[#8e8e93]">Fører tilbage til luftfotoet / kortet, touren starter på.</p>
                ) : kindOf(it.href ?? "") === "billede" ? (
                  <div className="mt-2 space-y-2">
                    {imageOfHref(it.href ?? "") && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imageOfHref(it.href ?? "")!} alt="" className="max-h-32 w-full rounded-lg object-cover ring-1 ring-black/[.06]" />
                    )}
                    <UploadButton accept="image/*" label={imageOfHref(it.href ?? "") ? "Skift billede" : "Upload billede"} onDone={(url) => set(a, { href: IMAGE_HREF + url })} />
                    <p className="text-[12px] leading-snug text-[#8e8e93]">Vises i fuld skærm i touren - fx et dronefoto, et situationskort eller en plantegning. Et 360°-billede (2:1) åbner som 360°.</p>
                    {imageOfHref(it.href ?? "") && (
                      <PanoZoom src={imageOfHref(it.href ?? "")!} name={it.title} preview={preview} value={imageView?.[imageOfHref(it.href ?? "")!]} onChange={(z) => onImageView(imageOfHref(it.href ?? "")!, z)} />
                    )}
                  </div>
                ) : kindOf(it.href ?? "") === "web" ? (
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
        <div className="grid grid-cols-3 gap-2">
          <button type="button" onClick={() => add("Ny side", "https://")} className="rounded-xl bg-white py-2 text-[14px] font-medium text-[#0071e3] ring-1 ring-black/[.06] hover:bg-[#0071e3]/5">
            + Webside
          </button>
          <button type="button" onClick={() => add("Nyt billede", IMAGE_HREF)} className="rounded-xl bg-white py-2 text-[14px] font-medium text-[#0071e3] ring-1 ring-black/[.06] hover:bg-[#0071e3]/5">
            + Billede
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

function CtaEditor({ cta, live, form, onChange }: { cta: TourConfig["cta"]; live: boolean; form: boolean; onChange: (c: TourConfig["cta"]) => void }) {
  const set = (i: number, patch: Partial<TourConfig["cta"][number]>) => onChange(cta.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  type To = "web" | "live" | "form";
  const toOf = (href: string): To => (href === "#live" ? "live" : href === "#kontakt" ? "form" : "web");
  const options: [To, string][] = [["web", "Webside"], ...(live ? [["live", "Live data"] as [To, string]] : []), ...(form ? [["form", "Kontaktformular"] as [To, string]] : [])];
  return (
    <Field title="Knapper (fx Book, Kontakt)">
      <div className="space-y-2">
        {cta.map((c, i) => {
          const to = toOf(c.href);
          return (
            <div key={i} className="space-y-1.5 rounded-xl bg-[#f2f2f7]/60 p-2.5">
              <div className="flex gap-1.5">
                <input className={input} value={c.label} placeholder="Tekst" onChange={(e) => set(i, { label: e.target.value })} />
                <button type="button" className="text-[#c7c7cc] hover:text-[#ff3b30]" onClick={() => onChange(cta.filter((_, j) => j !== i))} aria-label="Slet">
                  ×
                </button>
              </div>
              {(options.length > 1 || to !== "web") && (
                <Choice<To> value={to} options={options.some(([v]) => v === to) ? options : [...options, [to, to === "live" ? "Live data" : "Kontaktformular"]]} onChange={(v) => set(i, { href: v === "live" ? "#live" : v === "form" ? "#kontakt" : "" })} />
              )}
              {to === "web" ? (
                <input className={input} value={c.href} placeholder="https://…" onChange={(e) => set(i, { href: e.target.value })} onBlur={(e) => e.target.value && set(i, { href: withProtocol(e.target.value) })} />
              ) : (
                <p className="px-1 text-[12px] leading-snug text-[#8e8e93]">{to === "live" ? "Åbner listen med de ledige (Live data) inde i touren." : "Åbner kontaktformularen inde i touren."}</p>
              )}
              <label className="flex items-center gap-2 text-[13px] text-[#1d1d1f]">
                <input type="checkbox" className="accent-[#0071e3]" checked={c.primary} onChange={(e) => set(i, { primary: e.target.checked })} />
                Hovedknap (fremhævet)
              </label>
            </div>
          );
        })}
        <button type="button" className="text-sm font-medium text-[#0071e3]" onClick={() => onChange([...cta, { label: "Ny knap", href: "", primary: cta.length === 0 }])}>
          + Knap
        </button>
      </div>
    </Field>
  );
}

/**
 * Under the menu: every scan point as a number to click - the preview jumps
 * straight there, also to points you can't walk to (another floor, a closed
 * door). Then "Tilføj det sted, du ser" adds it to the menu.
 */
function ScanJumper({ config, preview, map, count, hiddenSweeps }: { config: TourConfig; preview: PreviewApi; map: ScanMap | null; count: number | null; hiddenSweeps: string[] }) {
  const hidden = new Set(hiddenSweeps);
  const inMenu = new Set(
    config.menu
      .flatMap((m) => ("items" in m ? m.items.map((i) => i[1]) : [m.href]))
      .map(ssOfHref)
      .filter((n): n is number => n != null)
  );
  // The points Matterport told us about, by floor - or just 1..n when it didn't send the map.
  const floors = map?.points.length
    ? map.floors
        .map((f, i) => ({ name: f.name, points: map.points.filter((p) => p.floor === i).sort((a, b) => a.ss - b.ss).map((p) => ({ ss: p.ss, hidden: hidden.has(p.sid) })) }))
        .filter((f) => f.points.length)
    : count
      ? [{ name: "", points: Array.from({ length: count }, (_, i) => ({ ss: i + 1, hidden: false })) }]
      : [];
  if (!floors.length) return null;
  const total = floors.reduce((n, f) => n + f.points.length, 0);
  return (
    <Group title={`Alle scanpunkter (${total})`}>
      <p className="px-1 text-[12px] leading-snug text-[#8e8e93]">Klik på et nummer for at hoppe dertil i forhåndsvisningen - også til punkter, man ikke kan gå hen til. Tryk så &quot;Tilføj det sted, du ser&quot; ovenfor.</p>
      {floors.map((f) => (
        <div key={f.name || "alle"} className="space-y-1.5">
          {floors.length > 1 && <p className="px-1 text-[12px] font-semibold text-[#6e6e73]">{f.name}</p>}
          <div className="flex flex-wrap gap-1.5">
            {f.points.map((p) => (
              <button
                key={p.ss}
                type="button"
                title={p.hidden ? `Punkt ${p.ss} (skjult i touren)` : inMenu.has(p.ss) ? `Punkt ${p.ss} (i menuen)` : `Punkt ${p.ss}`}
                onClick={() => preview.go(`Punkt ${p.ss}`, placeHref(config, p.ss))}
                className={`h-8 min-w-8 rounded-full px-2 text-[12px] font-semibold tabular-nums transition ${
                  p.hidden
                    ? "border border-dashed border-[#c7c7cc] text-[#8e8e93] hover:border-[#0071e3]"
                    : inMenu.has(p.ss)
                      ? "bg-[#34c759] text-white hover:brightness-95"
                      : "bg-[#f2f2f7] text-[#3a3a3c] hover:bg-[#0071e3] hover:text-white"
                }`}
              >
                {p.ss}
              </button>
            ))}
          </div>
        </div>
      ))}
      <p className="flex gap-3 px-1 text-[11px] text-[#8e8e93]">
        <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-[#34c759]" />I menuen</span>
        <span><i className="mr-1 inline-block h-2 w-2 rounded-full border border-dashed border-[#c7c7cc]" />Skjult</span>
      </p>
    </Group>
  );
}
