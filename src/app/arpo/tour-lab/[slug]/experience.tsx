"use client";

import { LANG_CSS, LangSwitch } from "./lang-switch";
import { danishOf, LANGUAGES, localize, makeT, tourLanguages } from "../tours/i18n";
import { TourLang, useT } from "../tours/i18n-react";
import { socialLinks } from "../tours/social";
import { allGuides, cssFilter, droneViewsOfHref, formatPhone, GUIDE_HREF, guideOfHref, guideSetup, isDroneHref, guideExit, imageOfHref, isInTourHref, isPlaceHref, placeHref, panoHfov, placeSlug, pointOfHref, startPlaces, withoutDeadAerialLinks } from "../tours/places";
import type { LiveUnit } from "@/lib/availability/live";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import { saveTourStoryImage, storyImagesSaved } from "@/lib/actions/tour-lab";
import { connectSdk, showcaseUrl, uLinkTarget, type CameraPose, type MpSdk, type Rotation, type SweepInfo, type Vec3 } from "../matterport";
import type { AvailableUnit } from "@/lib/availability/boxdepotet";
import { WeatherChip, WEATHER_CSS } from "./weather";
import { CommuteSheet, COMMUTE_CSS } from "./commute";
import { FeatureTour, featuresSeen, FEATURES_CSS } from "./features";
import { FinderSheet, FINDER_CSS, WalkLines } from "./finder";
import { apiUrl, isStaticTour } from "../tours/api";
import type { DroneView, GuideTurn, MenuEntry, TourConfig, TourPlace, TourPoint, WelcomeGo } from "../tours/types";
import { CoverWelcome, DESIGNS_CSS, DockMenu, PickerMenu } from "./designs";
import { GUIDE_CSS, GuidePlayer, guideStops } from "./guide";
import { ONBOARDING_CSS, Onboarding } from "./onboarding";
import { MENU_HINT_CSS, MenuHint } from "./menu-hint";
import { PlayGate } from "./play-gate";
import { FULLSCREEN_CSS, FullscreenOnUse } from "./fullscreen-on-use";
import { CONTACT_CSS, CONTACT_HREF, ContactForm } from "./contact-form";
import { DAY_CSS, DayBar, DaySheet } from "./day";
import { FEEDBACK_CSS, FeedbackLayer } from "./feedback";
import { ICONS } from "../tours/icons";
import { SIMPLE_CSS, SimpleMenu, SimpleWelcome } from "./simple";
import { BENTO_CSS, BentoMenu } from "./bento";
import { INFO_CSS, InfoDots, usePlaceInfo } from "./info";
import { MAP_CSS, MapScene, type MapApi } from "./map";
import { CARDS_CSS, NudgeCard, PlaceCard } from "./cards";
import { MEASURES_CSS, MeasureShield } from "./measures";
import { ROUTE_CSS, RouteLine, RouteSheet, RouteStatus, flightMs, routeNetwork, shortestPath, straighten, type Destination, type RouteGraph } from "./wayfinding";
import { LINKS_CSS, LinkPopup, LinkProvider, TourLink, openLink, popupSize, prefetchFrames, prefetchLinks, siteOf, type LinkPopupState } from "./links";
import { Stories, STORIES_CSS, storyJpeg, type StoryRoom } from "./stories";
import { LIGHTBOX_CSS, Lightbox, type LightboxState } from "./lightbox";
import "pannellum/build/pannellum.css";

/* ---------------------------------------------------------------------------
 * Pannellum (the drone scene) - the same viewer and tile format the drone
 * pages use today.
 * ------------------------------------------------------------------------- */
type PannellumViewer = {
  lookAt(pitch: number, yaw: number, hfov: number, ms: number, cb?: () => void): void;
  getHfov(): number;
  getPitch(): number;
  getYaw(): number;
  destroy(): void;
  on(event: string, cb: (...a: unknown[]) => void): void;
};
type PannellumHotspot = {
  id: string;
  pitch: number;
  yaw: number;
  cssClass: string;
  createTooltipFunc: (el: HTMLElement) => void;
};
declare global {
  interface Window {
    pannellum?: { viewer(el: HTMLElement | string, cfg: Record<string, unknown>): PannellumViewer };
  }
}

/** The tour is the editor's live preview: in a frame on Arpo's own tour editor (a customer's site is another address, and reading it throws). */
function inEditorPreview(): boolean {
  if (window.parent === window) return false;
  try {
    return window.parent.location.origin === window.location.origin && /\/tour-lab\/[^/]+\/rediger/.test(window.parent.location.pathname);
  } catch {
    return false;
  }
}

/**
 * A 360° map (an uploaded equirectangular photo) is shown as the drone scene:
 * the engine gets a `drone` with the photo, and every point placed on the flat
 * picture gets its direction (x % → around, y % → up/down). The setup itself
 * keeps the map, so the editor still places points on the flat picture.
 */
function asScene(T: TourConfig): TourConfig {
  const M = T.map;
  if (!M?.panorama || !M.image) return T;
  const dir = (x: number, y: number) => ({ yaw: (x / 100) * 360 - 180, pitch: 90 - (y / 100) * 180 });
  const view = (s: { x: number; y: number; zoom: number } | undefined, phone: boolean) => {
    const d = dir(s?.x ?? 50, s?.y ?? 50);
    return { ...d, hfov: panoHfov(phone, s?.zoom) };
  };
  return {
    ...T,
    map: undefined,
    drone: {
      panorama: M.image,
      basePath: "",
      maxLevel: 0,
      cubeResolution: 0,
      start: view(M.start, false),
      startMobile: view(M.startMobile ?? M.start, true),
      intro: M.intro ?? { title: T.brand || T.title, lead: "Tryk på et sted for at se mere - eller gå direkte ind." },
      backLabel: M.backLabel ?? "Tilbage til 360°-billedet",
      filterTitle: M.filterTitle ?? "Vis",
    },
    // Only the points placed on the picture are on it.
    points: T.points.filter((p) => M.spots[p.id]).map((p) => ({ ...p, ...dir(M.spots[p.id][0], M.spots[p.id][1]) })),
  };
}

/** Bundled with Arpo (npm "pannellum"), not fetched from a CDN - the tour shouldn't depend on one. */
async function loadPannellum(): Promise<void> {
  if (window.pannellum) return;
  // The build is a plain script that sets window.pannellum.
  await import("pannellum/build/pannellum.js");
}

/* ---------------------------------------------------------------------------
 * Measurement: every interaction in the tour becomes an event, counted by
 * Arpo itself (/api/tour-events) and shown in the editor preview's event log.
 * ------------------------------------------------------------------------- */
type TrackedEvent = { name: string; params: Record<string, string | number>; at: number };
const eventLog: TrackedEvent[] = [];
const logListeners = new Set<() => void>();

/** The tour being measured (set when the tour mounts). */
const tracking = { slug: "", session: "", off: false, inArpo: false, used: false, queue: [] as { name: string; label?: string; url?: string; value?: number }[], timer: 0, da: (s: string) => s };

/** Sends the waiting events to Arpo's own measurement (/api/tour-events) - also when the page is closed. */
function flushEvents() {
  window.clearTimeout(tracking.timer);
  tracking.timer = 0;
  if (!tracking.queue.length || !tracking.slug) return;
  const body = JSON.stringify({ tour: tracking.slug, session: tracking.session, device: matchMedia("(max-width: 760px)").matches ? "mobil" : "computer", events: tracking.queue.splice(0, 50) });
  // As plain text: from a published tour on another address that's a "simple" request a browser sends without asking first.
  if (!navigator.sendBeacon?.(apiUrl("/api/tour-events"), new Blob([body], { type: "text/plain" }))) {
    fetch(apiUrl("/api/tour-events"), { method: "POST", body, keepalive: true }).catch(() => {});
  }
}

/** The visitor did something in the tour (once per visit) - see "tour_use" where the tour mounts. */
function markUsed() {
  if (tracking.used) return;
  tracking.used = true;
  track("tour_use");
}

function track(name: string, params: Record<string, string | number> = {}) {
  const full = { tour: tracking.slug, ...params };
  // Arpo's own count - not from Arpo's own previews (the editor's, the share page's); a customer's site showing it in a frame counts.
  if (tracking.slug && !tracking.off && !tracking.inArpo) {
    const label = params.label ?? params.item_name ?? params.place_name ?? params.point_name ?? params.room_name ?? params.kind ?? params.title ?? params.name;
    // A number that matters, kept with the event: the seconds spent in a room.
    // …or the stop of "Vis mig rundt" it happened at.
    // …or how long the tour took to be ready / to go in (tenths of a second - Health shows how fast the tours are for real visitors).
    const ms = typeof params.load_ms === "number" ? params.load_ms : typeof params.enter_ms === "number" ? params.enter_ms : null;
    const value = typeof params.seconds === "number" ? Math.round(params.seconds) : typeof params.stop === "number" ? params.stop : ms != null ? Math.min(3600, Math.round(ms / 100)) : undefined;
    tracking.queue.push({ name, label: label != null ? tracking.da(String(label)) : undefined, url: params.link_url != null ? String(params.link_url) : params.guide != null ? String(params.guide) : undefined, value });
    if (name === "cta_click" || name === "contact_click") flushEvents(); // the visitor may be leaving
    else tracking.timer ||= window.setTimeout(flushEvents, 4000);
  }
  eventLog.unshift({ name, params: full, at: Date.now() });
  eventLog.length = Math.min(eventLog.length, 30);
  logListeners.forEach((l) => l());
}

/* ---------------------------------------------------------------------------
 * Icons (from the drone page) and small helpers.
 * ------------------------------------------------------------------------- */


const now = () => performance.now();
type Point = TourPoint;

/** All menu destinations by their scan point, so a room can be named (and returned to). */
function roomIndex(menu: MenuEntry[]) {
  const names: Record<number, string> = {};
  const links: Record<number, string> = {};
  for (const m of menu) {
    const entries: [string, string][] = "items" in m ? m.items : [[m.title, m.href]];
    for (const [name, href] of entries) {
      const t = uLinkTarget(href);
      if (t && names[t.ss] == null) {
        names[t.ss] = name;
        links[t.ss] = href;
      }
    }
  }
  return { names, links };
}

/** For smart start links: ?rum=spisesalen / ?punkt=hal. */
const slug = placeSlug;

type Box = { left: number; right: number; top: number; bottom: number };
const overlaps = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/**
 * Keeps the names from covering another point's icon or a name already
 * shown - the open point first, then in setup order. A name always stands
 * under its icon; one that would be in the way is hidden (it shows when its
 * icon is hovered). A hidden one needs a little room to spare before it shows
 * again, so a name on the edge doesn't blink on and off as the view moves.
 * With names set to "Altid" nothing is hidden.
 */
function declutterNames(selected: string | null) {
  const root = document.querySelector(".hv");
  const phone = window.innerWidth <= 760;
  const always = phone ? Boolean(root?.classList.contains("hv-navne-m-always")) : !root?.classList.contains("hv-navne-d-zoom") && !root?.classList.contains("hv-navne-d-never");
  const points = [...document.querySelectorAll<HTMLElement>(".hv-hs[data-punkt]:not(.hv-skjult)")].filter((el) => el.style.visibility !== "hidden");
  points.sort((a, b) => Number(b.dataset.punkt === selected) - Number(a.dataset.punkt === selected));
  const icons = points.map((el) => el.querySelector(".hv-ikon")?.getBoundingClientRect());
  const shown: Box[] = [];
  const grow = (r: DOMRect, m: number): Box => ({ left: r.left - m, right: r.right + m, top: r.top - m, bottom: r.bottom + m });
  points.forEach((el, i) => {
    const name = el.querySelector<HTMLElement>(".hv-navn");
    if (!name) return;
    const box = name.getBoundingClientRect();
    if (!box.width) return;
    const wasHidden = name.classList.contains("hv-gemt");
    const b = grow(box, wasHidden ? 6 : 0);
    const free = !icons.some((icon, j) => j !== i && icon && icon.width && overlaps(b, icon)) && !shown.some((s) => overlaps(b, s));
    if (free || always) shown.push(box);
    name.classList.toggle("hv-gemt", !free && !always);
  });
}

function readLastRoom(key: string): { name: string; href: string } | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
}

type ExperienceProps = {
  tour: TourConfig;
  sdkKey: string | null;
  modelId: string | null;
  sweepBySs: Record<number, string>;
  hiddenSweeps: string[];
  /** Room name -> picture URL for the story cards. */
  storyImages: Record<string, string>;
  /** The model's scan-point network, for "Find vej". */
  routeGraph: RouteGraph | null;
  /** Rooms available right now (live), for the room picker. */
  units: AvailableUnit[];
  /** The visitor is on a phone (from the request) - for the mobile zoom lock. */
  phone: boolean;
  /** Arpo's own view: the prototype tools (status, event log, copy view …). Never in the public tour. */
  tools?: boolean;
  /** Kundegennemsyn: the review link's token - the tour gets "Giv feedback", and isn't counted as visits. */
  review?: string;
  /** The language asked for in the link (?sprog=en) - see i18n.ts. */
  lang?: string;
  /** The visitor's country (from the request, e.g. "DE") - a guess at their language when the browser's isn't in the tour. */
  country?: string;
};

/** A country's language, for the languages a tour can have. */
const COUNTRY_LANG: Record<string, string> = {
  DK: "da", GL: "da", FO: "da",
  DE: "de", AT: "de", CH: "de", LI: "de",
  SE: "sv", NO: "nb", NL: "nl", BE: "nl", FR: "fr", LU: "fr", MC: "fr", ES: "es", IT: "it", SM: "it", PL: "pl",
  GB: "en", IE: "en", US: "en", CA: "en", AU: "en", NZ: "en",
};

/** The parts of a setup the tour only reads when it starts - a change to them starts the preview over. */
const startSignature = (T: TourConfig) =>
  JSON.stringify([T.navigation, T.menuOpenOnStart, T.design, Boolean(T.welcome), Boolean(T.cover), Boolean(T.map), Boolean(T.drone), T.intro, T.start, T.matterportParams, T.mobileZoomLock, T.matterportUi, T.modelId, T.tourPage]);

/**
 * The tour. As the editor's live preview it takes the editor's unsaved draft
 * (see the bridge in TourExperience): most changes show at once, and a change
 * to how the tour starts restarts it with the draft.
 */
export function Experience(props: ExperienceProps) {
  const [draft, setDraft] = useState<TourConfig | null>(null);
  useEffect(() => {
    if (window.parent === window) return;
    const onMessage = (e: MessageEvent) => {
      if (e.origin === location.origin && e.source === window.parent && e.data?.type === "tour-draft") {
        const next = e.data.config as TourConfig;
        // Only a real change is a new setup: the same draft again (the editor sends it each time the tour says it's ready)
        // must not give the tour a new setup object - that would reconnect Matterport and loop forever.
        setDraft((prev) => {
          const same = JSON.stringify(next);
          return same === JSON.stringify(prev ?? props.tour) ? prev : next;
        });
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [props.tour]);
  const T = draft ?? props.tour;
  // The language: the link's (?sprog=), else the visitor's own when the tour has it, else Danish. The editor's preview is told by the editor.
  const langs = tourLanguages(T);
  const [lang, setLang] = useState(props.lang && langs.includes(props.lang) ? props.lang : "da");
  // The language by itself, also where the tour sits in a customer's page (not in the editor's preview, which the editor steers):
  // the link's ?sprog=, else the one the visitor picked before, else their browser's (a Dane in Germany keeps Danish),
  // else their country's (from where they are), else English, else Danish.
  useEffect(() => {
    if (inEditorPreview()) return;
    const asked = new URLSearchParams(location.search).get("sprog");
    let picked: string | null = null;
    try {
      picked = localStorage.getItem("tour-lang");
    } catch {}
    const browser = navigator.languages.map((l) => l.slice(0, 2).toLowerCase().replace(/^(no|nn)$/, "nb")).find((l) => langs.includes(l));
    const country = props.country ? COUNTRY_LANG[props.country.toUpperCase()] : undefined;
    // Many set their browser to English whatever they speak: then the country counts first.
    const order = browser === "en" ? [asked, picked, country, browser] : [asked, picked, browser, country, "en"];
    const pick = order.find((l): l is string => Boolean(l) && langs.includes(l!)) ?? "da";
    if (pick !== lang) requestAnimationFrame(() => setLang(pick));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [langs.join()]);
  /** The visitor picks a language: used, and remembered for the next tour they open. */
  const pickLang = (l: string) => {
    try {
      localStorage.setItem("tour-lang", l);
    } catch {}
    setLang(l);
  };
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin === location.origin && e.source === window.parent && e.data?.type === "tour-lang") setLang(String(e.data.lang));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  // The play button (autoplay off): only where the tour sits in someone's page (or the editor's preview) - opened on its own, it just starts.
  const embedded = useSyncExternalStore(
    noop,
    () => window.parent !== window && !new URLSearchParams(location.search).has("afspil"),
    () => true
  );
  const [played, setPlayed] = useState(false);
  // A phone (not the editor's own preview): full screen from a play button, unless the tour is set to run in the frame.
  const phoneGate = useSyncExternalStore(
    noop,
    () => window.innerWidth <= 760 && !inEditorPreview(),
    () => false
  );
  if ((T.autoplay === false || (phoneGate && T.phoneEmbed === "play")) && embedded && !played) return <PlayGate T={T} isPreview={inEditorPreview} onPlay={() => setPlayed(true)} />;
  // On a phone in someone's page (the standard): it loads in the frame, and goes full screen at the first tap.
  const fullOnUse = phoneGate && embedded && !T.phoneEmbed && T.autoplay !== false;
  return (
    <>
      <TourExperience key={startSignature(T)} {...props} tour={T} lang={langs.includes(lang) ? lang : "da"} setLang={pickLang} played={played} />
      {fullOnUse && (
        <>
          <style>{FULLSCREEN_CSS}</style>
          <FullscreenOnUse />
        </>
      )}
    </>
  );
}

const noop = () => () => {};

function TourExperience({
  tour: savedTour,
  sdkKey,
  modelId,
  sweepBySs,
  hiddenSweeps,
  storyImages,
  routeGraph,
  units: givenUnits,
  phone,
  tools = false,
  review,
  lang = "da",
  setLang,
  played = false,
}: ExperienceProps & { setLang?: (lang: string) => void; /** Started from the play button - that was the front page, so the cover isn't shown again. */ played?: boolean }) {
  // The setup in the visitor's language; names that reach outside it (statistics, ?rum=, pictures) stay Danish.
  const T = useMemo(() => withoutDeadAerialLinks(asScene(localize(savedTour, lang))), [savedTour, lang]);
  const tx = useMemo(() => makeT(savedTour, lang), [savedTour, lang]);
  const da = useMemo(() => danishOf(savedTour, lang), [savedTour, lang]);
  /** What the start ran with: only a change to how the tour starts runs it again (not a new language, nor an edit in the editor - a colour, a text). */
  const startRan = useRef<string | null>(null);
  const startKey = JSON.stringify([savedTour.slug, savedTour.start, savedTour.intro, savedTour.design?.welcome, Boolean(savedTour.welcome), Boolean(savedTour.cover), Boolean(savedTour.drone || savedTour.map), savedTour.menuOpenOnStart]);
  useLayoutEffect(() => {
    tracking.da = da;
  }, [da]);
  useLayoutEffect(() => {
    // One visit = one id per browser tab and tour.
    const key = `tour-session:${savedTour.slug}`;
    try {
      tracking.session = sessionStorage.getItem(key) ?? crypto.randomUUID().slice(0, 18);
      sessionStorage.setItem(key, tracking.session);
    } catch {
      tracking.session = Math.random().toString(36).slice(2, 14);
    }
    tracking.slug = savedTour.slug;
    tracking.off = Boolean(review); // the customer's review isn't a visit
    // In a frame: on Arpo's own pages (a preview) - or on a site showing the tour ("Her er touren vist").
    const from = (() => {
      try {
        return document.referrer ? new URL(document.referrer) : null;
      } catch {
        return null;
      }
    })();
    const arpo = isStaticTour() ? new URL(apiUrl("/"), location.href).origin : location.origin;
    const framed = window.parent !== window;
    tracking.inArpo = framed && from?.origin === arpo;
    track("tour_open", { label: from ? from.hostname : "direkte" });
    // The page it's shown on - without anything after "?" or "#" (it may hold someone's details).
    if (framed && !tracking.inArpo) track("tour_embed", { label: from?.hostname ?? "ukendt side", ...(from && /^https?:$/.test(from.protocol) ? { link_url: `${from.origin}${from.pathname}` } : {}) });
    const leave = () => flushEvents();
    window.addEventListener("pagehide", leave);
    // A tour on a page starts by itself (e.g. on the front page) - loading it isn't a visit. "tour_seen": at least half of it
    // was on the screen for a second (in a frame the browser measures it against the page's own window).
    let seenTimer = 0;
    const seen = framed && !tracking.inArpo && "IntersectionObserver" in window
      ? new IntersectionObserver(
          ([e]) => {
            window.clearTimeout(seenTimer);
            if (e?.isIntersecting && e.intersectionRatio >= 0.5)
              seenTimer = window.setTimeout(() => {
                track("tour_seen");
                seen?.disconnect();
              }, 1000);
          },
          { threshold: [0, 0.5, 1] }
        )
      : null;
    seen?.observe(document.documentElement);
    // "tour_use": the visitor did something in it - a tap, a drag, a key, a scroll in the tour, or a click into the 3D view
    // (Matterport's own frame takes the focus then). Once per visit.
    const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    tracking.used = false;
    const used = () => {
      markUsed();
      events.forEach((ev) => window.removeEventListener(ev, used, true));
      window.removeEventListener("blur", blurred);
    };
    const blurred = () => setTimeout(() => document.activeElement?.tagName === "IFRAME" && document.hasFocus() && used(), 0);
    events.forEach((ev) => window.addEventListener(ev, used, { capture: true, passive: true }));
    window.addEventListener("blur", blurred);
    return () => {
      flushEvents();
      window.removeEventListener("pagehide", leave);
      seen?.disconnect();
      window.clearTimeout(seenTimer);
      events.forEach((ev) => window.removeEventListener(ev, used, true));
      window.removeEventListener("blur", blurred);
    };
  }, [savedTour.slug]);
  // Rooms are known by their Danish names (Matterport and statistics); `roomShown` is the name in the visitor's language.
  const { names: ROOM_NAMES, links: ROOM_LINKS } = useMemo(() => roomIndex([...savedTour.menu, ...(savedTour.places ? [{ title: "", items: savedTour.places.map((p): [string, string] => [p.name, p.href]) }] : [])]), [savedTour]);
  const LAST_ROOM_KEY = `${T.slug}-last-room`;
  /** "Sådan går du rundt" seen (remembered per visitor - not in the editor's preview, where it's shown each time to try it). */
  const [helpDone, setHelpDone] = useState(() => {
    if (typeof window === "undefined" || inEditorPreview()) return false;
    try {
      return localStorage.getItem(`${T.slug}-hjaelp`) === "1";
    } catch {
      return false;
    }
  });
  const doneHelp = useCallback(() => {
    setHelpDone(true);
    if (inEditorPreview()) return;
    try {
      localStorage.setItem(`${T.slug}-hjaelp`, "1");
    } catch {}
  }, [T.slug]);
  /** The rooms of "Historier": the ones the setup names, otherwise every room in the menu. */
  const storyRooms = useMemo<StoryRoom[]>(() => {
    const all = T.menu
      .flatMap((m) => ("items" in m ? m.items : [[m.title, m.href] as [string, string]]))
      .filter(([, href]) => isPlaceHref(href));
    const unique = all.filter(([name], i) => all.findIndex(([n]) => n === name) === i);
    const picked = T.stories?.rooms ? T.stories.rooms.map((r) => unique.find(([n]) => n === r)).filter((x): x is [string, string] => Boolean(x)) : unique;
    return picked.map(([name, href]) => ({ name, href, image: storyImages[da(name)] }));
  }, [T, storyImages, da]);
  const droneEl = useRef<HTMLDivElement>(null);
  /** The flat map, when the tour starts on one instead of the 360° drone scene. */
  const mapApi = useRef<MapApi | null>(null);
  const drone = useRef<PannellumViewer | null>(null);
  const iframe = useRef<HTMLIFrameElement>(null);
  /** The picture of the old view that fades away over the new one (jump: "fade"). */
  const crossfade = useRef<HTMLImageElement>(null);
  const sdkRef = useRef<Promise<MpSdk> | null>(null);
  /** All scan points of the model, and the one the visitor stands on. */
  const allSweeps = useRef<string[]>([]);
  /** Every scan point's place in the viewer (to face the way when walking a route). */
  const sweepData = useRef<Record<string, SweepInfo>>({});
  /** When the tour last moved the view itself (a move it asked for) - a step to another scan point long after is the visitor's. */
  const selfMoveAt = useRef(-Infinity);
  /** Scan points switched off in Matterport that a move opened (closed again when the visitor leaves them). */
  const openedSweeps = useRef(new Set<string>());
  const currentSweep = useRef<string | null>(null);
  const roomTimer = useRef<{ name: string | null; at: number } | null>(null);
  /** "Kun punkter": no free walking - only the current scan point is enabled, the menu and points move you. */
  const [pointsOnly, setPointsOnly] = useState(T.navigation === "points");
  const pointsOnlyRef = useRef(pointsOnly);
  /** The overview the tour starts on: the drone scene, or an interactive map on its own (its words fall back to sensible ones). */
  const OV = T.drone
    ? { intro: T.map?.intro ?? T.drone.intro, backLabel: T.map?.backLabel ?? T.drone.backLabel, filterTitle: T.map?.filterTitle ?? T.drone.filterTitle }
    : T.map
      ? { intro: T.map.intro ?? { title: T.brand, lead: tx("Tryk på et sted for at se mere - eller gå direkte ind.") }, backLabel: T.map.backLabel ?? tx("Tilbage til kortet"), filterTitle: T.map.filterTitle ?? tx("Vis") }
      : null;
  const [phase, setPhase] = useState<"drone" | "tour">(OV ? "drone" : "tour");
  const [selected, setSelected] = useState<Point | null>(null);
  /** The open point whose whole text is shown (on a phone it's cut short). */
  const [textOpenFor, setTextOpenFor] = useState<string | null>(null);
  /** "Find din plads": the questions are open - and what they found (the best place and the next best). */
  const [finderOpen, setFinderOpen] = useState(false);
  const [finderPick, setFinderPick] = useState<{ best: string; others: string[] } | null>(null);
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [menuOpen, setMenuOpen] = useState(false);
  /** Zoomed in on the drone picture: room for the point names on a phone. */
  const [zoomed, setZoomed] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [tourReadyMs, setTourReadyMs] = useState<number | null>(null);
  /** Shown in the editor's preview - not just any frame (a customer's site shows the tour in one too). False on the server, so the first render matches. */
  const inPreview = useSyncExternalStore(
    () => () => {},
    inEditorPreview,
    () => false
  );
  const [tourError, setTourError] = useState<string | null>(null);
  const [entering, setEntering] = useState(false);
  const [room, setRoom] = useState<string | null>(null);
  const roomShown = room ? tx(room) : null;
  const [showLog, setShowLog] = useState(false);
  const [pano, setPano] = useState<Point | null>(null);
  /** The tour's contact form ("Skriv til os") is open. */
  const [contactOpen, setContactOpen] = useState(false);
  // Any link "#kontakt" (a button, a card, the nudge) opens it.
  useEffect(() => {
    const open = () => setContactOpen(true);
    window.addEventListener("hv-kontakt", open);
    return () => window.removeEventListener("hv-kontakt", open);
  }, []);
  // A button or link to a place in the tour (written with @ in the editor): there, as if picked in the menu.
  const goToRef = useRef<(href: string, label: string) => void>(() => {});
  useEffect(() => {
    const go = (e: Event) => {
      const d = (e as CustomEvent<{ href: string; label: string }>).detail;
      if (d?.href) goToRef.current(d.href, d.label ?? "");
    };
    window.addEventListener("hv-gaa-til", go);
    return () => window.removeEventListener("hv-gaa-til", go);
  }, []);
  // Any link "#dag" opens "Sådan ser en dag ud" (also when its button isn't in the menu).
  const openDayRef = useRef<(from: string) => void>(() => {});
  useEffect(() => {
    const open = () => openDayRef.current("link");
    window.addEventListener("hv-dag", open);
    return () => window.removeEventListener("hv-dag", open);
  }, []);
  /** The other ones stop when one starts (stories, Vis mig rundt, Find vej) - kept current for the listeners below. */
  const closeRouteRef = useRef<() => void>(() => {});
  const closeGuideRef = useRef<(completed: boolean) => void>(() => {});
  /** On the review link, the first time: "Det kan jeres tour" - the tour's smart features, each with a little animation. */
  const [featuresOpen, setFeaturesOpen] = useState(false);
  useEffect(() => {
    if (!review) return;
    const t = window.setTimeout(() => !featuresSeen(T.slug) && setFeaturesOpen(true), 900);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the review link opens
  }, []);
  /** "Vej til skolen" is open - from any link "#vej". */
  const [commuteOpen, setCommuteOpen] = useState(false);
  useEffect(() => {
    const open = () => setCommuteOpen(true);
    window.addEventListener("hv-vej", open);
    return () => window.removeEventListener("hv-vej", open);
  }, []);
  // Any link "#find" opens "Find din plads" - on the drone scene / map, where the places are.
  const openFinderRef = useRef<() => void>(() => {});
  useEffect(() => {
    const open = () => openFinderRef.current();
    window.addEventListener("hv-find", open);
    return () => window.removeEventListener("hv-find", open);
  }, []);
  // Any link "#rundvisning" / "#rundvisning:<id>" (a button, a tile, the dock) starts that guided tour.
  const startGuideRef = useRef<(from: string, id: string | null) => void>(() => {});
  useEffect(() => {
    const start = (e: Event) => startGuideRef.current("link", ((e as CustomEvent).detail as string | null) ?? null);
    window.addEventListener("hv-rundvisning", start);
    return () => window.removeEventListener("hv-rundvisning", start);
  }, []);
  /** A point has a 360° photo to open: an uploaded picture, or prepared tiles (with the tour's panos). */
  const hasPano = (p: Point) => Boolean(p.panorama || (p.pano && T.panos));
  /** Pictures full screen: a place's photos, or the site plan (zoomed in on a point). */
  const [lightbox, setLightbox] = useState<LightboxState>(null);
  /** "Vis mig rundt" at a picture stop (e.g. a drone photo): the picture, full screen under the guide's card. */
  const [guideImage, setGuideImage] = useState<string | null>(null);
  const openPlan = (p?: Point) => {
    if (!T.sitePlan) return;
    track("plan_open", { label: p?.name ?? "menu" });
    setLightbox({ images: [T.sitePlan.image], at: 0, title: p?.name ?? T.sitePlan.label.replace(/^Se (på )?/i, "").replace(/^./, (c) => c.toUpperCase()), focus: p?.planBox });
  };
  /** The welcome tiles - skipped when the link already says where to go. */
  const [welcome, setWelcome] = useState(false);
  /** The tour opens on the cover welcome: it's there from the very first picture (no flash of the drone scene before it). */
  const startsCovered = T.design?.welcome === "cover" && Boolean(T.cover) && !T.intro && !played;
  const [cover, setCover] = useState(startsCovered);
  /** "Træd indenfor" pressed before the tour was ready: the cover stays until it is. */
  const [coverWaiting, setCoverWaiting] = useState(false);
  const coverWaitingRef = useRef(false);
  /** The connected viewer, once it's playing (for the parts that follow the camera). */
  const [sdk, setSdk] = useState<MpSdk | null>(null);
  /** The scan point (ss) the visitor stands on. */
  const [currentSs, setCurrentSs] = useState<number | null>(null);
  const currentSsRef = useRef<number | null>(null);
  /** "Vis mig rundt": the stop it's at, or null when the visitor walks on their own. */
  const [guideAt, setGuideAt] = useState<number | null>(null);
  /** The visitor took over during "Vis mig rundt" (walked on or looked around) - the guide waits for them. */
  const [guideHeld, setGuideHeld] = useState(false);
  /** The guide itself is moving the view right now - not the visitor. */
  const guideMoving = useRef(false);
  /** The guide's moves, one after the other - and the newest asked for (only that one is flown to). */
  const guideQueue = useRef<Promise<unknown>>(Promise.resolve());
  const guideTicket = useRef(0);
  /**
   * Every press in "Vis mig rundt" (and every step it takes by itself) gets a
   * number - work started for an older step (getting the next room ready,
   * going in from the drone scene) checks it's still the newest before it
   * moves the tour. The rest is read by those late callbacks through refs.
   */
  const guideStep = useRef(0);
  /** Matterport is moving between two scan points right now (the visitor's own step, or ours). */
  const sweepMoving = useRef(false);
  const guideAtRef = useRef<number | null>(null);
  const guideHeldRef = useRef(false);
  const phaseRef = useRef(phase);
  const enteringRef = useRef(false);
  /*
   * Before Matterport is ready, a tap on a tile, a menu place, "Vis mig rundt",
   * Find vej or a story doesn't run straight away (it would race the tour still
   * loading, and several taps would all run at once when it's there): only the
   * LAST thing asked for is kept, "Gør touren klar …" shows, and it runs once the
   * tour is ready - one thing, never two on top of each other.
   */
  const sdkReadyRef = useRef(false);
  /** menuGo, for running it later (held until the tour is ready). */
  const menuGoRef = useRef<((name: string, group: string, href: string) => Promise<unknown>) | null>(null);
  const heldRef = useRef<{ run: () => void; done: () => void } | null>(null);
  const [holding, setHolding] = useState(false);
  const tourReady = () => sdkReadyRef.current || !sdkKey || !modelId;
  function holdUntilReady(run: () => void): Promise<void> {
    // A new choice replaces the one waiting (it never runs).
    heldRef.current?.done();
    return new Promise<void>((done) => {
      heldRef.current = { run, done };
      setHolding(true);
    });
  }
  function releaseHeld() {
    const held = heldRef.current;
    if (!held) return setHolding(false);
    // Still stepping in from the drone scene: wait for that first, so the two don't cross.
    if (enteringRef.current) return void setTimeout(releaseHeld, 200);
    heldRef.current = null;
    setHolding(false);
    held.run();
    held.done();
  }
  useEffect(() => {
    guideAtRef.current = guideAt;
    guideHeldRef.current = guideHeld;
    phaseRef.current = phase;
  });
  const [dayOpen, setDayOpen] = useState(false);
  const [dayAt, setDayAt] = useState<number | null>(null);
  /** Place cards closed for good (by index), and the "comes by itself" card. */
  const [closedCards, setClosedCards] = useState<number[]>([]);
  const [nudgeOn, setNudgeOn] = useState(false);
  const [nudgeRound, setNudgeRound] = useState(0);
  /** "Find vej": the picker, and the walk in progress. */
  const [routeOpen, setRouteOpen] = useState(false);
  /** The saved measurements shown over the tour ("Vis mål"). */
  const [showMeasures, setShowMeasures] = useState(false);
  // The measurements are Matterport's own, shown in its measuring mode (its buttons stay hidden).
  useEffect(() => {
    if (!T.measure || !sdk?.Measurements) return;
    sdk.Measurements.toggleMode(showMeasures && phase === "tour").catch((err) => console.warn("Measurements", err));
  }, [sdk, showMeasures, phase, T.measure]);
  const [route, setRoute] = useState<{ dest: Destination; step: number; steps: number; arrived: boolean; paused?: boolean } | null>(null);
  // Any link "#findvej" opens Find vej's picker (e.g. from the menu, when its button isn't shown) - and when the stories start,
  // a guided tour or a Find vej walk in progress stops: never two at once.
  useEffect(() => {
    const open = () => setRouteOpen(true);
    const storiesStart = () => {
      closeRouteRef.current();
      closeGuideRef.current(false);
    };
    window.addEventListener("hv-findvej", open);
    window.addEventListener("hv-story-start", storiesStart);
    return () => {
      window.removeEventListener("hv-findvej", open);
      window.removeEventListener("hv-story-start", storiesStart);
    };
  }, []);
  const routeRun = useRef(0);
  /** The route still ahead, drawn on the floor. */
  const [routeLine, setRouteLine] = useState<Vec3[]>([]);
  /** Which guided tour runs (or ran last): null = the main one ("Vis mig rundt"), else one of `guides` by id. */
  const [guideId, setGuideId] = useState<string | null>(null);
  const guideIdRef = useRef<string | null>(null);
  const GUIDE = useMemo(() => guideStops(T, guideId), [T, guideId]);
  /** Its settings (seconds, turn, manual …). */
  const G = guideSetup(T, guideId);
  /** The guided tours there are - the menu offers a choice when there's more than one. */
  const GUIDES = useMemo(() => allGuides(T), [T]);
  /** Kept with its events, so Resultater can tell the guided tours apart. */
  const guideKey = () => (guideIdRef.current ? `${GUIDE_HREF}:${guideIdRef.current}` : GUIDE_HREF);
  /** guideGo as of the newest render - after switching guided tour, the one that knows its stops (see startGuide). */
  const guideGoRef = useRef<(i: number) => void>(() => {});
  const primaryCta = T.cta.find((c) => c.primary);
  const [linkPopup, setLinkPopup] = useState<LinkPopupState>(null);
  // Every link set to open in a popup is checked ahead (can its page be shown here?) - those that can't open in a new tab.
  useEffect(() => prefetchFrames(T), [T]);
  const popup = (href: string, label: string) => {
    track("link_popup", { label, link_url: href });
    setLinkPopup({ href, label });
  };
  /** The intro film: playing, fading out into the tour, or gone. */
  const [intro, setIntro] = useState<"play" | "fade" | null>(T.intro ? "play" : null);
  const [lastRoom, setLastRoom] = useState<{ name: string; href: string } | null>(null);
  const [, rerender] = useState(0);
  const mobile = useRef(false);
  /** The open point, for the name-declutter loop (which runs outside React). */
  const selectedId = useRef<string | null>(null);

  useEffect(() => {
    const l = () => rerender((n) => n + 1);
    logListeners.add(l);
    return () => void logListeners.delete(l);
  }, []);

  /*
   * The room names and links are read through refs: a new menu item in the
   * editor changes them, and that must not connect to Matterport again (which
   * jumps back to the start) - the names just apply from the next step.
   */
  const roomNamesRef = useRef(ROOM_NAMES);
  const roomLinksRef = useRef(ROOM_LINKS);
  useEffect(() => {
    roomNamesRef.current = ROOM_NAMES;
    roomLinksRef.current = ROOM_LINKS;
  });

  /* ----- The tour: loaded in the background from the start, behind the drone scene. ----- */
  useEffect(() => {
    if (!iframe.current || !sdkKey || !modelId) return;
    const started = now();
    let sub: { cancel(): void } | null = null;
    const ssBySweep = Object.fromEntries(Object.entries(sweepBySs).map(([ss, id]) => [id, Number(ss)]));
    sdkRef.current = connectSdk(iframe.current, sdkKey, { hideUi: !T.matterportUi }).then(async (sdk) => {
      await sdk.App.state.waitUntil((s) => s.phase === sdk.App.Phase.PLAYING);
      // A start with exact angles (rot=) is turned to them as soon as the viewer plays.
      const start = uLinkTarget(T.start);
      if (start?.rotation && T.start.includes("rot=") && sweepBySs[start.ss]) {
        await sdk.Sweep.moveTo(sweepBySs[start.ss], { rotation: start.rotation, transition: sdk.Sweep.Transition.INSTANT }).catch(() => {});
      }
      if (hiddenSweeps.length) await disableSweeps(sdk, hiddenSweeps);
      sdk.Sweep.data.subscribe({
        onCollectionUpdated: (c) => {
          const firstData = allSweeps.current.length === 0;
          allSweeps.current = Object.keys(c);
          sweepData.current = c;
          // The list can arrive after the visitor's first scan point - lock then, so nothing is left open.
          if (firstData && pointsOnlyRef.current && currentSweep.current) lockTo(sdk, allSweeps.current, currentSweep.current);
        },
      });
      setTourReadyMs(now() - started);
      sdkReadyRef.current = true;
      // What the visitor asked for while it loaded - after Matterport has settled the first view.
      setTimeout(releaseHeld, 400);
      // Matterport may still settle the view just after it's ready - not the visitor looking around.
      selfMoveAt.current = now() + 1500;
      setSdk(sdk);
      if (coverWaitingRef.current) {
        coverWaitingRef.current = false;
        setCoverWaiting(false);
        setCover(false);
      }
      track("tour_ready", { load_ms: Math.round(now() - started) });
      const current = (sdk as unknown as { Sweep: { current: { subscribe(cb: (s: { sid?: string }) => void): { cancel(): void } } } }).Sweep.current;
      sub = current.subscribe((s) => {
        // No scan point while Matterport is moving between two - the guide waits for it to land (sweepIdle).
        sweepMoving.current = !s?.sid;
        if (!s?.sid) return;
        const first = currentSweep.current == null;
        // The visitor stepped to another scan point themselves (a tap or drag in the 3D view - which happens in Matterport's own
        // frame, where a phone's touch can't be seen): that's using the tour too. Not the tour's own moves (a menu place, the guide, Find vej).
        if (!first && s.sid !== currentSweep.current && now() - selfMoveAt.current > 2500 && guideAtRef.current == null) markUsed();
        currentSweep.current = s.sid;
        if (first && pointsOnlyRef.current) lockTo(sdk, allSweeps.current, s.sid);
        const ss = ssBySweep[s.sid];
        currentSsRef.current = ss ?? null;
        setCurrentSs(ss ?? null);
        const name = ss != null ? roomNamesRef.current[ss] ?? null : null;
        // Time spent where the visitor just was (named rooms only).
        if (roomTimer.current?.name && roomTimer.current.name !== name) {
          track("room_time", { room_name: roomTimer.current.name, seconds: Math.round((now() - roomTimer.current.at) / 1000) });
        }
        if (roomTimer.current?.name !== name) roomTimer.current = { name, at: now() };
        setRoom(name);
        track("room_view", { sweep_id: s.sid, room_name: name ?? "(uden navn)" });
        if (name && ss != null) {
          try {
            localStorage.setItem(LAST_ROOM_KEY, JSON.stringify({ name, href: roomLinksRef.current[ss] }));
          } catch {}
        }
      });
      return sdk;
    });
    sdkRef.current.catch((err) => setTourError(err instanceof Error ? err.message : String(err)));
    return () => sub?.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- T.start is read once, when the tour first connects
  }, [sdkKey, modelId, sweepBySs, hiddenSweeps, LAST_ROOM_KEY, T.matterportUi, T.measure, routeGraph]);

  const setNavigation = useCallback(
    async (only: boolean) => {
      setPointsOnly(only);
      pointsOnlyRef.current = only;
      track("navigation_mode", { mode: only ? "points" : "free" });
      if (!sdkRef.current) return;
      const sdk = await sdkRef.current;
      if (only && currentSweep.current) await lockTo(sdk, allSweeps.current, currentSweep.current);
      if (!only) {
        const open = allSweeps.current.filter((id) => !hiddenSweeps.includes(id));
        if (open.length) await sdk.Sweep.enable(...open).catch((err) => console.warn("Sweep.enable", err));
      }
    },
    [hiddenSweeps]
  );

  /**
   * Moves to a scan point, opening it first if it's hidden (e.g. the scan
   * inside a storage room, hidden so nobody walks in) and closing the hidden one
   * you leave. If Matterport won't fly there, it fades there instead.
   */
  const moveSweep = useCallback(
    async (sdk: MpSdk, sweep: string, opts: { rotation?: Rotation; transition: string; transitionTime?: number }) => {
      // The tour's own move (not the visitor's step) - see "tour_use" below.
      selfMoveAt.current = now();
      const from = currentSweep.current;
      // Already standing there (e.g. the guide's first stop is where the tour starts): Matterport won't "move" to
      // the same scan point - it refuses, and the retries below would keep the visitor waiting ~4 s. Just turn.
      if (from === sweep) {
        if (opts.rotation) await sdk.Camera.setRotation?.(opts.rotation, { speed: opts.transition === sdk.Sweep.Transition.INSTANT ? 1000 : 120 }).catch(() => {});
        return;
      }
      const locked = pointsOnlyRef.current;
      // A scan point switched off in Matterport itself (Find vej may pass it): opened for the move, closed again when left.
      if (sweepData.current[sweep]?.enabled === false && !hiddenSweeps.includes(sweep)) openedSweeps.current.add(sweep);
      if (locked || hiddenSweeps.includes(sweep) || openedSweeps.current.has(sweep)) await sdk.Sweep.enable(sweep).catch(() => {});
      try {
        await sdk.Sweep.moveTo(sweep, opts);
      } catch (first) {
        // Most often Matterport is still busy with the last move (the visitor's own step, or a turn): wait and try
        // again the same way, so the chosen kind of move (fly, instant, cross-fade) is kept - for up to ~4 s, as a
        // step can take a while. Only then its own fade to black, as a last resort.
        track("move_retry", { sweep, label: String(first).slice(0, 120) }); // the error is kept (as the label), so it can be looked up
        let last: unknown = first;
        let done = false;
        for (const wait of [250, 350, 450, 600, 800, 1000]) {
          await new Promise((r) => setTimeout(r, wait));
          try {
            await sdk.Sweep.moveTo(sweep, opts);
            done = true;
            break;
          } catch (err) {
            last = err;
          }
        }
        if (!done)
          await sdk.Sweep.moveTo(sweep, { rotation: opts.rotation, transition: sdk.Sweep.Transition.FADEOUT, transitionTime: 500 }).catch((err) =>
            track("move_failed", { sweep, label: `${String(last).slice(0, 60)} / ${String(err).slice(0, 60)}` })
          );
      }
      selfMoveAt.current = now();
      if (from && from !== sweep && (locked || hiddenSweeps.includes(from) || openedSweeps.current.has(from))) {
        openedSweeps.current.delete(from);
        await sdk.Sweep.disable(from).catch(() => {});
      }
    },
    [hiddenSweeps]
  );

  /**
   * The sweep behind a scan point number. Matterport's model data sometimes
   * leaves scans out (MPSkins sees it too), so a number missing there is
   * looked up in the viewer's own list of sweeps (index = ss - 1).
   */
  const sweepForSs = useCallback(
    (ss: number) => sweepBySs[ss] ?? (() => {
      const s = Object.values(sweepData.current).find((x) => x?.index === ss - 1);
      return s?.sid ?? s?.id ?? null;
    })(),
    [sweepBySs]
  );

  const flyTo = useCallback(
    async (href: string, transition: "fly" | "instant") => {
      const target = uLinkTarget(href);
      const sweep = target ? sweepForSs(target.ss) : null;
      if (!sdkRef.current || !sweep) return false;
      const sdk = await sdkRef.current;
      if (transition === "fly" && T.jump === "fade") {
        // A real cross-fade instead of Matterport's fade to black: a picture of the view on top,
        // the new room underneath at once, then the picture fades away - like stepping to the next scan.
        const shot = crossfade.current;
        const fr = iframe.current;
        if (shot && fr) {
          // A modest size: it's on screen for half a second, and a big one makes the click feel slow.
          const w = Math.min(fr.clientWidth, 960);
          const pic = await sdk.Renderer.takeScreenShot({ width: w, height: Math.round((w * fr.clientHeight) / fr.clientWidth) }, { mattertags: false, sweeps: false }).catch(() => null);
          if (pic) {
            shot.style.transition = "none";
            shot.src = pic;
            await shot.decode().catch(() => {});
            shot.style.opacity = "1";
          }
        }
        try {
          await moveSweep(sdk, sweep, { rotation: target?.rotation, transition: sdk.Sweep.Transition.INSTANT });
          // Let the new room draw (and its sharp pictures come in) before the old view fades off it -
          // too soon and it shows blurry or black for a moment.
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          await new Promise((r) => setTimeout(r, 380));
        } finally {
          // Always take the picture away again - a move that fails must never leave a still (or black) picture over the tour.
          if (shot) {
            shot.style.transition = "opacity .6s ease";
            shot.style.opacity = "0";
          }
        }
      } else {
        await moveSweep(sdk, sweep, {
          rotation: target?.rotation,
          transition: transition === "instant" || T.jump === "instant" ? sdk.Sweep.Transition.INSTANT : sdk.Sweep.Transition.FLY,
          transitionTime: transition === "instant" || T.jump === "instant" ? undefined : T.flyMs,
        });
      }
      return true;
    },
    [sweepForSs, T, moveSweep]
  );

  /* ----- The drone scene. ----- */
  // The tour is moved to a point's room as soon as its panel opens, so the
  // room is already loaded behind the drone scene when "Gå ind" is pressed.
  const prepared = useRef<{ href: string; done: Promise<boolean> } | null>(null);
  const prepare = useCallback(
    (href: string) => {
      if (prepared.current?.href === href) return prepared.current.done;
      const done = flyTo(href, "instant").catch(() => false);
      prepared.current = { href, done };
      return done;
    },
    [flyTo]
  );

  /** Turns the drone scene (or moves the map) to a point - `panel`: leave room for its card on the right. */
  const lookAtPoint = useCallback(
    (p: Point, panel: boolean) => {
      if (T.map) mapApi.current?.focus(p.id);
      const v = drone.current;
      if (v) {
        // On a computer the panel covers the right side, so the point is centred in what's left of the screen.
        const phone = window.innerWidth <= 760;
        const shift = panel && !phone ? 183 : 0;
        // The tour's own choice (zoom in/out, or keep), else: on a phone the card covers the bottom half - zoom in a little and look lower, so the point stands above the card.
        const own = panel ? T.droneLook?.[phone ? "mobile" : "desktop"]?.point : undefined;
        const hfov = typeof own === "number" ? own : own === "keep" ? v.getHfov() : panel && phone ? Math.min(v.getHfov(), 40) : v.getHfov();
        const yaw = p.yaw + (shift / window.innerWidth) * hfov;
        const box = droneEl.current;
        const vfov = box ? (2 * Math.atan(Math.tan((hfov * Math.PI) / 360) * (box.clientHeight / Math.max(1, box.clientWidth))) * 180) / Math.PI : 90;
        const pitch = panel && phone ? p.pitch - vfov * 0.3 : p.pitch;
        // No further down than the picture goes (a tall phone screen sees ~110° from top to bottom).
        v.lookAt(Math.max(pitch, -70, T.droneLook?.[phone ? "mobile" : "desktop"]?.down ?? -90, -89 + vfov / 2), yaw, hfov, 700);
      }
    },
    [T]
  );
  const openPoint = useCallback(
    (p: Point) => {
      setSelected(p);
      track("drone_point_click", { point_name: p.name, category: T.categories[p.cat].name });
      lookAtPoint(p, true);
      if (p.tour) prepare(p.tour);
    },
    [prepare, T, lookAtPoint]
  );
  /** A point on the drone scene / map, its card open - from wherever the visitor is. */
  function showPoint(p: Point) {
    setMenuOpen(false);
    if (phase === "drone") return openPoint(p);
    backToDrone();
    setTimeout(() => openPoint(p), 700);
  }
  /** Where the language button stands, per device - "menu" only works in the side menu (others get the button by the menu button). */
  const sideMenu = (T.design?.menu ?? "side") === "side";
  const langPlace = (v: string) => (v === "menu" && !sideMenu ? "corner" : v);
  const langClasses = `hv-sprog-d-${langPlace(T.langSwitch?.desktop ?? "top")} hv-sprog-m-${langPlace(T.langSwitch?.mobile ?? "menu")}`;
  /** The points shown on the scene, by id → their name (walking times and the finder only name these). */
  const pointNames = useMemo(() => Object.fromEntries(T.points.map((p) => [p.id, p.name])), [T]);
  /**
   * The open point's walking times: a walk goes both ways (also one set from
   * the other end), so a pitch shows the way to the facilities - nearest
   * first. None on a category set not to show them.
   */
  const selectedWalks = useMemo(() => {
    if (!selected || T.categories[selected.cat]?.walks === false) return [];
    const by = new Map<string, number>();
    for (const w of selected.walks ?? []) by.set(w.to, w.minutes);
    for (const p of T.points) for (const w of p.walks ?? []) if (w.to === selected.id && !by.has(p.id)) by.set(p.id, w.minutes);
    by.delete(selected.id);
    return [...by]
      .filter(([to]) => pointNames[to])
      .map(([to, minutes]) => ({ to, minutes }))
      .sort((a, b) => a.minutes - b.minutes);
  }, [selected, T, pointNames]);
  /** The places "Find din plads" can land on: points some answer points at. */
  const finderPoints = useMemo(() => {
    const ids = new Set(T.finder?.questions.flatMap((q) => q.options.flatMap((o) => o.points)) ?? []);
    return T.points.filter((p) => ids.has(p.id));
  }, [T]);
  function openFinder(from: string) {
    if (!T.finder || !finderPoints.length) return;
    track("finder_open", { label: from });
    setMenuOpen(false);
    setSelected(null);
    if (phase === "drone") return setFinderOpen(true);
    backToDrone();
    setTimeout(() => setFinderOpen(true), 700);
  }
  useEffect(() => {
    closeRouteRef.current = () => route && closeRoute();
    closeGuideRef.current = (completed) => guideAt != null && closeGuide(completed);
    openFinderRef.current = () => openFinder("link");
    openDayRef.current = (from) => T.day && openDay(from);
  });
  /** "#punkt:<id>" → that point, if the setup has it. */
  const pointById = (href: string) => {
    const id = pointOfHref(href);
    return id ? (T.points.find((x) => x.id === id) ?? null) : null;
  };

  /** The 360° photo's copy for this screen (made when the tour was saved: smaller on a phone), else the photo itself. */
  const panoFor = (url: string) => {
    const c = T.panoCopies?.[url];
    return c ? (typeof window !== "undefined" && window.innerWidth <= 760 ? c.phone : c.computer) : url;
  };
  /** A big flat picture (a drone photo in the menu or the guide): its 4096 px copy, when the tour has one. */
  const flatImage = (url: string) => T.panoCopies?.[url]?.phone ?? url;
  /** Is a picture a 360° one (2:1)? Read from its (small) copy - fetched ahead, so it's known at once. */
  const isPanorama = (url: string) => pictureIsPanorama(flatImage(url));
  /** The 360° photos of the guide's stops from `from` on (the next two) - fetched ahead, so a stop opens at once instead of loading. */
  const prefetchGuidePanos = (from: number) => {
    for (const stop of GUIDE.slice(from, from + 2)) {
      // A picture stop (e.g. a drone photo): its copy, and - a 360° one on a computer - the sharp one after it.
      const picture = stop.href ? imageOfHref(stop.href) : null;
      if (picture) {
        prefetchPano(flatImage(picture))
          .then(() => isPanorama(picture))
          .then((pano) => (pano ? prefetchPano(panoFor(picture)) : undefined))
          .catch(() => {});
        continue;
      }
      const p = stop.href ? pointById(stop.href) : null;
      // The 4096 copy first (what shows at once - on a phone all of it), then a computer's sharp one.
      if (p?.panorama) {
        const small = T.panoCopies?.[p.panorama]?.phone;
        (small ? prefetchPano(small) : Promise.resolve()).finally(() => prefetchPano(panoFor(p.panorama!)).catch(() => {}));
      }
      // Prepared tiles: the two coarse levels (all six faces) - enough to open sharp-ish at once, the finer ones follow.
      else if (p?.pano && T.panos)
        for (const level of [1, 2])
          for (const face of ["f", "b", "u", "d", "l", "r"])
            for (let y = 0; y < 2 ** (level - 1); y++) for (let x = 0; x < 2 ** (level - 1); x++) prefetchPano(`${T.panos.basePath}/${p.pano}/${level}/${face}${y}_${x}.jpg`);
    }
  };
  /*
   * The first stops' pictures come in quietly, before "Vis mig rundt" is even
   * pressed - but only once Matterport is ready and the device has a moment to
   * spare (fetched at the start, they competed with Matterport for a phone's
   * connection and made the tour slow to load), and not at all on a slow or
   * data-saving connection (there they come when the guide gets to them).
   */
  useEffect(() => {
    if (!GUIDE.length) return;
    const net = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (net?.saveData || /2g/.test(net?.effectiveType ?? "")) return;
    let t: ReturnType<typeof setTimeout>;
    const idle = (fn: () => void) => ("requestIdleCallback" in window ? window.requestIdleCallback(fn, { timeout: 4000 }) : setTimeout(fn, 500));
    const wait = () => {
      if (!tourReady()) return void (t = setTimeout(wait, 1000));
      t = setTimeout(() => idle(() => prefetchGuidePanos(0)), 3000);
    };
    wait();
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per arrival on the drone scene / in the tour
  }, [phase, GUIDE]);

  // The drone scene is rebuilt only when it or its points change - not for every edit in the editor's preview.
  const droneKey = JSON.stringify([T.drone, Boolean(T.map), T.points, T.categories, T.droneLook]);
  /** The filter at the bottom: its height is given to what stands just above it (weather, Find din plads), which moves up with it. */
  const filterEl = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = filterEl.current;
    const root = el?.closest<HTMLElement>(".hv");
    if (!el || !root) return;
    const ro = new ResizeObserver(() => root.style.setProperty("--filtre-h", `${el.offsetHeight}px`));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  /** The drone picture that has finished loading - until then its points and boxes wait, so nothing floats on black. */
  const [droneLoaded, setDroneLoaded] = useState<string | null>(null);
  const droneWaiting = Boolean(T.drone && !T.map) && droneLoaded !== droneKey;
  const droneT = useRef(T);
  const openPointRef = useRef(openPoint);
  useEffect(() => {
    droneT.current = T;
    openPointRef.current = openPoint;
  });
  useEffect(() => {
    const T = droneT.current;
    const openPoint = (p: Point) => openPointRef.current(p);
    mobile.current = window.innerWidth <= 760;
    const D = T.drone;
    if (!D || T.map) return;
    let cancelled = false;
    let declutter = 0;
    let shownTimer = 0;
    const key = droneKey;
    // The 360° photo's copy for this screen (made when the tour was saved), when there is one.
    const copies = D.panorama ? T.panoCopies?.[D.panorama] : undefined;
    const dronePano = copies ? (mobile.current ? copies.phone : copies.computer) : D.panorama;
    loadPannellum().then(() => {
      if (cancelled || !droneEl.current || !window.pannellum) return;
      const start = mobile.current ? D.startMobile : D.start;
      const look = T.droneLook?.[mobile.current ? "mobile" : "desktop"] ?? {};
      const hotSpots: PannellumHotspot[] = T.points.map((p) => ({
        id: p.id,
        pitch: p.pitch,
        yaw: p.yaw,
        cssClass: `hv-hs hv-hs-${p.cat}`,
        createTooltipFunc: (el) => {
          el.dataset.punkt = p.id;
          el.innerHTML = `<div class="hv-pkt"><span class="hv-ikon" style="background:${T.categories[p.cat].color}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">${ICONS[p.icon] ?? ICONS.skov}</svg></span><span class="hv-navn">${p.name}</span></div>`;
          el.addEventListener("click", (e) => {
            e.stopPropagation();
            openPoint(p);
          });
        },
      }));
      drone.current = window.pannellum.viewer(droneEl.current, {
        // One uploaded 360° photo, or the drone's prepared tiles.
        ...(D.panorama
          ? { type: "equirectangular", panorama: dronePano }
          : {
              type: "multires",
              multiRes: {
                basePath: D.basePath,
                path: "/%l/%s%y_%x",
                extension: "jpg",
                tileResolution: 512,
                maxLevel: D.maxLevel,
                cubeResolution: D.cubeResolution,
              },
            }),
        autoLoad: true,
        showControls: false,
        compass: false,
        yaw: start.yaw,
        pitch: start.pitch,
        hfov: start.hfov,
        // The tour's own limits (Luftfoto og kort → Bevægelse), else as always.
        minHfov: look.zoomIn ?? (mobile.current ? 40 : 50),
        // On a tall phone screen, zooming out past the start makes the view taller than the picture lets it look down,
        // so pannellum tilts it up - and everything, points too, slides up and down. Out to the start, no further.
        maxHfov: look.zoomOut ?? (mobile.current ? Math.min(150, Math.max(start.hfov, 60)) : Math.max(115, start.hfov)),
        minPitch: look.down ?? -90,
        maxPitch: look.up ?? (D.panorama ? 90 : 25),
        mouseZoom: true,
        keyboardZoom: false,
        hotSpots,
      });
      drone.current.on("zoomchange", (hfov) => setZoomed(Number(hfov) < 56));
      // Shown when the picture can be drawn: the one 360° photo, or the tiles' small first level (the sharp ones come after) - or after a while, whatever happens.
      const shown = () => setDroneLoaded(key);
      drone.current.on("load", shown);
      drone.current.on("error", shown);
      const first = dronePano ? [dronePano] : ["f", "b", "u", "d", "l", "r"].map((f) => `${D.basePath}/1/${f}0_0.jpg`);
      Promise.all(first.map((src) => new Promise((done) => Object.assign(new Image(), { onload: done, onerror: done, src })))).then(() => {
        if (!cancelled) shownTimer = window.setTimeout(shown, 350);
      });
      window.setTimeout(shown, 8_000);
      declutter = window.setInterval(() => declutterNames(selectedId.current), 120);
      track("drone_view");
    });
    return () => {
      cancelled = true;
      window.clearInterval(declutter);
      window.clearTimeout(shownTimer);
      drone.current?.destroy();
      drone.current = null;
    };
  }, [droneKey]);

  // Category filter: hide/show the points of a category.
  useEffect(() => {
    for (const cat of Object.keys(T.categories)) {
      document.querySelectorAll<HTMLElement>(`.hv-hs-${cat}`).forEach((el) => el.classList.toggle("hv-skjult", Boolean(hidden[cat])));
    }
  }, [hidden, T]);

  // The open point stands out (and shows its name on a phone).
  useEffect(() => {
    document.querySelectorAll<HTMLElement>(".hv-hs").forEach((el) => el.classList.toggle("hv-aktiv", el.dataset.punkt === selected?.id));
    selectedId.current = selected?.id ?? null;
  }, [selected]);

  /* ----- Drone → room: zoom in on the point, the tour is moved to the spot underneath, then cross-fade. ----- */
  async function enterTour(href: string, from: string, pointName: string) {
    if (enteringRef.current) return;
    enteringRef.current = true;
    setEntering(true);
    track("tour_enter", { from, destination: pointName });
    const started = now();
    const v = drone.current;
    const p = selected;
    const zoom = new Promise<void>((resolve) => {
      if (v && p && phase === "drone") v.lookAt(Math.max(p.pitch - 6, -80), p.yaw, 34, 650, () => resolve());
      else if (T.map && p && phase === "drone" && mapApi.current) mapApi.current.focus(p.id, 3.2, 650).then(resolve);
      else resolve();
    });
    const moved = prepare(href);
    const [ok] = await Promise.all([moved, zoom]);
    prepared.current = null;
    if (!ok) {
      enteringRef.current = false;
      setEntering(false);
      return;
    }
    track("tour_enter_done", { destination: pointName, enter_ms: Math.round(now() - started) });
    setSelected(null);
    setMenuOpen(false);
    setPhase("tour");
    phaseRef.current = "tour";
    enteringRef.current = false;
    setEntering(false);
  }

  /** Back to the drone scene / map - at its start, or turned to `view` (a menu item's own spot). */
  function backToDrone(view?: DroneView) {
    prepared.current = null;
    track("back_to_drone", { room_name: room ?? "" });
    setMenuOpen(false);
    if (!OV) return;
    setPhase("drone");
    if (T.drone) {
      const start = view ?? (mobile.current ? T.drone.startMobile : T.drone.start);
      setTimeout(() => drone.current?.lookAt(start.pitch, start.yaw, start.hfov, 1200), 350);
    }
    setTimeout(() => mapApi.current?.reset(), 350);
  }

  /** What greets the visitor once they're in: the welcome, or the menu if it's open on start. */
  function afterStart() {
    if (T.design?.welcome === "cover" && T.cover && !played) {
      setCover(true);
      track("welcome_view", { style: "cover" });
      return;
    }
    if (T.welcome) {
      // Not in the editor's preview: there it's the editor's own walking about, not a visitor coming back.
      setLastRoom(inEditorPreview() ? null : readLastRoom(LAST_ROOM_KEY));
      setWelcome(true);
      track("welcome_view");
      return;
    }
    if (window.innerWidth <= 760 ? T.menuOpenOnStart.mobile : T.menuOpenOnStart.desktop) setMenuOpen(true);
  }
  const afterStartRef = useRef(afterStart);
  useEffect(() => {
    afterStartRef.current = afterStart;
  });

  /** The intro film is over (or skipped): wait for the tour if it isn't ready yet, then fade into it. */
  const introEnding = useRef(false);
  async function endIntro(how: "ended" | "skip" | "blocked", seconds: number) {
    if (introEnding.current) return;
    introEnding.current = true;
    track("intro_end", { how, seconds: Math.round(seconds * 10) / 10 });
    if (sdkRef.current) await Promise.race([sdkRef.current.catch(() => null), new Promise((r) => setTimeout(r, 6000))]);
    setIntro("fade");
    afterStart();
    setTimeout(() => setIntro(null), 1000);
  }

  /* ----- Start: a link can say where to begin, otherwise the welcome, or the menu if it's open on start. ----- */
  const enterRef = useRef(enterTour);
  useEffect(() => {
    enterRef.current = enterTour;
  });
  useEffect(() => {
    if (startRan.current === startKey) return; // the same start (a new language, an edit) - don't start the tour over
    startRan.current = startKey;
    const q = new URLSearchParams(window.location.search);
    const rum = q.get("rum");
    const punkt = q.get("punkt");
    const ss = q.get("ss");
    requestAnimationFrame(() => {
      if (rum || punkt || ss) {
        // a link to a place goes straight there
        setIntro(null);
        setCover(false);
      }
      if (rum) {
        // "?rum=minigolf" (or "?rum=fløj--toilet-og-bad" when names repeat) - e.g. from the tour's code on the customer's own page about it.
        const daPlaces = startPlaces(savedTour);
        const at = daPlaces.findIndex((p) => p.key === rum) >= 0 ? daPlaces.findIndex((p) => p.key === rum) : daPlaces.findIndex((p) => slug(p.name) === rum);
        const hit = at >= 0 ? startPlaces(T)[at] : undefined;
        if (hit) {
          track("start_link", { kind: "rum", target: hit.name });
          enterRef.current(hit.href, "link", hit.name);
          return;
        }
      }
      if (punkt) {
        const p = T.points.find((x) => x.id === punkt || slug(x.name) === punkt);
        if (p) {
          track("start_link", { kind: "punkt", target: p.name });
          openPoint(p);
          return;
        }
      }
      if (ss) {
        track("start_link", { kind: "ss", target: ss });
        enterRef.current(T.tourPage ? `${T.tourPage.split("?")[0]}?${q.toString()}` : `https://my.matterport.com/show/?m=${T.modelId}&${q.toString()}`, "link", ROOM_NAMES[Number(ss)] ?? `ss=${ss}`);
        return;
      }
      if (T.intro) return; // the welcome comes when the film ends
      afterStartRef.current();
    });
  }, [openPoint, T, savedTour, startKey, ROOM_NAMES, LAST_ROOM_KEY]);

  function chooseWelcome(go: WelcomeGo | "last" | "skip", label: string) {
    // A tile that goes into the tour, tapped before Matterport is ready: the welcome closes, and it waits for the tour.
    if (!tourReady() && go !== "skip" && !("href" in (go as object)) && !("drone" in (go as object)) && phaseRef.current !== "drone") {
      setWelcome(false);
      return void holdUntilReady(() => chooseWelcome(go, label));
    }
    track("welcome_choice", { choice: label });
    setWelcome(false);
    if (go === "skip") return;
    if (go === "last") {
      if (lastRoom) enterTour(lastRoom.href, "welcome", lastRoom.name);
      return;
    }
    if ("href" in go) {
      const point = pointById(go.href);
      if (point) return showPoint(point);
      track("cta_click", { label, link_url: go.href, place: "welcome" });
      openLink(T, go.href, label, popup);
      return;
    }
    if ("room" in go) {
      enterTour(go.room, "welcome", go.name);
      return;
    }
    if ("guide" in go) return startGuide("welcome", go.guide === true ? null : go.guide);
    if ("day" in go) return openDay("welcome");
    // A tour without a drone scene or map: the menu instead, so the tile still leads somewhere.
    if (!OV) {
      setMenuOpen(true);
      return;
    }
    // The drone scene, optionally with only one category's points showing.
    const only = go.drone;
    setHidden(only ? Object.fromEntries(Object.keys(T.categories).map((k) => [k, k !== only])) : {});
    // Turned to the tile's own spot, if it has one for this device.
    const view = window.innerWidth <= 760 ? go.view?.mobile : go.view?.desktop;
    if (view) drone.current?.lookAt(view.pitch, view.yaw, view.hfov, 1000);
  }

  async function menuGo(name: string, group: string, href: string) {
    // A place in the tour (or a guided tour) before Matterport is ready: kept until it is - the last one asked for.
    if (!tourReady() && phaseRef.current !== "drone" && (isPlaceHref(href) || guideOfHref(href) !== undefined)) {
      setMenuOpen(false);
      return holdUntilReady(() => void menuGoRef.current?.(name, group, href));
    }
    // Picking a place in the menu during "Vis mig rundt" means the visitor goes their own way: the guide stops.
    leaveGuide("menu", name);
    // Another guided tour (a "#rundvisning" link in the menu).
    const guide = guideOfHref(href);
    if (guide !== undefined) {
      setMenuOpen(false);
      return startGuide("menu", guide);
    }
    if (isDroneHref(href)) {
      setMenuOpen(false);
      // Turned to the item's own spot, if it has one for this device.
      const views = droneViewsOfHref(href);
      backToDrone(mobile.current ? views.mobile : views.desktop);
      return;
    }
    // A picture from the menu: full screen - or as 360°, when it's a 2:1 panorama.
    const image = imageOfHref(href);
    if (image) {
      track("menu_click", { item_name: name, group });
      setMenuOpen(false);
      // The smaller copy, when the tour has one (made when it was saved) - a big drone photo opens at once.
      void isPanorama(image).then((pano) => (pano ? setPano({ id: `billede-${name}`, name, panorama: image } as Point) : setLightbox({ images: [flatImage(image)], at: 0, title: name, phone: T.imageView?.[image]?.phone })));
      return;
    }
    const point = pointById(href);
    if (point) {
      track("menu_click", { item_name: name, group });
      return showPoint(point);
    }
    if (href === "#plan") {
      setMenuOpen(false);
      return openPlan();
    }
    if (href === CONTACT_HREF) {
      if (!T.contactForm) return;
      track("contact_click", { kind: "form", place: "menu" });
      setMenuOpen(false);
      return setContactOpen(true);
    }
    if (href === "#live") {
      if (T.live) openLive("menu");
      return;
    }
    if (!isPlaceHref(href)) {
      track("cta_click", { label: name, link_url: href, place: "menu" });
      openLink(T, href, name, popup);
      return;
    }
    track("menu_click", { item_name: name, group });
    if (phase === "drone") return enterTour(href, "menu", name);
    setMenuOpen(false);
    await flyTo(href, "fly");
  }
  // (See "hv-gaa-til" above: a button to a place in the tour goes there as the menu would.)
  useEffect(() => {
    goToRef.current = (href, label) => {
      setLightbox(null);
      setSelected(null);
      void menuGo(label, "link", href);
    };
  });

  useEffect(() => {
    menuGoRef.current = menuGo;
  });
  async function storyGo(r: StoryRoom) {
    if (!tourReady() && phase !== "drone") return holdUntilReady(() => void storyGo(r));
    track("menu_click", { item_name: r.name, group: "Historier" });
    if (phase === "drone") return enterTour(r.href, "story", r.name);
    await flyTo(r.href, "fly");
  }

  /** Prototype tool: visits every story room and takes its picture from the tour itself. */
  const router = useRouter();
  async function captureStories(progress: (text: string) => void) {
    if (!sdkRef.current) throw new Error("Touren er ikke klar.");
    const sdk = await sdkRef.current;
    setPhase("tour");
    for (const [i, r] of storyRooms.entries()) {
      progress(`${i + 1}/${storyRooms.length}: ${r.name}`);
      if (!(await flyTo(r.href, "instant"))) continue;
      await new Promise((res) => setTimeout(res, 2500)); // let the room's sharp textures load
      const shot = await sdk.Renderer.takeScreenShot({ width: 600, height: 800 }, { mattertags: false, sweeps: false, views: false, measurements: false });
      const saved = await saveTourStoryImage(T.slug, r.name, await storyJpeg(shot), true);
      if (!saved.ok) throw new Error(saved.error);
    }
    await storyImagesSaved(T.slug);
    progress(`Færdig - ${storyRooms.length} billeder.`);
    router.refresh();
  }

  /** A place from the cover or the dock: into the tour, right there. */
  async function placeGo(p: TourPlace, from: string) {
    if (!tourReady() && phase !== "drone") return holdUntilReady(() => void placeGo(p, from));
    leaveGuide(from, p.name);
    track("place_click", { place_name: p.name, from });
    setCover(false);
    if (phase === "drone") return enterTour(p.href, from, p.name);
    await flyTo(p.href, "fly");
  }

  /* ----- "Vis mig rundt" ----- */
  /** Does the view stand on the scan point of a link right now (asked of Matterport, not of what we last told it)? */
  async function standsAt(href: string): Promise<boolean> {
    const target = uLinkTarget(href);
    const want = target ? sweepForSs(target.ss) : null;
    if (!want || !sdkRef.current) return true; // nothing to check - don't loop
    const mp = await sdkRef.current;
    const now = await new Promise<string>((resolve) => {
      const sub = mp.Camera.pose.subscribe((p) => {
        resolve(p.sweep);
        setTimeout(() => sub.cancel());
      });
    });
    return now === want;
  }
  /** Until Matterport has landed (it won't take a new move while one is flying) - at most a few seconds. */
  async function sweepIdle() {
    for (let n = 0; n < 50 && sweepMoving.current; n++) await new Promise((r) => setTimeout(r, 120));
  }
  function guideGo(i: number) {
    const stop = GUIDE[i];
    const step = ++guideStep.current;
    guideAtRef.current = i;
    guideHeldRef.current = false;
    setGuideAt(i);
    setGuideHeld(false);
    prefetchGuidePanos(i + 1);
    // A picture on screen (the last stop's) hides the tour: a move to a room happens behind it, and it goes when the room is there.
    const covered = phaseRef.current === "tour" && Boolean(pano || guideImage);
    const target = stop.href && !imageOfHref(stop.href) && !pointById(stop.href) ? stop.href : null;
    if (!(covered && target)) setGuideImage(null);
    if (!stop.href) return; // a stop that stays where it is (e.g. the closing card)
    // A picture (e.g. a drone photo): full screen under the card - a 360° one as 360°, turning slowly.
    const picture = imageOfHref(stop.href);
    if (picture) {
      setSelected(null);
      void isPanorama(picture).then((pano) => {
        if (step !== guideStep.current) return;
        if (pano) setPano({ id: `billede-guide-${i}`, name: stop.title, panorama: picture } as Point);
        else {
          setPano(null);
          setGuideImage(flatImage(picture));
        }
      });
      return;
    }
    const point = pointById(stop.href);
    if (point) {
      setSelected(null);
      if (phase !== "drone") setPhase("drone");
      // The next stop inside the tour is got ready behind this one (the room loaded, standing there), so going in is quick -
      // unless the visitor has moved on meanwhile (then that room would be the wrong one).
      const next = GUIDE[i + 1]?.href;
      if (next && !pointById(next)) setTimeout(() => step === guideStep.current && phaseRef.current === "drone" && prepare(next), 1200);
      // With its own 360° photo, the guide shows that (turning slowly) - not just a zoom on the big picture.
      if (hasPano(point)) return setPano(point);
      // Otherwise the point on the drone scene / map, under the guide's card.
      setPano(null);
      setTimeout(() => lookAtPoint(point, false), phase === "drone" ? 0 : 400);
      return;
    }
    if (phaseRef.current === "drone") {
      setPano(null);
      // In from the drone scene - then make sure it's this stop it landed on (a press while going in is caught up with).
      void enterTour(stop.href, "guide", stop.title).then(() => guideSettle(step));
      return;
    }
    if (!covered) {
      setPano(null);
      return guideFly(stop);
    }
    // Straight there behind the picture (no flight to watch, turning some other way first), then the picture goes.
    guideFly(stop, () => {
      if (step !== guideStep.current) return;
      setPano(null);
      setGuideImage(null);
    });
  }
  /**
   * After going in from the drone scene: the view must stand where the card
   * says. A press meanwhile (going in takes a moment, and it can't be
   * stopped half-way) is flown to now - unless an even newer press takes care
   * of itself, or the visitor has taken over.
   */
  async function guideSettle(step: number) {
    for (let n = 0; n < 80 && enteringRef.current; n++) await new Promise((r) => setTimeout(r, 150));
    if (step !== guideStep.current || guideHeldRef.current || phaseRef.current !== "tour") return;
    const at = guideAtRef.current;
    const stop = at == null ? null : GUIDE[at];
    if (!stop?.href || pointById(stop.href)) return;
    if (!(await standsAt(stop.href)) && step === guideStep.current) guideFly(stop);
  }
  /** A stop inside the tour: flown to (one move at a time, only the newest), then the slow turn. */
  function guideFly(stop: (typeof GUIDE)[number], uncover?: () => void) {
    // The slow turn at the stop: as always, the other way, or none (the stop's own, else the guide's).
    const turn = stop.turn ?? G?.turn ?? "as";
    guideMoving.current = true;
    // One move at a time: Matterport refuses a move while the last one is still flying, so a quick
    // Næste waits for it - and only the newest stop is flown to (the ones skipped meanwhile are dropped).
    const ticket = ++guideTicket.current;
    guideQueue.current = guideQueue.current
      .catch(() => {})
      .then(async () => {
        if (ticket !== guideTicket.current) return;
        // A room being got ready behind the drone scene finishes first - it mustn't land after the guide's own move.
        await prepared.current?.done.catch(() => {});
        // Matterport won't take a move while it's flying one (e.g. the visitor's own step to another scan when
        // Næste is pressed) - and may answer "done" without moving. So: wait for it to land, move, wait for that
        // to land, and check that the view really is at the stop - again if not (a few times).
        for (let attempt = 0; attempt < 5; attempt++) {
          await sweepIdle();
          if (ticket !== guideTicket.current) return;
          await flyTo(stop.href, uncover ? "instant" : "fly");
          await new Promise((r) => setTimeout(r, 150));
          await sweepIdle();
          if (ticket !== guideTicket.current) return;
          if (await standsAt(stop.href)) break;
          await new Promise((r) => setTimeout(r, 300));
        }
        uncover?.();
        if (ticket !== guideTicket.current || turn === "none") return;
        // The slow turn isn't waited for by the queue (the next move may start while it turns) - but it is
        // still the guide moving, not the visitor: guideMoving stays on until the turn is done.
        selfMoveAt.current = now() + 8000; // the slow turn takes a few seconds - not the visitor looking around
        const turning = sdk?.Camera.rotate?.(turn === "other" ? -18 : 18, 0, { speed: 3 }).catch(() => {});
        turning?.finally(() => {
          if (ticket === guideTicket.current) setTimeout(() => ticket === guideTicket.current && guideDone(stop, ticket), 700);
        });
        return "turning";
      })
      .then((r) => {
        if (r !== "turning" && ticket === guideTicket.current) setTimeout(() => ticket === guideTicket.current && guideDone(stop, ticket), 700);
      }, () => {
        uncover?.();
        if (ticket === guideTicket.current) guideMoving.current = false;
      });
  }
  /**
   * The guide has stopped moving: from here on a move is the visitor's own. A
   * step the visitor took while the guide was flying (it couldn't be told from
   * the guide's own) shows now: standing elsewhere than the card says, the
   * guide waits for them ("På pause - du kigger selv rundt").
   */
  async function guideDone(stop: (typeof GUIDE)[number], ticket: number) {
    guideMoving.current = false;
    if (ticket !== guideTicket.current || guideHeldRef.current) return;
    if (!(await standsAt(stop.href)) && ticket === guideTicket.current && !guideMoving.current) {
      guideHeldRef.current = true;
      setGuideHeld(true);
      track("guide_leave", { stop: (guideAtRef.current ?? 0) + 1, stops: GUIDE.length, label: "Gik selv rundt", kind: "walk", guide: guideKey() });
    }
  }
  /*
   * Fitted to the phone it's on: the screen's own size (a web page can't
   * know the model, but it knows the size) sets how big everything on top
   * of the tour is drawn - "--ui-zoom" on the page, measured at the start,
   * on every turn of the phone and when the browser's bars come and go.
   * Portrait: an iPhone (393 x 852) is 1, a smaller phone smaller (an SE
   * 0.86), never bigger. On its side: by the height (0.6-0.8). Computers: 1.
   */
  useEffect(() => {
    const root = document.documentElement;
    const fit = () => {
      const w = window.visualViewport?.width ?? window.innerWidth;
      const h = window.visualViewport?.height ?? window.innerHeight;
      const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
      const z = h <= 500 && w >= 500 ? clamp(h / 540, 0.6, 0.8) : w <= 760 ? clamp(Math.min(w / 393, h / 800), 0.86, 1) : 1;
      root.style.setProperty("--ui-zoom", z.toFixed(3));
    };
    fit();
    window.addEventListener("resize", fit);
    window.addEventListener("orientationchange", fit);
    window.visualViewport?.addEventListener("resize", fit);
    return () => {
      window.removeEventListener("resize", fit);
      window.removeEventListener("orientationchange", fit);
      window.visualViewport?.removeEventListener("resize", fit);
    };
  }, []);
  /*
   * Using the tour also means just looking around in the 3D view: a drag or
   * swipe there happens in Matterport's own frame (on a phone a touch there
   * can't be seen), so a turn of the view the tour didn't make itself counts.
   */
  useEffect(() => {
    if (!sdk) return;
    let base: { x: number; y: number } | null = null;
    const sub = sdk.Camera.pose.subscribe((p) => {
      if (tracking.used) return;
      // The tour's own moves and turns (a place, the guide, Find vej) set a new starting point.
      if (!base || now() - selfMoveAt.current < 2500 || guideAtRef.current != null) {
        base = { x: p.rotation.x, y: p.rotation.y };
        return;
      }
      const dy = Math.abs(((p.rotation.y - base.y + 540) % 360) - 180);
      if (dy > 10 || Math.abs(p.rotation.x - base.x) > 10) markUsed();
    });
    return () => sub.cancel();
  }, [sdk]);
  /*
   * While the guide runs, the visitor may take over: walk to another scan
   * point or turn to look at something. Then the guide waits (its timer
   * stops) until they press Fortsæt or Næste - meanwhile it's just their tour.
   */
  useEffect(() => {
    if (guideAt == null || !sdk || phase !== "tour") return;
    let base: { sweep: string; x: number; y: number } | null = null;
    const sub = sdk.Camera.pose.subscribe((p) => {
      if (guideMoving.current || !base) {
        base = { sweep: p.sweep, x: p.rotation.x, y: p.rotation.y };
        return;
      }
      if (p.sweep !== base.sweep || Math.abs(p.rotation.y - base.y) > 4 || Math.abs(p.rotation.x - base.x) > 4) {
        // Once per pause: walking on counts as leaving the guide, only looking around doesn't.
        if (!guideHeldRef.current && p.sweep !== base.sweep) track("guide_leave", { stop: (guideAtRef.current ?? 0) + 1, stops: GUIDE.length, label: "Gik selv rundt", kind: "walk", guide: guideKey() });
        guideHeldRef.current = true;
        setGuideHeld(true);
      }
    });
    return () => sub.cancel();
    // guideHeld too: after Fortsæt, the view the visitor stands in is the new starting point.
  }, [guideAt, sdk, phase, guideHeld, GUIDE.length]);
  /** Starts a guided tour from the beginning: the main one (null) or one of `guides` by id. */
  function startGuide(from: string, id: string | null = null) {
    if (!tourReady()) {
      setMenuOpen(false);
      setWelcome(false);
      return void holdUntilReady(() => startGuide(from, id));
    }
    // The main one when asked for (or the id isn't there) - or the first there is, when the main one has no stops.
    let known = id != null && T.guides?.some((g) => g.id === id) ? id : null;
    if (known == null && !guideStops(T, null).length) known = GUIDES[0]?.id ?? null;
    const stops = guideStops(T, known);
    if (!stops.length) return;
    // One running already stops here (its own leave is counted) - and so do the stories and a Find vej walk: never two at once.
    leaveGuide("guide", known ?? "Vis mig rundt");
    window.dispatchEvent(new Event("hv-stop-stories"));
    closeRouteRef.current();
    guideIdRef.current = known;
    track("guide_start", { from, stops: stops.length, guide: guideKey() });
    setDayAt(null);
    setMenuOpen(false);
    setWelcome(false);
    setCover(false);
    setSelected(null);
    // Another guided tour than the last: rendered with its stops at once, then started from there.
    if (known !== guideId) {
      flushSync(() => setGuideId(known));
      guideGoRef.current(0);
    } else guideGo(0);
  }
  startGuideRef.current = startGuide;
  guideGoRef.current = guideGo;
  /*
   * How zoomed out the view is, per device (the editor's "Zoom"): set when the
   * tour is ready, again after every move (Matterport resets it) and when the
   * window changes between phone and computer width - so the editor's
   * Mobil/Computer preview shows each one. The setup is read through a ref,
   * so a change in the editor applies at once without restarting the tour.
   */
  const zoomRef = useRef(T.zoom);
  const lockRef = useRef(T.mobileZoomLock);
  useEffect(() => {
    zoomRef.current = T.zoom;
    lockRef.current = T.mobileZoomLock;
  });
  const zoomKey = `${T.zoom?.desktop}|${T.zoom?.mobile}|${T.mobileZoomLock}`;
  const zoomSet = useRef(false);
  useEffect(() => {
    if (!sdk?.Camera.zoomTo) return;
    let alive = true;
    const apply = () => {
      if (!alive) return;
      const small = phone || window.innerWidth <= 760;
      const z = small ? (zoomRef.current?.mobile ?? (lockRef.current ? 0.5 : null)) : (zoomRef.current?.desktop ?? null);
      // No zoom chosen: leave Matterport alone (and put back the normal view if one was set before).
      if (z == null && !zoomSet.current) return;
      zoomSet.current = z != null;
      try {
        sdk.Camera.zoomTo?.(z ?? 1).catch(() => {});
      } catch {}
    };
    // Only once the tour is really showing - zooming while Matterport is still starting up can leave the view blank.
    sdk.App.state.waitUntil((st) => st.phase === sdk.App.Phase.PLAYING).then(apply, () => {});
    window.addEventListener("resize", apply);
    const current = (sdk as unknown as { Sweep: { current: { subscribe(cb: () => void): { cancel(): void } } } }).Sweep.current;
    const sub = current.subscribe(() => setTimeout(apply, 300));
    return () => {
      alive = false;
      window.removeEventListener("resize", apply);
      sub.cancel();
    };
  }, [sdk, phone, zoomKey]);

  /* ----- "Sådan ser en dag ud" ----- */
  function openDay(from: string) {
    if (!T.day) return;
    track("day_open", { from });
    setMenuOpen(false);
    setWelcome(false);
    setCover(false);
    setGuideAt(null);
    setDayOpen(true);
  }
  function dayGo(i: number) {
    if (!tourReady()) return void holdUntilReady(() => dayGo(i));
    const step = T.day?.steps[i];
    if (!step?.href) return;
    track("day_view", { label: `${step.time} ${step.title}`, stop: i + 1 });
    setDayOpen(false);
    setDayAt(i);
    setSelected(null);
    if (phase === "drone") return enterTour(step.href, "day", step.title);
    flyTo(step.href, "fly");
  }
  /**
   * The visitor goes somewhere themselves during "Vis mig rundt" (a place in
   * the menu, the dock …): the guide stops right there - its card goes, and
   * the moves it had asked for are dropped, so it never flies them back.
   */
  function leaveGuide(how: string, to?: string) {
    if (guideAtRef.current == null) return;
    // Where they left it and for what - Resultater shows it (guide_leave: label = where to, value = the stop).
    track("guide_leave", { stop: guideAtRef.current + 1, stops: GUIDE.length, label: to || how, kind: how, guide: guideKey() });
    guideStep.current++;
    guideTicket.current++;
    guideMoving.current = false;
    guideAtRef.current = null;
    guideHeldRef.current = false;
    setGuideHeld(false);
    setGuideAt(null);
    setPano(null);
    setGuideImage(null);
  }
  function closeGuide(completed: boolean) {
    setGuideHeld(false);
    track(completed ? "guide_complete" : "guide_close", { stop: (guideAt ?? 0) + 1, stops: GUIDE.length, guide: guideKey() });
    if (!completed)
      track("guide_leave", { stop: (guideAt ?? 0) + 1, stops: GUIDE.length, label: guideExit(T, guideId) === "overview" && OV ? "Tilbage til luften" : "Gå selv rundt (knappen)", kind: "close", guide: guideKey() });
    setGuideAt(null);
    setPano(null);
    setGuideImage(null);
    // A tour you can't walk around in: back to the drone scene / map, not left standing inside.
    if (guideExit(T, guideId) === "overview" && OV && phase === "tour") backToDrone();
  }

  /** Prototype tool: the exact view the visitor stands in, as a link for the tour's setup. */
  async function copyView(): Promise<string> {
    if (!sdk) return "Touren er ikke klar endnu.";
    const pose = await new Promise<CameraPose>((resolve) => {
      const sub = sdk.Camera.pose.subscribe((p) => {
        resolve(p);
        setTimeout(() => sub.cancel());
      });
    });
    const ss = Object.entries(sweepBySs).find(([, id]) => id === pose.sweep)?.[0];
    if (!ss) return "Kunne ikke finde scanpunktet.";
    const snippet = `v(${ss}, ${pose.rotation.x.toFixed(1)}, ${pose.rotation.y.toFixed(1)})`;
    navigator.clipboard?.writeText(snippet).catch(() => {});
    return snippet;
  }

  /* ----- Editor bridge: the tour editor shows this page as its live preview ----- */
  /* A tour published as plain files has the free rooms from when it was published - fresh ones are fetched once it's open. */
  const [units, setUnits] = useState(givenUnits);
  useEffect(() => {
    if (!isStaticTour() || !savedTour.availability) return;
    fetch(apiUrl(`/api/tour-units/${savedTour.slug}`))
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { units?: AvailableUnit[] } | null) => d?.units && setUnits(d.units))
      .catch(() => {});
  }, [savedTour.slug, savedTour.availability]);

  /* Live units (free pitches, rooms …) from the customer's site. */
  const [liveOpen, setLiveOpen] = useState(false);
  const [liveUnits, setLiveUnits] = useState<LiveUnit[]>([]);
  // Each unit's own page (only known now): can it be shown in a popup? Asked ahead, so a tap on "Book" opens it the right way at once.
  useEffect(() => prefetchLinks(T, liveUnits.map((u) => T.live?.bookHref || u.link)), [T, liveUnits]);
  // Fetched after the tour has opened - the tour never waits for the customer's site.
  useEffect(() => {
    if (!T.live) return;
    let off = false;
    fetch(apiUrl(`/api/tour-live/${savedTour.slug}`))
      .then((r) => r.json())
      .then((d: { units?: LiveUnit[] }) => {
        if (off) return;
        // A draft in the editor can leave units out without saving first.
        const exclude = new Set(T.live?.exclude ?? []);
        setLiveUnits((d.units ?? []).filter((u) => !exclude.has(u.name)));
      })
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [T.live, savedTour.slug]);
  /** Prices and memberships, not free units: no counts, no "ledig", no badges in the menu. */
  const livePrices = T.live?.kind === "priser";
  const freeNames = useMemo(() => (livePrices ? [] : liveUnits.map((u) => u.name.toLowerCase())), [liveUnits, livePrices]);
  /** Is a menu item one of the free units? Whole words only - unit "1" isn't "12". */
  const isFree = (name: string) => {
    const n = name.toLowerCase();
    return freeNames.some((f) => n === f || new RegExp(`(^|[^\\p{L}\\d])${f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}\\d])`, "u").test(n));
  };
  // Seen: the free units were shown to this visitor (once per visit).
  const liveSeen = useRef(false);
  useEffect(() => {
    if (!liveUnits.length || liveSeen.current) return;
    liveSeen.current = true;
    track("live_seen", { label: String(liveUnits.length) });
  }, [liveUnits.length]);
  function openLive(from: string) {
    track("live_open", { from, label: String(liveUnits.length) });
    setMenuOpen(false);
    setLiveOpen(true);
  }
  // A link "#live" (a button, a menu item) opens the live list.
  const openLiveRef = useRef(openLive);
  useEffect(() => void (openLiveRef.current = openLive));
  useEffect(() => {
    const open = () => openLiveRef.current("button");
    window.addEventListener("hv-live", open);
    return () => window.removeEventListener("hv-live", open);
  }, []);

  /** A tag the editor is placing (its request id) - see the effect below the bridge. */
  const [picking, setPicking] = useState<string | null>(null);
  /** The editor wants the 3D tour in view (it's changing something only seen there): out of the welcome, cover and menu, and into the tour. */
  function peek() {
    setWelcome(false);
    setCover(false);
    setMenuOpen(false);
    setSelected(null);
    if (phase === "drone" && !entering) enterTour(T.start, "editor", "Start");
  }
  const bridge = useRef({ sdk, room, menuGo, peek, phase, captureStories });
  useEffect(() => {
    bridge.current = { sdk, room, menuGo, peek, phase, captureStories };
  });
  useEffect(() => {
    if (window.parent === window) return;
    const reply = (msg: object) => window.parent.postMessage(msg, location.origin);
    async function onMessage(e: MessageEvent) {
      if (e.origin !== location.origin || e.source !== window.parent || !e.data?.type) return;
      const { sdk, room, menuGo, captureStories: capture } = bridge.current;
      if (e.data.type === "tour-go") {
        // The editor shows a place (Vis start, a scan point, a menu item): straight there - the front page / welcome mustn't cover it.
        setCover(false);
        setWelcome(false);
        menuGo(e.data.name ?? "", "editor", e.data.href);
      }
      if (e.data.type === "tour-peek") bridge.current.peek(); // e.g. the colour filter: show the 3D tour itself
      if (e.data.type === "tour-pick") {
        // The editor places a tag: the next click in the tour says where.
        if (!sdk) return reply({ type: "tour-pick", id: e.data.id, error: "Touren er ikke klar endnu - vent et øjeblik." });
        setPicking(e.data.id);
        return;
      }
      if (e.data.type === "tour-stories") {
        // "Tag billeder til historierne": every story room visited and photographed, with progress to the editor.
        if (!sdk) return reply({ type: "tour-stories", id: e.data.id, error: "Touren er ikke klar endnu - vent et øjeblik." });
        setCover(false);
        setWelcome(false);
        try {
          await capture((text) => reply({ type: "tour-stories-progress", id: e.data.id, text }));
          reply({ type: "tour-stories", id: e.data.id, done: true });
        } catch (err) {
          reply({ type: "tour-stories", id: e.data.id, error: err instanceof Error ? err.message : "Kunne ikke tage billederne." });
        }
        return;
      }
      if (e.data.type === "tour-shot") {
        // A photo of what the preview shows - for a place, the cover or a card.
        if (!sdk) return reply({ type: "tour-shot", id: e.data.id, error: "Touren er ikke klar endnu - vent et øjeblik." });
        try {
          const shot = await sdk.Renderer.takeScreenShot({ width: 1600, height: 1000 }, { mattertags: false, sweeps: false, views: false, measurements: false });
          reply({ type: "tour-shot", id: e.data.id, image: await storyJpeg(shot, 1200, 750) });
        } catch {
          reply({ type: "tour-shot", id: e.data.id, error: "Kunne ikke tage billedet." });
        }
        return;
      }
      if (e.data.type === "tour-pano-view") {
        // The 360° picture open in the preview: where it looks and how zoomed (on this device's width).
        const v = openPanoView?.();
        if (!v) return reply({ type: "tour-pano-view", id: e.data.id, error: "Åbn billedet i forhåndsvisningen først." });
        return reply({ type: "tour-pano-view", id: e.data.id, ...v, phone: window.innerWidth <= 760 });
      }
      if (e.data.type === "tour-drone-view") {
        // Where the drone picture looks - for a tile that leads to the drone picture.
        const v = drone.current;
        if (!v || bridge.current.phase !== "drone") return reply({ type: "tour-drone-view", id: e.data.id, error: "Gå til luftfotoet i forhåndsvisningen først." });
        const r = (n: number) => Math.round(n * 10) / 10;
        return reply({ type: "tour-drone-view", id: e.data.id, yaw: r(v.getYaw()), pitch: r(v.getPitch()), hfov: r(v.getHfov()), phone: window.innerWidth <= 760 });
      }
      if (e.data.type === "tour-view") {
        // The view the preview stands in, as a menu link (scan point + exact direction).
        if (!sdk) return reply({ type: "tour-view", id: e.data.id, error: "Touren er ikke klar endnu - vent et øjeblik." });
        const pose = await new Promise<CameraPose>((resolve) => {
          const sub = sdk.Camera.pose.subscribe((p) => {
            resolve(p);
            setTimeout(() => sub.cancel());
          });
        });
        const ss = Object.entries(sweepBySs).find(([, id]) => id === pose.sweep)?.[0];
        if (!ss) return reply({ type: "tour-view", id: e.data.id, error: "Gå ind i touren først (forbi velkomsten)." });
        reply({ type: "tour-view", id: e.data.id, href: placeHref(savedTour, ss, pose.rotation), room });
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [savedTour, sweepBySs]);
  // Tell the editor once that the preview is listening (it then sends its draft) - not on every setup change.
  useEffect(() => {
    if (window.parent !== window) window.parent.postMessage({ type: "tour-ready" }, location.origin);
  }, []);

  /* A tag being placed from the editor: follow the pointer, the next click is the spot. */
  useEffect(() => {
    if (!picking || !sdk) return;
    let last: Vec3 | null = null;
    const doc = iframe.current?.contentDocument;
    const done = (msg: object) => {
      window.parent.postMessage({ type: "tour-pick", id: picking, ...msg }, location.origin);
      setPicking(null);
    };
    const onClick = (e: Event) => {
      if (!last) return;
      e.preventDefault();
      e.stopPropagation();
      done({ position: { x: +last.x.toFixed(2), y: +last.y.toFixed(2), z: +last.z.toFixed(2) }, ss: currentSsRef.current, room });
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && done({ error: "Annulleret." });
    const sub = sdk.Pointer?.intersection.subscribe((hit) => (last = hit?.position ?? null));
    // The click that places the tag mustn't also walk to the nearest scan point: the other points are off meanwhile.
    if (currentSweep.current) lockTo(sdk, allSweeps.current, currentSweep.current);
    doc?.addEventListener("click", onClick, true);
    window.addEventListener("keydown", onKey);
    doc?.addEventListener("keydown", onKey);
    return () => {
      sub?.cancel();
      // Walking again as before (still only by the points, when the tour is set to that).
      if (!pointsOnlyRef.current) {
        const open = allSweeps.current.filter((id) => !hiddenSweeps.includes(id));
        if (open.length) sdk.Sweep.enable(...open).catch(() => {});
      }
      doc?.removeEventListener("click", onClick, true);
      window.removeEventListener("keydown", onKey);
      doc?.removeEventListener("keydown", onKey);
    };
  }, [picking, sdk, room, hiddenSweeps]);

  /* ----- "Find vej" ----- */
  const DESTINATIONS = useMemo<Destination[]>(
    () =>
      T.menu.flatMap((m) =>
        ("items" in m ? m.items.map(([name, href]) => ({ name, group: m.title, href })) : [{ name: m.title, href: m.href }]).filter((d) =>
          isPlaceHref(d.href)
        )
      ),
    [T]
  );
  /** Which way to face going from one scan point to the next (the viewer looks down -z; yaw turns left). */
  function heading(a: string, b: string): number | null {
    const pa = sweepData.current[a]?.position;
    const pb = sweepData.current[b]?.position;
    if (!pa || !pb) return null;
    return (Math.atan2(-(pb.x - pa.x), -(pb.z - pa.z)) * 180) / Math.PI;
  }
  /** A scan point's spot on the floor, in the viewer's coordinates (for the route line). */
  function floorPoint(sid: string): Vec3 | null {
    const p = sweepData.current[sid]?.position;
    const g = routeGraph?.[sid]?.p;
    if (!p) return null;
    // The network's height is the floor; the viewer's may be the camera's - take the lower.
    return { x: p.x, y: g ? Math.min(p.y, g[2]) : p.y - 1.5, z: p.z };
  }
  async function walkTo(dest: Destination) {
    if (!tourReady()) {
      setRouteOpen(false);
      setMenuOpen(false);
      return holdUntilReady(() => void walkTo(dest));
    }
    setRouteOpen(false);
    setMenuOpen(false);
    // Find vej takes over: the stories and a guided tour stop.
    window.dispatchEvent(new Event("hv-stop-stories"));
    if (guideAtRef.current != null) closeGuideRef.current(false);
    const run = ++routeRun.current;
    const target = uLinkTarget(dest.href);
    const goal = target ? sweepForSs(target.ss) : null;
    const from = currentSweep.current;
    // Every scan point - also the hidden ones - so the way goes through the rooms, not through a wall.
    const net = sdk ? routeNetwork(routeGraph, sweepData.current) : null;
    const path = net && goal && from ? shortestPath(net, from, goal) : null;
    const flights = path && net ? straighten(net, path) : null;
    track("route_start", { destination: dest.name, group: dest.group ?? "", flights: flights ? flights.length - 1 : 0 });
    if (!sdk || !net || !flights || flights.length < 2) {
      // No route to walk (already there, or no network): just go there.
      await flyTo(dest.href, "fly");
      setRoute({ dest, step: 1, steps: 1, arrived: true });
      return;
    }
    const steps = flights.length - 1;
    const line = (from: number) => flights.slice(from).map(floorPoint).filter((p): p is Vec3 => p != null);
    setRoute({ dest, step: 0, steps, arrived: false });
    setRouteLine(line(0));
    // A moment to see the way before setting off - and look down it.
    const first = heading(flights[0], flights[1]);
    // Turned down the way on the spot - a smooth turn, not a move to the same scan point.
    if (first != null) {
      selfMoveAt.current = now() + 2000;
      await sdk.Camera.setRotation?.({ x: -8, y: first }, { speed: 110 }).catch(() => {});
      selfMoveAt.current = now();
    }
    await new Promise((r) => setTimeout(r, 250));
    for (let i = 1; i <= steps; i++) {
      if (routeRun.current !== run) return;
      const sid = flights[i];
      const last = i === steps;
      // Turning while flying, like a person walking: on the way to a corner the view already swings round to the
      // next stretch, so the corner is one smooth move - not stop, turn, go. (A slight turn: just look ahead.)
      const ahead = heading(flights[i - 1], sid);
      const after = last ? null : heading(sid, flights[i + 1]);
      const bend = ahead != null && after != null ? Math.abs(((((after - ahead) % 360) + 540) % 360) - 180) : 0;
      // Half-way into the turn at a gentle bend, all the way at a sharp one (the next flight finishes it).
      const look = ahead == null ? null : after == null || bend < 15 ? ahead : ahead + (((((after - ahead) % 360) + 540) % 360) - 180) * (bend > 60 ? 1 : 0.6);
      // The last flight turns into the place's own view as it lands - one smooth finish, no turn after.
      const ms = flightMs(net, flights[i - 1], sid);
      await moveSweep(sdk, sid, {
        rotation: last && target?.rotation ? target.rotation : look != null ? { x: -8, y: look } : undefined,
        transition: sdk.Sweep.Transition.FLY,
        // A sharp corner gets a little more time, so the turn isn't rushed.
        transitionTime: ms + (last ? 400 : bend > 60 ? 250 : 0),
      });
      if (routeRun.current !== run) return;
      setRoute({ dest, step: i, steps, arrived: last });
      setRouteLine(last ? [] : line(i));
    }
    track("route_arrive", { destination: dest.name, flights: steps });
  }
  // "Du er fremme" goes by itself after a few seconds, when the tour is set so (else it stays until closed).
  const arrivedAt = route?.arrived ? route.dest.name : null;
  useEffect(() => {
    const secs = T.wayfinding?.arriveHide;
    if (!arrivedAt || !secs) return;
    const t = setTimeout(() => closeRouteRef.current?.(), secs * 1000);
    return () => clearTimeout(t);
  }, [arrivedAt, T.wayfinding?.arriveHide]);
  /** "Stop" on the way: the walk stops where they are, with "Fortsæt" to walk on (or close). */
  function stopRoute() {
    if (!route || route.arrived) return closeRoute();
    track("route_stop", { destination: route.dest.name, step: route.step });
    routeRun.current++;
    setRoute({ ...route, paused: true });
    setRouteLine([]);
  }
  function closeRoute() {
    if (route && !route.arrived && !route.paused) track("route_stop", { destination: route.dest.name, step: route.step });
    routeRun.current++;
    setRoute(null);
    setRouteLine([]);
  }

  const place = usePlaceInfo(sdk, iframe, useCallback(() => currentSsRef.current, []));

  /* ----- Place cards and the card that comes by itself ----- */
  const cardIndex = T.placeCards && currentSs != null ? T.placeCards.findIndex((c, i) => c.ss.includes(currentSs) && !closedCards.includes(i)) : -1;
  const showCard = phase === "tour" && !cover && cardIndex >= 0 ? cardIndex : null;
  useEffect(() => {
    if (showCard != null) track("place_card_view", { title: T.placeCards![showCard].title });
  }, [showCard, T]);
  useEffect(() => {
    if (!T.nudge || phase !== "tour" || cover) return;
    const t = setTimeout(() => setNudgeOn(true), T.nudge.afterSeconds * 1000);
    return () => clearTimeout(t);
  }, [T, phase, cover, nudgeRound]);
  /** A card's "Se …" button: to the room with that name in the menu, or the drone point with that name. */
  function goRoom(name: string) {
    // A card's button to one scan point (also a hidden one, e.g. the same room set for a party).
    if (isPlaceHref(name)) return void flyTo(name, "fly");
    const item = T.menu.flatMap((m) => ("items" in m ? m.items.map((i) => ({ name: i[0], href: i[1], group: m.title })) : [{ name: m.title, href: m.href, group: "" }])).find((i) => i.name === name);
    if (item) return menuGo(item.name, item.group, item.href);
    const p = T.points.find((x) => x.name === name);
    if (p) showPoint(p);
  }

  /** The guided tours' and the day's buttons in the menu - at the top (as always) or the bottom, each by its own setting; left out of the menu, they start from tiles, points and buttons. */
  function menuExtras(at: "top" | "bottom") {
    const here = (m: "bottom" | false | undefined) => (m === false ? false : (m === "bottom" ? "bottom" : "top") === at);
    return (
      <>
        {GUIDES.filter((g) => here(guideSetup(T, g.id)?.menu)).map((g) => {
          // One button per guided tour, with how long it is.
          const n = guideStops(T, g.id).length;
          return (
            <button key={g.id ?? ""} type="button" className="hv-guide-knap" onClick={() => startGuide("menu", g.id)}>
              ▶
              <span>
                {g.id == null ? tx("Vis mig rundt") : g.title}
                <small>{tx("{n} steder, ca. {min} min", { n, min: Math.ceil((n * (guideSetup(T, g.id)?.seconds ?? 9)) / 60) })}</small>
              </span>
            </button>
          );
        })}
        {/* Find vej, when its button isn't on the tour (on this device) - up here by the guided tours, not lost among the menu items. */}
        {at === "top" && T.wayfinding && (T.wayfinding.button?.desktop === "menu" || T.wayfinding.button?.mobile === "menu") && (
          <button type="button" className="hv-day-knap hv-find-knap" onClick={() => (track("route_open", { from: "menu" }), setMenuOpen(false), setRouteOpen(true))}>
            ✦
            <span>
              {tx("Find vej")}
              <small>{tx("Vælg et rum - touren går vejen derhen")}</small>
            </span>
          </button>
        )}
        {T.day && here(T.day.menu) && (
          <button type="button" className="hv-day-knap" onClick={() => openDay("menu")}>
            ◷
            <span>
              {T.day.title}
              <small>
                {T.day.steps[0]?.time} - {T.day.steps[T.day.steps.length - 1]?.time}
              </small>
            </span>
          </button>
        )}
      </>
    );
  }

  /** The button on Find vej's "Du er fremme": the tour's own choice (or none), else its main button. */
  const arriveCta = T.wayfinding?.arrive === false ? undefined : T.wayfinding?.arrive?.label && T.wayfinding.arrive.href ? T.wayfinding.arrive : T.cta.find((c) => c.primary);
  const ctaClick = (label: string, href: string, place: string) => track("cta_click", { label, link_url: href, place });

  return (
    <TourLang.Provider value={{ lang, t: tx }}>
    <LinkProvider T={T} popup={popup}>
    <div className={`hv fixed inset-0 z-50 overflow-hidden bg-[#0d1b20] ${selected ? "hv-punkt" : ""} ${zoomed ? "hv-zoom" : ""} ${welcome ? "hv-welcome" : ""} ${phase === "tour" && T.stories?.mobile ? "hv-st-on-m" : ""} ${menuOpen ? "hv-menu-aaben" : ""} ${T.overviewUi?.box?.desktop === false ? "hv-boks-ud-d" : ""} ${T.overviewUi?.box?.mobile === false ? "hv-boks-ud-m" : ""} ${T.overviewUi?.filter?.desktop === false ? "hv-filter-ud-d" : ""} ${T.overviewUi?.filter?.mobile === false ? "hv-filter-ud-m" : ""} ${T.overviewUi?.names?.desktop ? `hv-navne-d-${T.overviewUi.names.desktop}` : ""} ${T.overviewUi?.names?.mobile ? `hv-navne-m-${T.overviewUi.names.mobile}` : ""} ${T.overviewUi?.filterColumns ? `hv-filter-kol hv-filter-kol-${T.overviewUi.filterColumns}` : T.overviewUi?.filterScroll ? "hv-filter-rul" : ""} ${langClasses} ${T.design?.menu === "dock" ? "hv-dock" : ""} ${T.logoSide === "right" ? "hv-logo-h" : ""} ${T.logoBg ? `hv-logobg-${T.logoBg}` : ""} ${T.logoBgTiles ?? T.logoBg ? `hv-tlogobg-${T.logoBgTiles ?? T.logoBg}` : ""} hv-tlogo-${T.logoAlignTiles ?? "midt"} ${guideAt != null || (dayAt != null && !dayOpen) ? "hv-guiding" : ""} ${route ? "hv-routing" : ""} ${phase === "tour" ? "hv-i-tour" : ""} ${T.wayfinding ? "hv-har-rute" : ""} ${T.wayfinding?.always ? "rt-altid" : ""} ${T.wayfinding?.button?.desktop ? `rt-d-${T.wayfinding.button.desktop}` : ""} ${T.wayfinding?.button?.mobile ? `rt-m-${T.wayfinding.button.mobile}` : ""} ${showCard != null || (nudgeOn && T.nudge && phase === "tour") ? "hv-med-kort" : ""} ${showMeasures && phase === "tour" ? "hv-maler" : ""} ${phase === "tour" && T.stories?.desktop ? "hv-st-on-d" : ""}`} style={
        {
          fontFamily: `'${T.font}', system-ui, sans-serif`,
          "--c-main": T.colors.main,
          "--c-accent": T.colors.accent,
          "--c-accent-dark": T.colors.accentDark,
          "--c-soft": T.colors.soft,
          "--font-heading": `'${T.fontHeading ?? T.font}', serif`,
          "--logo-h": `${T.logoSize ?? 46}px`,
          "--pkt-d": T.overviewUi?.pointSize?.desktop ?? 1,
          "--pkt-m": T.overviewUi?.pointSize?.mobile ?? 0.85,
          ...(T.logoOffset?.top != null && { "--logo-top": `${T.logoOffset.top}px` }),
          ...(T.logoOffset?.side != null && { "--logo-side": `${T.logoOffset.side}px` }),
        } as React.CSSProperties
      }>
      <link rel="stylesheet" href={`https://fonts.googleapis.com/css2?family=${T.font.replace(/ /g, "+")}:wght@400;600;700;800;900&display=swap`} />
      {T.fontHeading && <link rel="stylesheet" href={`https://fonts.googleapis.com/css2?family=${T.fontHeading.replace(/ /g, "+")}:wght@500;600&display=swap`} />}
      <style>{CSS + CONTACT_CSS + STORIES_CSS + LIGHTBOX_CSS + DESIGNS_CSS + LINKS_CSS + GUIDE_CSS + ONBOARDING_CSS + MENU_HINT_CSS + INFO_CSS + MAP_CSS + ROUTE_CSS + MEASURES_CSS + CARDS_CSS + DAY_CSS + SIMPLE_CSS + BENTO_CSS + LOGO_RIGHT_CSS + LANG_CSS + WEATHER_CSS + COMMUTE_CSS + FEATURES_CSS + FINDER_CSS + (review ? FEEDBACK_CSS : "")}</style>
      {/* The tour's own design on top (written by Claude or by hand under Avanceret). */}
      {T.customCss && <style>{T.customCss.replace(/<\/?style/gi, "")}</style>}

      {/* The tour, always mounted so it loads while the visitor is in the drone scene. */}
      {modelId && (
        <iframe
          ref={iframe}
          title="Matterport"
          src={showcaseUrl(modelId, sdkKey, { ...T.matterportParams, ...(T.mobileZoomLock && phone ? { nozoom: "1" } : {}), ...startParams(T.start) })}
          className={`hv-mp absolute inset-0 h-full w-full border-0 transition-opacity duration-500 ${phase === "tour" ? "opacity-100" : "pointer-events-none opacity-0"}`}
          allow="fullscreen; xr-spatial-tracking; autoplay"
          style={T.filter ? { filter: cssFilter(T.filter) } : undefined}
        />
      )}
      {T.jump === "fade" && (
        // The tour's colour filter on the picture too, so the colours don't jump when it fades.
        // eslint-disable-next-line @next/next/no-img-element
        <img ref={crossfade} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover" style={{ opacity: 0, filter: T.filter ? cssFilter(T.filter) : undefined }} />
      )}

      {/* The drone scene on top; fades away when going into the tour. */}
      {OV && (
      <div className={`absolute inset-0 transition-opacity duration-500 ${phase === "drone" ? "opacity-100" : "pointer-events-none opacity-0"} ${cover && T.cover ? "invisible" : ""} ${droneWaiting ? "hv-laster" : ""}`}>
        {droneWaiting && (
          <div className="hv-laster-tegn" aria-hidden>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={T.logo} alt="" />
          </div>
        )}
        {T.map ? (
          <MapScene
            T={T}
            api={mapApi}
            icons={ICONS}
            hidden={hidden}
            selectedId={selected?.id ?? null}
            onPoint={openPoint}
            onZoomed={setZoomed}
          />
        ) : (
          <div ref={droneEl} className="absolute inset-0" />
        )}

        <div className={`hv-intro ${T.logoOnLight ? "" : "hv-intro-moerk"}`}>
          <div className="hv-intro-head" style={{ background: T.colors.main }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={T.logo} alt={T.brand} />
            <div className="hv-sub">{T.subtitle}</div>
          </div>
          <div className="hv-intro-body">
            <h1>{OV?.intro.title}</h1>
            <p>{OV?.intro.lead && tx(OV.intro.lead)}</p>
            <TourLink className="hv-btn hv-primary" href={T.cta[0].href} label={T.cta[0].label} onClick={() => ctaClick(T.cta[0].label, T.cta[0].href, "intro")}>
              {T.cta[0].label}
            </TourLink>
            {T.finder && finderPoints.length > 0 && (
              <button type="button" className="hv-btn hv-secondary hv-find" onClick={() => openFinder("intro")}>
                {tx(T.finder.button)}
              </button>
            )}
          </div>
        </div>
        {T.finder && finderPoints.length > 0 && (
          <button type="button" className="hv-find-m" onClick={() => openFinder("intro")}>
            <svg viewBox="0 0 24 24" aria-hidden>
              <circle cx="11" cy="11" r="6.5" />
              <path d="m20 20-4.2-4.2" />
            </svg>
            {tx(T.finder.button)}
          </button>
        )}
        {finderOpen && T.finder && (
          <FinderSheet
            finder={T.finder}
            points={finderPoints}
            onClose={() => setFinderOpen(false)}
            onDone={(best, others) => {
              setFinderOpen(false);
              setFinderPick({ best: best.id, others: others.map((o) => o.id) });
              track("finder_result", { label: best.name });
              openPoint(best);
            }}
          />
        )}
        {selectedWalks.length ? <WalkLines from={selected!.id} walks={selectedWalks} names={pointNames} /> : null}

        <div className="hv-filtre" ref={filterEl}>
          <div className="hv-filtre-t">{OV?.filterTitle}</div>
          <div className="hv-chips">
            {Object.entries(T.categories).map(([k, c]) => (
              <button
                key={k}
                type="button"
                className={hidden[k] ? "fra" : ""}
                onClick={() => {
                  setHidden((h) => ({ ...h, [k]: !h[k] }));
                  track("category_filter", { category: c.name, visible: hidden[k] ? 1 : 0 });
                }}
              >
                <i style={{ background: c.color }} />
                <span>{c.name}</span>
              </button>
            ))}
          </div>
        </div>

        {T.weather && phase === "drone" && (
          <WeatherChip
            slug={savedTour.slug}
            at={T.weather}
            onOpen={() => {
              setSelected(null);
              track("weather_open", { label: T.weather!.place });
            }}
          />
        )}

        {selected && (
          <aside className="hv-panel">
            <button type="button" className="hv-luk" aria-label={tx("Luk")} onClick={() => setSelected(null)}>
              ×
            </button>
            {selected.video ? (
              <video key={selected.id} className="hv-pvideo" src={selected.video.src} poster={selected.video.poster} controls playsInline preload="metadata" />
            ) : selected.images?.length ? (
              <PointPhotos key={selected.id} images={selected.images} name={selected.name} onOpen={(at) => setLightbox({ images: selected.images!, at, title: selected.name })} />
            ) : null}
            <div className="hv-kat" style={{ color: T.categories[selected.cat].color }}>
              {T.categories[selected.cat].name}
            </div>
            {finderPick?.best === selected.id && <div className="hv-bedst">★ {tx("Bedst til jer")}</div>}
            {selected.kicker && <div className="hv-pkick">{selected.kicker}</div>}
            <h2>{selected.name}</h2>
            {/* On a phone the text is cut to a few lines (a tap shows it all), so the card fits without scrolling. */}
            <p className={`hv-ptekst ${textOpenFor === selected.id ? "aaben" : ""}`} onClick={() => setTextOpenFor((x) => (x === selected.id ? null : selected.id))}>
              {selected.text}
            </p>
            {finderPick?.best === selected.id && finderPick.others.some((id) => pointNames[id]) && (
              <p className="hv-andre">
                {tx("Også godt for jer:")}{" "}
                {finderPick.others
                  .filter((id) => pointNames[id])
                  .map((id, i) => (
                    <span key={id}>
                      {i > 0 && ", "}
                      <button type="button" onClick={() => openPoint(T.points.find((x) => x.id === id)!)}>
                        {pointNames[id]}
                      </button>
                    </span>
                  ))}
              </p>
            )}
            {selectedWalks.length > 0 && (
              <div className="hv-gaa">
                {selectedWalks.map((w) => (
                  <button key={w.to} type="button" onClick={() => openPoint(T.points.find((x) => x.id === w.to)!)}>
                    <svg viewBox="0 0 24 24" aria-hidden>
                      <circle cx="13" cy="4" r="2" />
                      <path d="m9 21 2-6 3 3v3M7 12l3-4 4 1 3 3M10 8l1.5 5" />
                    </svg>
                    {w.minutes} min {tx("til")} {pointNames[w.to]}
                  </button>
                ))}
              </div>
            )}
            {selected.facts?.length ? (
              <dl className="hv-fakta">
                {selected.facts.map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {selected.tip && <p className="hv-ptip">💡 {selected.tip}</p>}
            <div className="hv-pchips">
              {selected.chips.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
            <div className="hv-pknapper">
            {selected.tour ? (
              <button type="button" className="hv-btn hv-primary hv-wide" disabled={entering} onClick={() => enterTour(selected.tour!, "drone", selected.name)}>
                {entering ? tx("Går ind…") : tx("Gå ind i rummet")}
              </button>
            ) : (
              hasPano(selected) && (
                <button
                  type="button"
                  className="hv-btn hv-primary hv-wide"
                  onClick={() => {
                    track("pano_open", { point_name: selected.name });
                    setPano(selected);
                  }}
                >
                  {tx("Oplev i 360°")}
                </button>
              )
            )}
            {selected.tour && hasPano(selected) && (
              <button type="button" className="hv-btn hv-secondary hv-wide" onClick={() => setPano(selected)}>
                {tx("Oplev i 360°")}
              </button>
            )}
            {selected.planBox && T.sitePlan && (
              <button type="button" className="hv-btn hv-secondary hv-wide" onClick={() => openPlan(selected)}>
                {T.sitePlan.label}
              </button>
            )}
            {finderPick?.best === selected.id && !selected.button && T.cta[0] && (
              <TourLink href={T.cta[0].href} label={T.cta[0].label} className={`hv-btn ${selected.tour || hasPano(selected) ? "hv-secondary" : "hv-primary"} hv-wide`} onClick={() => ctaClick(T.cta[0].label, T.cta[0].href, "finder")}>
                {T.cta[0].label}
              </TourLink>
            )}
            {selected.button && (
              <TourLink
                href={selected.button.href}
                label={selected.button.label}
                className={`hv-btn ${selected.tour || hasPano(selected) ? "hv-secondary" : "hv-primary"} hv-wide`}
                onClick={() => ctaClick(selected.button!.label, selected.button!.href, "point")}
              >
                {selected.button.label}
              </TourLink>
            )}
            </div>
          </aside>
        )}
      </div>
      )}

      {welcome && T.welcome && T.design?.welcome === "simple" && <SimpleWelcome T={T} onChoose={chooseWelcome} />}
      {welcome && T.welcome && T.design?.welcome !== "simple" && (
        <div className="hv-wel" role="dialog" aria-modal="true" aria-label={T.welcome.title}>
          <div className="hv-wel-grid">
            <div className={`hv-wel-main ${T.logoOnLight ? "hv-light" : ""}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={T.logo} alt={T.brand} />
              <div className="hv-wel-kick">{T.welcome.kicker}</div>
              <h1>{T.welcome.title}</h1>
              <p>{T.welcome.lead}</p>
              {GUIDES.length > 0 && !T.welcome.tiles.some((t) => "guide" in t.go) && (
                <button type="button" className="hv-wel-guide" onClick={() => chooseWelcome({ guide: true }, "Vis mig rundt")}>
                  ▶ {tx("Vis mig rundt")}
                </button>
              )}
              <button type="button" className="hv-wel-skip" onClick={() => chooseWelcome("skip", T.welcome!.skip)}>
                {T.welcome.skip} →
              </button>
            </div>
            {lastRoom && (
              <button type="button" className="hv-tile hv-tile-last" onClick={() => chooseWelcome("last", "Fortsæt hvor du slap")}>
                <span className="hv-tile-plus">↺</span>
                <small>{tx("Fortsæt hvor du slap")}</small>
                <b>{tx(lastRoom.name)}</b>
              </button>
            )}
            {T.welcome.tiles.map((t) => (
              <button
                key={t.title}
                type="button"
                className={`hv-tile hv-tile-${t.style} ${t.image ? "hv-tile-foto" : ""}`}
                style={t.image ? { backgroundImage: `linear-gradient(180deg,rgba(0,0,0,0) 35%,rgba(0,0,0,.62)),url(${t.image})` } : undefined}
                onClick={() => chooseWelcome(t.go, t.title)}
              >
                {t.recommended && <em>{tx("Anbefalet")}</em>}
                <span className="hv-tile-plus">+</span>
                <small>{t.kicker}</small>
                <b>{t.title}</b>
              </button>
            ))}
          </div>
          <button type="button" className="hv-wel-x" aria-label={tx("Luk")} onClick={() => chooseWelcome("skip", "luk")}>
            ×
          </button>
        </div>
      )}

      {pano && hasPano(pano) && (
        <PanoView
          key={pano.id}
          name={pano.name}
          dir={pano.pano}
          image={pano.panorama}
          quick={pano.panorama ? T.panoCopies?.[pano.panorama]?.phone : undefined}
          full={pano.panorama ? panoFor(pano.panorama) : undefined}
          start={pano.panoStart ?? (pano.panorama && T.imageView?.[pano.panorama]?.yaw != null ? { yaw: T.imageView[pano.panorama].yaw!, pitch: T.imageView[pano.panorama].pitch ?? 0 } : undefined)}
          panos={T.panos}
          turn={guideAt != null ? (GUIDE[guideAt]?.turn ?? G?.turn ?? "as") : null}
          zoom={pano.panorama ? T.imageView?.[pano.panorama] : undefined}
          // A picture opened from the menu goes back to the menu - "Tilbage til luften" only when you came from the drone scene / map.
          backLabel={pano.id.startsWith("billede-") ? tx("Tilbage") : tx("Tilbage til luften")}
          onClose={() => {
            const fromMenu = pano.id.startsWith("billede-");
            setPano(null);
            if (fromMenu) setMenuOpen(true);
          }}
        />
      )}
      {lightbox && <Lightbox key={lightbox.title + lightbox.at} state={lightbox} onClose={() => setLightbox(null)} />}
      {guideImage && guideAt != null && (
        <div className="hv-guide-bilde">
          {/* The picture blurred behind it, and a wide one on an upright phone filling the height and gliding slowly from side to side. */}
          <div className="hv-guide-bilde-bag" style={{ backgroundImage: `url("${guideImage.replace(/"/g, "%22")}")` }} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={guideImage}
            src={guideImage}
            alt={GUIDE[guideAt]?.title ?? ""}
            onLoad={(e) => {
              const img = e.currentTarget;
              img.classList.toggle("bred", img.naturalWidth / Math.max(1, img.naturalHeight) > (window.innerWidth / Math.max(1, window.innerHeight)) * 1.3);
            }}
          />
        </div>
      )}

      {/* Logo (MPSkins: left, 200px, 13px from the edges - or right, with the menu on the left). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={T.logo} alt={T.brand} className={`hv-logo ${T.logoOnLight ? (T.logoCard === false ? "hv-logo-lys" : "hv-logo-kort") : ""} ${phase === "tour" && !(cover && T.cover) ? "" : "hidden"}`} />

      {/* Inside the tour: back to the air, the room's name, the menu. */}
      {phase === "tour" && (
        <>
          {OV && (
          <button type="button" className="hv-luften" onClick={() => backToDrone()}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 5l4 4M19 5l-4 4M5 19l4-4M19 19l-4-4M9 9h6v6H9z" />
            </svg>
            {tx(OV.backLabel)}
          </button>
          )}
          {T.stories && storyRooms.length > 0 && (
            <Stories
              rooms={storyRooms}
              current={roomShown}
              devices={T.stories}
              leading={OV ? { label: tx(OV.backLabel), onClick: () => backToDrone() } : undefined}
              onGo={storyGo}
              onEvent={track}
            />
          )}
          {roomShown && <div className="hv-room">{roomShown}</div>}
        </>
      )}

      {T.design?.menu === "simple" ? (
        phase === "tour" &&
        !cover &&
        !welcome && (
          <SimpleMenu
            T={T}
            open={menuOpen}
            setOpen={(o) => {
              if (o) track("menu_open", { place: phase });
              setMenuOpen(o);
            }}
            room={roomShown}
            guides={GUIDES}
            onGuide={(id) => startGuide("menu", id)}
            onDay={() => openDay("menu")}
            onGo={menuGo}
          />
        )
      ) : T.design?.menu === "bento" ? (
        phase === "tour" &&
        !cover &&
        !welcome && (
          <BentoMenu
            T={T}
            open={menuOpen}
            setOpen={(o) => {
              if (o) track("menu_open", { place: phase });
              setMenuOpen(o);
            }}
            room={roomShown}
            guides={GUIDES}
            onGuide={(id) => startGuide("menu", id)}
            onGo={menuGo}
          />
        )
      ) : T.design?.menu === "picker" ? (
        phase === "tour" && !cover && <PickerMenu T={T} units={units} onGo={menuGo} onCta={(label, href) => ctaClick(label, href, "picker")} />
      ) : T.design?.menu === "dock" ? (
        phase === "tour" && !cover && <DockMenu T={T} room={roomShown} onGuide={() => startGuide("dock")} onPlace={(p) => placeGo(p, "dock")} onItem={(label, href) => ctaClick(label, href, "dock")} />
      ) : (
      <>
      <button
        type="button"
        className="hv-menuknap"
        onClick={() => {
          if (!menuOpen) {
            track("menu_open", { place: phase });
            setSelected(null); // an open point and the menu would cover each other
          }
          setMenuOpen((o) => !o);
        }}
      >
        {menuOpen ? tx("Luk") : tx("Menu")}
      </button>
      {/* Behind an open menu: the tour dims a little, and a tap on it closes the menu (unless switched off). */}
      {T.menuDim !== false && <button type="button" className="hv-menu-slor" aria-label={tx("Luk menuen")} tabIndex={menuOpen ? 0 : -1} onClick={() => setMenuOpen(false)} />}
      <nav className={`hv-menu ${menuOpen ? "aaben" : ""}`}>
        <div className={`hv-menu-head ${T.logoOnLight ? "hv-light" : ""}`} style={{ background: T.logoOnLight ? "#fff" : T.colors.main }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={T.logo} alt="" />
          <div className="hv-menu-titel">{T.brand.toUpperCase()}</div>
          <div className="hv-sub">{T.subtitle}</div>
        </div>
        {setLang && (T.design?.menu ?? "side") === "side" && tourLanguages(savedTour).length > 1 && (
          <div className="hv-menu-sprog" role="group" aria-label={tx("Sprog")}>
            {tourLanguages(savedTour).map((code) => {
              const l = LANGUAGES.find((x) => x.code === code);
              return (
                <button key={code} type="button" aria-pressed={code === lang} onClick={() => (track("language", { label: code }), setLang(code))}>
                  <span aria-hidden>{l?.flag ?? "🌐"}</span>
                  {l?.name ?? code}
                </button>
              );
            })}
          </div>
        )}
        {menuExtras("top")}
        {T.live && liveUnits.length > 0 && (
          <button type="button" className="hv-gtitel hv-enkel hv-live-knap" onClick={() => openLive("menu")}>
            <i /> {T.live.title} {!livePrices && <span>{liveUnits.length}</span>}
          </button>
        )}
        {T.menu.filter((m) => !("items" in m) || m.items.length > 0).map((m) => // an empty group (nothing in it yet) isn't shown
          "items" in m ? (
            <div key={m.title} className="hv-gruppe">
              <button
                type="button"
                className="hv-gtitel"
                onClick={() => {
                  if (openGroup !== m.title) track("menu_group_open", { label: m.title });
                  setOpenGroup((g) => (g === m.title ? null : m.title));
                }}
              >
                {m.title}
                <span>{openGroup === m.title ? "−" : "+"}</span>
              </button>
              {openGroup === m.title && (
                <div className="hv-items">
                  {m.items.map(([name, href]) => (
                    <button key={name} type="button" onClick={() => menuGo(name, m.title, href)}>
                      {name}
                      {isFree(name) && <span className="hv-ledig">{tx("Ledig")}</span>}
                      {!isInTourHref(href) && <span className="hv-ext">↗</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <button key={m.title} type="button" className="hv-gtitel hv-enkel" onClick={() => menuGo(m.title, "", m.href)}>
              {m.title}
            </button>
          )
        )}
        {menuExtras("bottom")}
        <div className="hv-menu-cta">
          {T.cta.map((c) => (
            <TourLink key={c.label} className={`hv-btn ${c.primary ? "hv-primary" : "hv-secondary"}`} href={c.href} label={c.label} onClick={() => ctaClick(c.label, c.href, "menu")}>
              {c.label}
            </TourLink>
          ))}
        </div>
        {T.contact && (
          <div className="hv-contact">
            <div className="hv-contact-t">{tx("Kontakt")}</div>
            {T.contact.address && (
              <TourLink href={T.contact.mapUrl ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(T.contact.address ?? "")}`} label={T.contact.address ?? tx("Kort")} onClick={() => track("contact_click", { kind: "map" })}>
                <ContactIcon kind="pin" />
                {T.contact.address}
              </TourLink>
            )}
            {T.contact.phone && (
              <a href={`tel:${T.contact.phone.replace(/\s/g, "")}`} onClick={() => track("contact_click", { kind: "phone" })}>
                <ContactIcon kind="phone" />
                {formatPhone(T.contact.phone)}
              </a>
            )}
            {T.contact.email && (
              <a href={`mailto:${T.contact.email}`} onClick={() => track("contact_click", { kind: "email" })}>
                <ContactIcon kind="mail" />
                {T.contact.email}
              </a>
            )}
            {T.contactForm && T.contactForm.inBox !== false && (
              <button
                type="button"
                className="hv-contact-form"
                onClick={() => {
                  track("contact_click", { kind: "form", place: "contact" });
                  setContactOpen(true);
                }}
              >
                <ContactIcon kind="write" />
                {/* Its own text - or the form's title, unless a button right above says the same (then "Skriv til os"). */}
                {T.contactForm.boxLabel ||
                  (T.contactForm.title && !T.cta.some((c) => c.label.trim().toLowerCase() === T.contactForm!.title!.trim().toLowerCase()) ? T.contactForm.title : tx("Skriv til os"))}
              </button>
            )}
            {socialLinks(T.contact).length > 0 && (
              <div className="hv-social">
                {socialLinks(T.contact).map((s) => (
                  <TourLink key={s.kind} href={s.href} label={s.name} onClick={() => track("contact_click", { kind: s.kind })}>
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-label={s.name} dangerouslySetInnerHTML={{ __html: s.icon }} />
                  </TourLink>
                ))}
              </div>
            )}
          </div>
        )}
        <a className="hv-signatur" href="https://nextview360.dk" target="_blank" rel="noopener" onClick={() => track("nextview_click", { place: "menu" })}>
          {tx("Præsenteret af")}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="nextview360.dk" />
        </a>
      </nav>
      </>
      )}

      {cover && T.cover && (
        <CoverWelcome
          T={T}
          instant={startsCovered}
          waiting={coverWaiting}
          onEnter={() => {
            track("welcome_choice", { choice: "enter" });
            // Not loaded yet: close the cover when it is, rather than showing Matterport's loading screen.
            if (!sdk && sdkKey && modelId && !tourError) {
              coverWaitingRef.current = true;
              setCoverWaiting(true);
              return;
            }
            setCover(false);
          }}
          onPlace={(p) => placeGo(p, "cover")}
          onGuide={GUIDES.length ? () => startGuide("cover") : undefined}
          onCta={(label, href) => ctaClick(label, href, "cover")}
        />
      )}

      {/* The intro film, ending where the tour starts. */}
      {intro && T.intro && (
        <div className={`hv-film ${intro === "fade" ? "ude" : ""}`} style={T.intro.poster ? ({ "--poster": `url(${T.intro.poster})` } as React.CSSProperties) : undefined}>
          <video
            autoPlay
            muted
            playsInline
            preload="auto"
            poster={T.intro.poster}
            onPlay={() => track("intro_start")}
            onEnded={(e) => endIntro("ended", e.currentTarget.currentTime)}
            ref={(v) => {
              v?.play().catch(() => endIntro("blocked", 0));
            }}
          >
            {T.intro.sources.map((v, i) => (
              // The last source failing means none could play: straight into the tour.
              <source key={v.src} src={v.src} type={v.type} media={v.media} onError={i === T.intro!.sources.length - 1 ? () => endIntro("blocked", 0) : undefined} />
            ))}
          </video>
          <button type="button" onClick={(e) => endIntro("skip", (e.currentTarget.previousElementSibling as HTMLVideoElement).currentTime)}>
            {tx("Spring over")}
          </button>
        </div>
      )}

      {T.live && liveUnits.length > 0 && phase === "tour" && !cover && !liveOpen && (
        <button type="button" className="hv-live-chip" onClick={() => openLive("chip")}>
          <i /> {livePrices ? T.live.title : `${liveUnits.length} ${T.live.title.toLowerCase()}`}
        </button>
      )}
      {liveOpen && T.live && (
        <div className="hv-live" onClick={() => setLiveOpen(false)}>
          <div className="hv-live-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="hv-live-head">
              <b>{T.live.title}</b>
              {!livePrices && <span>{liveUnits.length} lige nu</span>}
              <button type="button" aria-label={tx("Luk")} onClick={() => setLiveOpen(false)}>
                ×
              </button>
            </div>
            <ul>
              {liveUnits.map((u) => {
                const href = T.live!.bookHref || u.link || T.cta.find((c) => c.primary && !c.href.startsWith("#"))?.href;
                return (
                  <li key={u.name}>
                    <span>
                      <b>{u.name}</b>
                      <small>
                        {livePrices
                          ? [T.live!.showSize !== false && u.size, u.from].filter(Boolean).join(" · ")
                          : [T.live!.showSize !== false && u.size && (/^\d+$/.test(u.size.trim()) ? `${u.size.trim()} ledige` : u.size), u.from && (/^(ledig|nu)\b/i.test(u.from) ? "ledig nu" : `ledig fra ${u.from}`)].filter(Boolean).join(", ")}
                      </small>
                    </span>
                    {u.price && <em>{u.price}</em>}
                    {T.live!.places?.[u.name] && (
                      <button
                        type="button"
                        className="hv-btn hv-secondary"
                        onClick={() => {
                          track("live_view", { label: u.name });
                          setLiveOpen(false);
                          flyTo(T.live!.places![u.name], "fly");
                        }}
                      >
                        Se
                      </button>
                    )}
                    {href && (
                      <TourLink href={href} label={`${T.live!.bookLabel ?? tx("Book")} ${u.name}`} className="hv-btn hv-primary" onClick={() => track("live_book", { label: u.name, link_url: href, ...(u.price ? { price: u.price } : {}) })}>
                        {T.live!.bookLabel ?? tx("Book")}
                      </TourLink>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
      {picking && <div className="hv-pick">Klik der, hvor tagget skal sidde · Esc fortryder</div>}
      {/* Prototype tools (status, event log, copy view …) - only in the editor's preview, never where the tour is opened on its own. */}
      {tools && inPreview && (
      <div className="hv-dev">
        <button type="button" onClick={() => setShowLog((s) => !s)}>
          {tourError ? "⚠ Tour" : tourReadyMs != null ? `Tour klar ${(tourReadyMs / 1000).toFixed(1).replace(".", ",")} s` : "Tour indlæses…"}
        </button>
        {showLog && (
          <DevPanel onCopyView={copyView} place={T.info ? place : undefined} onCaptureStories={T.stories ? captureStories : undefined} storyCount={storyRooms.length} tourError={tourError} sdkKey={sdkKey} modelId={modelId} pointsOnly={pointsOnly} onPointsOnly={setNavigation} />
        )}
      </div>
      )}
      {phase === "tour" && T.info && T.info.length > 0 && (
        <InfoDots
          sdk={sdk}
          info={T.info}
          currentSs={currentSs}
          frame={iframe}
          onOpen={(i) => track("info_open", { title: i.title })}
          onLink={(label, href) => ctaClick(label, href, "info")}
        />
      )}
      {T.wayfinding && phase === "tour" && !route && !routeOpen && !cover && guideAt == null && (
        <button type="button" className="rt-knap" onClick={() => (track("route_open"), setRouteOpen(true))}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" />
          </svg>
          {tx("Find vej")}
        </button>
      )}
      {T.measure && phase === "tour" && sdk?.Measurements && (
        <>
          {showMeasures && <MeasureShield sdk={sdk} />}
          <button
            type="button"
            className={`hv-maal ${showMeasures ? "aktiv" : ""}`}
            onClick={() => {
              track("measures_toggle", { on: showMeasures ? 0 : 1 });
              setShowMeasures((v) => !v);
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 17l14-14 4 4-14 14H3z" />
              <path d="M7 13l2 2M10 10l2 2M13 7l2 2" />
            </svg>
            {showMeasures ? tx("Skjul mål") : tx("Vis mål")}
          </button>
        </>
      )}
      {routeLine.length > 1 && phase === "tour" && <RouteLine sdk={sdk} points={routeLine} frame={iframe} />}
      {routeOpen && <RouteSheet destinations={DESTINATIONS} boxes={T.wayfinding?.boxes} onGo={walkTo} onClose={() => setRouteOpen(false)} />}
      {route && (
        <RouteStatus
          dest={route.dest}
          step={route.step}
          steps={route.steps}
          arrived={route.arrived}
          paused={route.paused}
          cta={arriveCta}
          onStop={stopRoute}
          onResume={() => walkTo(route.dest)}
          onClose={closeRoute}
          onCta={() => arriveCta && ctaClick(arriveCta.label, arriveCta.href, "route")}
        />
      )}
      {review && (
        <FeedbackLayer
          token={review}
          view={async () => {
            if (!sdk || phase !== "tour") return null;
            const pose = await new Promise<CameraPose>((resolve) => {
              const sub = sdk.Camera.pose.subscribe((p) => {
                resolve(p);
                setTimeout(() => sub.cancel());
              });
            });
            const ss = Object.entries(sweepBySs).find(([, id]) => id === pose.sweep)?.[0];
            return ss ? { href: placeHref(savedTour, ss, pose.rotation), ss: Number(ss), room } : null;
          }}
          shot={async () => {
            const fr = iframe.current;
            if (!sdk || !fr || phase !== "tour") return null;
            const w = Math.min(fr.clientWidth, 1400);
            return sdk.Renderer.takeScreenShot({ width: w, height: Math.round((w * fr.clientHeight) / fr.clientWidth) }, { mattertags: false, sweeps: false }).catch(() => null);
          }}
          onGo={(href) => menuGo(room ?? "", "feedback", href)}
        />
      )}
      {dayOpen && T.day && <DaySheet day={T.day} at={dayAt} onSee={dayGo} onClose={() => setDayOpen(false)} />}
      {dayAt != null && T.day?.steps[dayAt] && !dayOpen && guideAt == null && phase === "tour" && (
        <DayBar
          day={T.day}
          at={dayAt}
          onNext={dayGo}
          onOpen={() => openDay("bar")}
          onClose={() => {
            track("day_close", { stop: dayAt + 1 });
            setDayAt(null);
          }}
        />
      )}
      {T.commute?.button && !welcome && !(cover && T.cover) && guideAt == null && !route && (
        <button type="button" className={`vt-tur-knap vt-tur-knap-${T.commute.button}`} onClick={() => (track("commute_open", { from: "button" }), setCommuteOpen(true))}>
          🚌 {T.commute.title || tx("Hvor langt har du til os?")}
        </button>
      )}
      {featuresOpen && <FeatureTour T={T} onClose={() => setFeaturesOpen(false)} onEvent={(name, params) => track(name, params ?? {})} />}
      {commuteOpen && T.commute && <CommuteSheet T={T} onClose={() => setCommuteOpen(false)} onEvent={(name, params) => track(name, params ?? {})} />}
      {contactOpen && T.contactForm && (
        <ContactForm T={T} preview={inPreview} room={room} onClose={() => setContactOpen(false)} onSent={() => track("contact_form", { place: "form" })} />
      )}
      {T.onboarding && !helpDone && phase === "tour" && !cover && !welcome && !intro && sdk && guideAt == null && !menuOpen && !contactOpen && (
        <Onboarding
          hasMenu={T.menu.length > 0}
          onGuide={GUIDES.length ? () => startGuide("onboarding") : undefined}
          onDone={() => {
            track("onboarding_done", {});
            doneHelp();
          }}
        />
      )}
      {holding && (
        <div className="hv-holder" role="status">
          <span className="hv-holder-spin" aria-hidden />
          {tx("Gør touren klar …")}
        </div>
      )}
      {T.menuHint && (T.menuHint === "all" || (typeof window !== "undefined" && window.innerWidth <= 760)) && (helpDone || !T.onboarding) && phase === "tour" && !cover && !welcome && !intro && sdk && guideAt == null && !menuOpen && !contactOpen && (
        <MenuHint slug={T.slug} again={inEditorPreview()} />
      )}
      {guideAt != null && GUIDE[guideAt] && (
        <GuidePlayer
          stops={GUIDE}
          index={guideAt}
          size={T.guideCardSize}
          seconds={G?.seconds ?? 9}
          manual={G?.manual}
          held={guideHeld}
          walkHint={phase === "tour"}
          walkHintStops={G?.walkHint === "all" ? Infinity : G?.walkHint === "none" ? 0 : (G?.walkHint ?? 2)}
          onResume={() => {
            // Fortsæt: back to the stop the card shows, if the visitor walked off - card and view always agree.
            setGuideHeld(false);
            guideHeldRef.current = false;
            const stop = guideAt != null ? GUIDE[guideAt] : null;
            if (stop?.href && !pointById(stop.href) && phaseRef.current === "tour")
              void standsAt(stop.href).then((there) => {
                if (!there && guideAtRef.current === guideAt && !guideHeldRef.current) guideFly(stop);
              });
          }}
          end={primaryCta && (
            <TourLink href={primaryCta.href} label={primaryCta.label} className="hv-btn hv-primary" onClick={() => track("cta_click", { label: primaryCta.label, link_url: primaryCta.href, place: "guide_end" })}>
              {primaryCta.label}
            </TourLink>
          )}
          onGo={guideGo}
          onClose={closeGuide}
          onEvent={track}
          stopLabel={guideExit(T, guideId) === "overview" && OV ? tx(OV.backLabel || "Tilbage til luften") : undefined}
        />
      )}
      {showCard != null && (
        <PlaceCard
          key={showCard}
          card={T.placeCards![showCard]}
          size={T.placeCardSize}
          onClose={(how) => {
            track("place_card_close", { title: T.placeCards![showCard].title, how });
            setClosedCards((c) => [...c, showCard]);
          }}
          onRoom={goRoom}
          onLink={(label, href) => ctaClick(label, href, "place_card")}
        />
      )}
      {nudgeOn && showCard == null && !menuOpen && T.nudge && phase === "tour" && (
        <NudgeCard
          T={T}
          onClose={() => {
            track("nudge_close");
            setNudgeOn(false);
            setNudgeRound((r) => r + 1);
          }}
          onLink={(label, href) => ctaClick(label, href, "nudge")}
        />
      )}
      {linkPopup && (
        <LinkPopup
          open={linkPopup}
          onClose={() => setLinkPopup(null)}
          size={popupSize(T)}
          custom={T.linkOpen?.custom}
          site={T.linkOpen?.showSite === false ? null : siteOf(linkPopup.href)}
          slug={savedTour.slug}
        />
      )}
      {setLang && tourLanguages(savedTour).length > 1 && <LangSwitch langs={tourLanguages(savedTour)} lang={lang} onPick={(l) => (track("language", { label: l }), setLang(l))} label={tx("Sprog")} />}
    </div>
    </LinkProvider>
    </TourLang.Provider>
  );
}

/** A 360° photo at a point, full screen over the drone scene. */
/** A point's photos at the top of its card - swiped or tapped through, with dots (cross-faded, no scroll box: a scrolling layer over the drone scene can blank it on phones). */
function PointPhotos({ images, name, onOpen }: { images: string[]; name: string; onOpen: (at: number) => void }) {
  const tr = useT();
  const [at, setAt] = useState(0);
  const touch = useRef<number | null>(null);
  const step = (d: number) => setAt((i) => (i + d + images.length) % images.length);
  return (
    <div
      className="hv-fotos"
      onClick={() => onOpen(at)}
      onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        const dx = e.changedTouches[0].clientX - (touch.current ?? e.changedTouches[0].clientX);
        touch.current = null;
        if (Math.abs(dx) > 30) {
          e.preventDefault(); // a swipe, not a tap
          step(dx < 0 ? 1 : -1);
        }
      }}
    >
      {images.map((src, i) => (
        <span key={src} className={`hv-foto ${i === at ? "on" : ""}`}>
          {/* The whole photo, on a soft, blurred copy of itself - nothing cut off. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" aria-hidden className="hv-foto-bag" loading={i === 0 ? "eager" : "lazy"} draggable={false} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={i === 0 ? name : ""} loading={i === 0 ? "eager" : "lazy"} draggable={false} />
        </span>
      ))}
      <span className="hv-fotos-stor" aria-hidden>
        {images.length > 1 ? `${at + 1}/${images.length} ` : ""}⤢
      </span>
      {images.length > 1 && (
        <>
          <button type="button" className="hv-fotos-pil hv-fotos-forrige" aria-label={tr("Forrige")} onClick={(e) => (e.stopPropagation(), step(-1))}>
            ‹
          </button>
          <button type="button" className="hv-fotos-pil hv-fotos-naeste" aria-label={tr("Næste")} onClick={(e) => (e.stopPropagation(), step(1))}>
            ›
          </button>
        </>
      )}
      {images.length > 1 && (
        <div className="hv-fotos-dots">
          {images.map((src, i) => (
            <i key={src} className={i === at ? "on" : ""} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Pictures known to be 360° (2:1) or not - asked once each (the picture comes from the browser's cache when it was fetched ahead). */
const panoramaCheck = new Map<string, Promise<boolean>>();
function pictureIsPanorama(url: string): Promise<boolean> {
  let p = panoramaCheck.get(url);
  if (!p) {
    p = new Promise<boolean>((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(Math.abs(img.naturalWidth / img.naturalHeight - 2) < 0.05);
      img.onerror = () => resolve(false);
      img.src = url;
    });
    panoramaCheck.set(url, p);
  }
  return p;
}

/** 360° photos already asked for (each fetched once) - the browser keeps them, so the viewer gets them from its cache. */
const prefetchedPanos = new Map<string, Promise<void>>();
/** The ones that have come (in the browser's cache): a viewer can open with them at once. */
const loadedPanos = new Set<string>();
function prefetchPano(url: string, priority: "low" | "high" = "low"): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  const known = prefetchedPanos.get(url);
  if (known) return known;
  // Fetched as the viewer fetches it (same address, CORS), so it is the same cached file. Low priority: never ahead of what's on screen.
  const p = fetch(url, { mode: "cors", priority } as RequestInit)
    .then((r) => r.blob())
    .then(() => void loadedPanos.add(url))
    .catch((err) => {
      prefetchedPanos.delete(url);
      throw err;
    });
  prefetchedPanos.set(url, p);
  return p;
}

/** The 360° picture open right now (PanoView) - the editor asks for its view to save where it starts and how zoomed. */
let openPanoView: (() => { yaw: number; pitch: number; hfov: number; image?: string }) | null = null;

function PanoView({
  name,
  dir,
  image,
  quick,
  full,
  start,
  panos,
  turn = null,
  zoom,
  backLabel,
  onClose,
}: {
  name: string;
  backLabel: string;
  /** How zoomed it opens, per device (1 = normal: a computer a little out, a phone a little in). */
  zoom?: { desktop?: number; mobile?: number };
  /** A folder of prepared tiles (under `panos`) - or `image`, one uploaded 360° photo. */
  dir?: string;
  image?: string;
  /**
   * What's shown for `image` (which stays the photo's own address, for the
   * editor): `quick`, the 4096 copy, at once - and then `full`, the copy for
   * this screen (8192 on a computer), laid over it as soon as it's loaded.
   */
  quick?: string;
  full?: string;
  start?: { yaw: number; pitch: number };
  /** Turns slowly by itself while the guide shows it: as always, the other way, or not ("none"/null). */
  turn?: GuideTurn | null;
  panos?: TourConfig["panos"];
  onClose: () => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const sharpEl = useRef<HTMLDivElement>(null);
  // Where it opens, as numbers: a new (equal) object on every render of the tour must not start the picture over.
  const startYaw = start?.yaw;
  const startPitch = start?.pitch;
  // The turn it opened with: the guide moving on to the next stop (with its own turn) mustn't restart this picture.
  const [turnAtOpen] = useState(turn);
  useEffect(() => {
    let viewer: PannellumViewer | null = null;
    let sharpViewer: PannellumViewer | null = null;
    let cancelled = false;
    const sharpBox = sharpEl.current;
    // The sharp copy already fetched (the guide gets its pictures ahead): open with that - no swap while it turns.
    const first = full && loadedPanos.has(full) ? full : (quick ?? full ?? image);
    const later = quick && full && full !== first ? full : null;
    const options = (at: { yaw: number; pitch: number; hfov: number }, src?: string) => ({
      ...(src
        ? { type: "equirectangular", panorama: src }
        : {
            type: "multires",
            multiRes: {
              basePath: `${panos!.basePath}/${dir}`,
              path: "/%l/%s%y_%x",
              extension: "jpg",
              tileResolution: 512,
              maxLevel: panos!.maxLevel,
              cubeResolution: panos!.cubeResolution,
            },
          }),
      autoLoad: true,
      showControls: false,
      compass: false,
      hfov: at.hfov,
      minHfov: 30,
      maxHfov: 150,
      yaw: at.yaw,
      pitch: at.pitch,
      ...(turnAtOpen && turnAtOpen !== "none" ? { autoRotate: turnAtOpen === "other" ? 2.5 : -2.5, autoRotateInactivityDelay: 4000 } : {}),
    });
    loadPannellum().then(() => {
      if (cancelled || !el.current || !window.pannellum) return;
      if (!image && !(dir && panos)) return;
      const hfov = window.innerWidth <= 760 ? panoHfov(true, zoom?.mobile) : panoHfov(false, zoom?.desktop);
      const v = window.pannellum.viewer(el.current, options({ yaw: startYaw ?? 0, pitch: startPitch ?? -10, hfov }, first));
      viewer = v;
      openPanoView = () => ({ yaw: v.getYaw(), pitch: v.getPitch(), hfov: v.getHfov(), image });
      if (!later) return;
      // The sharp copy: fetched meanwhile, then a second viewer over the first - same view - shown once it has drawn, and the small one let go.
      let firstShown = false;
      let sharpReady = false;
      const swap = () => {
        if (cancelled || !firstShown || !sharpReady || !sharpBox || sharpViewer) return;
        const at = { yaw: v.getYaw(), pitch: v.getPitch(), hfov: v.getHfov() };
        const s = window.pannellum!.viewer(sharpBox, options(at, later));
        sharpViewer = s;
        s.on("load", () => {
          if (cancelled) return;
          // Where the small one has turned to meanwhile.
          s.lookAt(v.getPitch(), v.getYaw(), v.getHfov(), 0);
          sharpBox.classList.add("hv-pano-skarp-vist");
          openPanoView = () => ({ yaw: s.getYaw(), pitch: s.getPitch(), hfov: s.getHfov(), image });
          setTimeout(() => {
            if (viewer === v) {
              v.destroy();
              viewer = null;
            }
          }, 400);
        });
      };
      v.on("load", () => {
        firstShown = true;
        swap();
      });
      prefetchPano(later, "high")
        .then(() => {
          sharpReady = true;
          swap();
        })
        .catch(() => {});
    });
    return () => {
      cancelled = true;
      openPanoView = null;
      viewer?.destroy();
      sharpViewer?.destroy();
      sharpBox?.classList.remove("hv-pano-skarp-vist");
    };
  }, [dir, image, quick, full, panos, startYaw, startPitch, turnAtOpen, zoom]);
  return (
    <div className="hv-pano">
      <div ref={el} className="absolute inset-0" />
      <div ref={sharpEl} className="hv-pano-skarp absolute inset-0" />
      <div className="hv-pano-titel">{name}</div>
      <button type="button" className="hv-pano-luk" onClick={onClose}>
        ← {backLabel}
      </button>
    </div>
  );
}

/** Only `keep` stays walkable: every other scan point is disabled (no pucks, no walking). */
/**
 * Turns scan points off in small batches - one bad id must not leave the
 * rest open (a single call with hundreds of ids fails as a whole).
 */
async function disableSweeps(sdk: MpSdk, ids: string[]) {
  for (let i = 0; i < ids.length; i += 25) {
    const batch = ids.slice(i, i + 25);
    await sdk.Sweep.disable(...batch).catch(() => Promise.all(batch.map((id) => sdk.Sweep.disable(id).catch(() => {}))));
  }
}

/** "Kun punkter": only the scan point the visitor stands on stays open. */
function lockTo(sdk: MpSdk, all: string[], keep: string) {
  return Promise.all([sdk.Sweep.enable(keep).catch(() => {}), disableSweeps(sdk, all.filter((id) => id !== keep))]);
}

/** The tour's start point (MPSkins "Starting Point") as embed parameters. */
function startParams(href: string): Record<string, string> {
  try {
    const p = new URL(href).searchParams;
    return { ss: p.get("ss") ?? "", sr: p.get("rot") ? "" : p.get("sr") ?? "" };
  } catch {
    return {};
  }
}

function DevPanel({
  onCopyView,
  place,
  onCaptureStories,
  storyCount,
  tourError,
  sdkKey,
  modelId,
  pointsOnly,
  onPointsOnly,
}: {
  onCopyView: () => Promise<string>;
  place?: { placing: boolean; setPlacing: (on: boolean) => void; result: string | null };
  onCaptureStories?: (progress: (text: string) => void) => Promise<void>;
  storyCount: number;
  tourError: string | null;
  sdkKey: string | null;
  modelId: string | null;
  pointsOnly: boolean;
  onPointsOnly: (only: boolean) => void;
}) {
  const [capture, setCapture] = useState<string | null>(null);
  const [view, setView] = useState<string | null>(null);
  return (
    <div className="hv-devpanel">
      {!sdkKey && <p className="hv-warn">Mangler SDK-nøgle (sæt den på /tour-lab).</p>}
      {!modelId && <p className="hv-warn">Kunne ikke hente touren fra MPSkins.</p>}
      {tourError && <p className="hv-warn">{tourError}</p>}
      <p>
        <button type="button" className="hv-devbtn" onClick={() => onCopyView().then(setView)}>
          Kopiér dette udsyn
        </button>
        {view && <code className="hv-devcode">{view}</code>}
        {view?.startsWith("v(") && <span> Kopieret - brug den som link til et sted, et stop eller starten.</span>}
      </p>
      {place && (
        <p>
          <button type="button" className="hv-devbtn" onClick={() => place.setPlacing(!place.placing)}>
            {place.placing ? "Klik nu på stedet i touren… (annullér)" : "Placér infopunkt"}
          </button>
          {place.result && <code className="hv-devcode">{place.result}</code>}
          {place.result?.startsWith("{") && <span> Kopieret - sæt den ind under info i tourens opsætning.</span>}
        </p>
      )}
      <label className="hv-devcheck">
        <input type="checkbox" checked={pointsOnly} onChange={(e) => onPointsOnly(e.target.checked)} />
        Kun punkter (ingen fri gang - menu og punkter flytter dig)
      </label>
      {onCaptureStories && (
        <p>
          <button
            type="button"
            className="hv-devbtn"
            disabled={capture != null && !/^Færdig|^Fejl/.test(capture)}
            onClick={() => onCaptureStories(setCapture).catch((err) => setCapture(`Fejl: ${err instanceof Error ? err.message : err}`))}
          >
            Tag billeder til Historier ({storyCount} rum)
          </button>
          {capture && <span> {capture}</span>}
        </p>
      )}
      <p className="hv-devt">Hændelser:</p>
      <ul>
        {eventLog.slice(0, 12).map((e, i) => (
          <li key={i}>
            <b>{e.name}</b>{" "}
            {Object.entries(e.params)
              .filter(([k]) => k !== "tour")
              .map(([k, v]) => `${k}=${v}`)
              .join(" · ")}
          </li>
        ))}
      </ul>
    </div>
  );
}

const CSS = `
.hv-holder{position:absolute;left:50%;top:50%;translate:-50% -50%;z-index:35;display:flex;align-items:center;gap:10px;padding:12px 18px;border-radius:999px;background:rgba(10,18,20,.78);color:#fff;font-size:14.5px;font-weight:700;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);box-shadow:0 10px 30px rgba(0,0,0,.35);pointer-events:none;animation:hvFade .25s ease}
.hv-holder-spin{width:18px;height:18px;border-radius:50%;border:2.5px solid rgba(255,255,255,.3);border-top-color:#fff;animation:hvSpin .8s linear infinite}
@keyframes hvSpin{to{rotate:360deg}}
/* A tour is touched, not read: no text selection or iOS copy menu from a long press (it can't be dismissed over the tour). Fields stay selectable. */
/* clip, not just hidden: nothing (a scrollIntoView, a focused button) can scroll the tour itself sideways and show the hidden menu. */
.hv{overflow:clip;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent}
.hv input,.hv textarea{-webkit-user-select:text;user-select:text}
.hv *{box-sizing:border-box}
.hv .pnlm-load-box{background:rgba(21,50,58,.9)!important;border-radius:12px!important;font-family:inherit!important}
/* A 360° photo still loading: dark and calm (not pannellum's grey grid and "Loading..." box) - a thin bar shows it coming. */
.hv-pano .pnlm-container{background:#0d1b20!important}
.hv-pano .pnlm-load-box{background:transparent!important;width:180px!important;height:auto!important;margin:0!important;transform:translate(-50%,-50%);top:50%!important;left:50%!important;padding:0!important}
.hv-pano .pnlm-load-box p{display:none}
.hv-pano .pnlm-lbar{width:180px!important;height:3px!important;border:0!important;background:rgba(255,255,255,.15)!important;border-radius:2px;margin:0!important}
.hv-pano .pnlm-lbar-fill{background:#fff!important;border-radius:2px}
.hv-pano .pnlm-lmsg{display:none}
.hv-hs.hv-skjult{display:none!important}
.hv-hs:hover,.hv-hs.hv-aktiv{z-index:9}
.hv-hs.hv-aktiv .hv-ikon{transform:scale(1.18);box-shadow:0 0 0 4px rgba(255,255,255,.55),0 3px 10px rgba(0,0,0,.35)}
/* The icon's centre is the place it marks, so it stays put at every zoom; the name hangs below it. */
.hv-pkt{position:relative;transform:translate(-50%,-50%) scale(var(--pkt-d,1));cursor:pointer;pointer-events:none}
.hv-ikon,.hv-navn{pointer-events:auto}
.hv-ikon{width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;border:3px solid #fff;box-shadow:0 3px 10px rgba(0,0,0,.35);transition:transform .15s}
.hv-ikon svg{width:17px;height:17px}
.hv-navn{position:absolute;top:100%;left:50%;transform:translateX(-50%);margin-top:4px;background:#fff;border-radius:999px;padding:2px 10px;font-size:12.5px;font-weight:800;white-space:nowrap;color:#1d2a30;box-shadow:0 2px 8px rgba(0,0,0,.25)}
.hv-pkt:hover .hv-ikon{transform:scale(1.12)}
/* A name that would cover another point steps aside until its icon is hovered. */
/* While the drone picture loads: its points and boxes wait (nothing floats on black), the logo breathes in the middle - then all fade in together. */
.hv-intro,.hv-filtre,.pnlm-hotspot-base,.vj-chip,.hv-find-m{transition:opacity .5s ease}
.hv-laster .hv-intro,.hv-laster .hv-filtre,.hv-laster .pnlm-hotspot-base,.hv-laster .vj-chip,.hv-laster .hv-find-m{opacity:0!important;pointer-events:none}
.hv-laster-tegn{position:absolute;inset:0;z-index:3;display:flex;align-items:center;justify-content:center;pointer-events:none}
.hv-laster-tegn img{max-width:180px;max-height:70px;opacity:.85;animation:hvAande 1.8s ease-in-out infinite}
@keyframes hvAande{0%,100%{opacity:.35;transform:scale(.97)}50%{opacity:.9;transform:scale(1)}}
.hv-navn.hv-gemt{visibility:hidden;pointer-events:none}
.hv-pkt:hover .hv-navn.hv-gemt{visibility:visible}
@media (min-width:761px){
  .hv-navne-d-zoom .hv-navn{display:none}
  .hv-navne-d-zoom.hv-zoom .hv-navn,.hv-navne-d-zoom .hv-hs.hv-aktiv .hv-navn{display:block}
  .hv-navne-d-never .hv-hs .hv-navn{display:none}
  .hv-navne-d-zoom .hv-pkt:hover .hv-navn,.hv-navne-d-never .hv-pkt:hover .hv-navn{display:block}
}
.hv-intro{position:absolute;top:calc(16px + env(safe-area-inset-top,0px));left:16px;z-index:5;width:320px;background:var(--c-soft);border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,.28)}
.hv-intro-head{padding:18px 18px 14px;text-align:center}
.hv-intro-head img{height:54px;display:block;margin:0 auto 8px}
.hv-sub{font-size:9.5px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#9fb3ba}
.hv-intro-body{padding:14px 18px 16px}
.hv-intro-body h1{margin:0 0 4px;font-size:19px;font-weight:900;color:var(--c-main)}
.hv-intro-body p{margin:0 0 12px;font-size:14px;line-height:1.45;color:#5c6b72}
.hv-btn{display:flex;align-items:center;justify-content:center;padding:11px 16px;border-radius:999px;text-decoration:none;font-weight:800;font-size:15px;border:0;cursor:pointer;font-family:inherit}
.hv-primary{background:var(--c-accent);color:#fff}.hv-primary:hover{background:var(--c-accent-dark)}
.hv-secondary{background:#fff;color:var(--c-main);border:2px solid var(--c-main)}
.hv-wide{width:100%;margin-top:12px}
.hv-filtre{position:absolute;left:16px;bottom:16px;z-index:5;background:#fff;border-radius:14px;padding:10px 12px;box-shadow:0 8px 24px rgba(0,0,0,.25);max-width:calc(100% - 32px)}
.hv-filtre-t{font-size:12.5px;font-weight:800;margin:0 2px 8px;color:#5c6b72}
.hv-chips{display:flex;flex-wrap:wrap;gap:6px}
.hv-chips button{display:flex;align-items:center;gap:6px;border:1.5px solid #e3ddd1;background:#fff;border-radius:999px;padding:4px 11px 4px 5px;font-family:inherit;font-size:12.5px;font-weight:700;cursor:pointer;color:#1d2a30}
.hv-chips button i{width:16px;height:16px;border-radius:50%}
.hv-chips button.fra{opacity:.42}
.hv-panel{position:absolute;top:calc(66px + env(safe-area-inset-top,0px));right:16px;z-index:7;width:350px;max-height:calc(100% - 82px);overflow-y:auto;background:var(--c-soft);border-radius:16px;box-shadow:0 12px 36px rgba(0,0,0,.35);padding:18px 18px 18px;animation:hvIn .25s ease}
@keyframes hvIn{from{opacity:0;transform:translateX(16px)}to{opacity:1;transform:none}}
.hv-luk{position:absolute;z-index:2;top:10px;right:10px;width:32px;height:32px;border-radius:50%;border:0;background:#fff;font-size:19px;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.2)}
.hv-kat{font-size:11.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase}
.hv-panel h2{margin:2px 40px 8px 0;font-size:25px;line-height:1.1;font-weight:900;color:var(--c-main)}
.hv-panel p{margin:0 0 12px;font-size:15px;line-height:1.5;color:#3d4a50}
.hv-pchips{display:flex;flex-wrap:wrap;gap:5px}
.hv-pvideo{display:block;width:calc(100% + 36px);margin:-18px -18px 14px;aspect-ratio:16/9;background:#000;border-radius:16px 16px 0 0;object-fit:cover}
.hv-pkick{margin-top:6px;font-size:11.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#5e7d3a;color:color-mix(in srgb,var(--c-main) 70%,#5e7d3a)}
.hv-fakta{display:grid;grid-template-columns:1fr 1fr;gap:10px 14px;margin:0 0 12px;padding-top:12px;border-top:1px solid rgba(0,0,0,.08)}
.hv-fakta dt{font-size:12.5px;color:#6b7a80}
.hv-fakta dd{margin:1px 0 0;font-size:14px;font-weight:800;color:#1d2a30}
.hv-ptip{font-size:13px!important;color:#5a676c!important;background:rgba(0,0,0,.04);border-radius:10px;padding:8px 10px}
.hv-fotos{position:relative;margin:-18px -18px 14px;border-radius:16px 16px 0 0;overflow:hidden;background:#dfe5e7;aspect-ratio:16/10;cursor:pointer;user-select:none}
.hv-foto{position:absolute;inset:0;opacity:0;transition:opacity .35s ease}
.hv-foto.on{opacity:1}
.hv-foto img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}
.hv-foto img.hv-foto-bag{object-fit:cover;filter:blur(18px) brightness(.85);transform:scale(1.15)}
.hv-fotos-stor{position:absolute;right:10px;bottom:9px;padding:3px 8px;border-radius:999px;background:rgba(0,0,0,.5);color:#fff;font-size:11.5px;font-weight:700;pointer-events:none;backdrop-filter:blur(4px)}
.hv-fotos-pil{position:absolute;top:50%;translate:0 -50%;width:30px;height:30px;border:0;border-radius:50%;background:rgba(255,255,255,.85);color:#1d2a30;font-size:20px;line-height:1;cursor:pointer;opacity:0;transition:opacity .2s}
.hv-fotos:hover .hv-fotos-pil{opacity:1}
.hv-fotos-forrige{left:8px}.hv-fotos-naeste{right:8px}
@media (hover:none){.hv-fotos-pil{display:none}}
/* The guide shows a 360° photo under its card. */
.hv-guiding .hv-pano{z-index:10}
/* "Vis mig rundt" at a picture: full screen, under the guide's card. */
.hv-guide-bilde{position:absolute;inset:0;z-index:10;display:flex;align-items:center;justify-content:center;background:#0d1b20;animation:hvFade .4s ease}
.hv-guide-bilde{overflow:hidden}
.hv-guide-bilde img{position:relative;width:100%;height:100%;object-fit:contain}
.hv-guide-bilde-bag{position:absolute;inset:-40px;background-size:cover;background-position:center;filter:blur(28px) brightness(.5) saturate(1.2)}
@media (max-width:760px) and (orientation:portrait){
  .hv-guide-bilde img.bred{flex:none;width:auto;height:100%;max-width:none;object-fit:cover;animation:hvGlid 18s ease-in-out infinite alternate}
}
@keyframes hvGlid{from{transform:translateX(calc(50% - 50vw))}to{transform:translateX(calc(50vw - 50%))}}
@media (prefers-reduced-motion:reduce){.hv-guide-bilde img.bred{animation:none}}
/* "Vis mig rundt" on a 360° photo: the menu button stays on top of it, so the visitor can leave the guide for a place. */
.hv-guiding .hv-menuknap,.hv-guiding .bm-knap,.hv-guiding .sp-menuknap{z-index:14}
.hv-guiding .hv-pano-luk,.hv-guiding .hv-pano-titel{display:none}
.hv-fotos-dots{position:absolute;left:0;right:0;bottom:9px;display:flex;justify-content:center;gap:5px;pointer-events:none}
.hv-fotos-dots i{width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,.55);box-shadow:0 1px 3px rgba(0,0,0,.3)}
.hv-fotos-dots i.on{background:#fff;width:16px;border-radius:3px}
.hv-fotos+.hv-kat{margin-top:0}
.hv-pchips span{background:#e7eef0;color:var(--c-main);font-size:12px;font-weight:700;padding:4px 9px;border-radius:999px}
.hv-note{font-size:13px!important;color:#7a8a90!important;margin-top:12px!important}
.hv-ledig{margin-left:7px;padding:1px 7px;border-radius:999px;background:#34c75922;color:#1f8a3a;font-size:11px;font-weight:700;vertical-align:1px}
.hv-live-knap{display:flex;align-items:center;gap:8px}
.hv-live-knap i,.hv-live-chip i{width:8px;height:8px;border-radius:50%;background:#34c759;box-shadow:0 0 0 3px #34c75944;animation:hvLive 1.6s ease-in-out infinite}
.hv-live-knap span{margin-left:auto;padding:1px 8px;border-radius:999px;background:var(--c-accent);color:#fff;font-size:12px}
@keyframes hvLive{50%{box-shadow:0 0 0 6px #34c75911}}
.hv-live-chip{position:absolute;top:calc(74px + env(safe-area-inset-top,0px));right:16px;z-index:6;display:flex;align-items:center;gap:8px;padding:8px 14px;border:0;border-radius:999px;background:rgba(255,255,255,.95);color:#1d2a30;font:700 13px inherit;font-family:inherit;box-shadow:0 6px 18px rgba(0,0,0,.2);cursor:pointer}
.hv-live{position:absolute;inset:0;z-index:35;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.35);animation:hvFade .2s ease}
.hv-live-sheet{width:min(520px,100%);max-height:78%;display:flex;flex-direction:column;margin:0 12px 12px;border-radius:20px;background:#fff;color:#1d2a30;box-shadow:0 20px 60px rgba(0,0,0,.4);animation:hvUp .3s cubic-bezier(.2,.7,.2,1) both}
.hv-live-head{display:flex;align-items:baseline;gap:10px;padding:16px 18px 10px}
.hv-live-head b{font-family:var(--font-heading);font-size:20px;color:var(--c-main)}
.hv-live-head span{font-size:13px;color:#6b7a80}
.hv-live-head button{margin-left:auto;width:32px;height:32px;border:0;border-radius:50%;background:#f1f2f3;font-size:20px;cursor:pointer}
.hv-live-sheet ul{min-height:0;margin:0;padding:0 10px 12px;list-style:none;overflow-y:auto;overscroll-behavior:contain}
.hv-live-sheet li{display:flex;align-items:center;gap:12px;padding:10px 8px;border-top:1px solid #eef0f1}
.hv-live-sheet li>span{flex:1;min-width:0}
.hv-live-sheet li b{display:block;font-size:15px}
.hv-live-sheet li small{display:block;font-size:12.5px;color:#6b7a80}
.hv-live-sheet li em{font-style:normal;font-weight:800;font-size:14px;color:var(--c-main);white-space:nowrap}
.hv-live-sheet .hv-btn{flex:none;padding:8px 14px;font-size:13px}
@media (max-width:760px){.hv-live-chip{top:62px;right:12px}.hv-live-sheet{margin:0;border-radius:20px 20px 0 0;max-height:85%}}
.hv-pick{position:absolute;top:calc(16px + env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%);z-index:30;padding:9px 16px;border-radius:999px;background:rgba(0,0,0,.75);color:#fff;font-size:14px;font-weight:700;pointer-events:none;backdrop-filter:blur(8px)}
.hv-logo{position:absolute;top:calc(var(--logo-top,14px) + env(safe-area-inset-top,0px));left:var(--logo-side,16px);height:var(--logo-h);width:auto;max-width:min(320px,40vw);object-fit:contain;z-index:6;filter:drop-shadow(0 2px 6px rgba(0,0,0,.35))}
/* A dark logo gets a light card, so it reads on any wall. */
/* A dark logo straight on the tour, no card and no glow - exactly as it is (as in MPSkins). */
.hv-logo-lys{filter:none}
/* What's behind the logo, when chosen (else automatic from whether it's a dark or a light logo). */
/* The logo at the top of the tour… */
.hv-logobg-none .hv-logo{background:none;box-shadow:none;padding:0;filter:none}
.hv-logobg-light .hv-logo,.hv-logobg-main .hv-logo{box-sizing:content-box;height:calc(var(--logo-h) - 12px);padding:9px 14px;border-radius:14px;filter:none;box-shadow:0 6px 18px rgba(0,0,0,.18)}
.hv-logobg-light .hv-logo{background:rgba(255,255,255,.94)}
.hv-logobg-main .hv-logo{background:var(--c-main)}
/* …and on the welcome tiles' box - each its own setting. */
.hv-tlogobg-none .hv-wel-main img{background:none;padding:0;border-radius:0}
.hv-tlogobg-light .hv-wel-main img{background:#fff;padding:8px;border-radius:12px;box-shadow:0 0 0 1px rgba(0,0,0,.06)}
.hv-tlogobg-main .hv-wel-main img{background:var(--c-main);padding:8px;border-radius:12px}
/* Where it sits in the box: in the middle (standard), left or right - always the same place. */
.hv-wel-main img{display:block;object-position:center}
.hv-tlogo-midt .hv-wel-main img{align-self:center;margin-left:auto;margin-right:auto;object-position:center}
.hv-tlogo-left .hv-wel-main img{align-self:flex-start;margin-right:auto;object-position:left}
.hv-tlogo-right .hv-wel-main img{align-self:flex-end;margin-left:auto;object-position:right}
.hv-logo-kort{box-sizing:content-box;height:calc(var(--logo-h) - 12px);padding:9px 14px;border-radius:14px;background:rgba(255,255,255,.94);filter:none;box-shadow:0 6px 18px rgba(0,0,0,.18)}
.hv-signatur{display:flex;align-items:center;justify-content:center;gap:8px;padding:6px 22px 22px;font-size:11px;letter-spacing:.04em;color:#7b878c;text-decoration:none}
.hv-signatur img{height:14px;width:auto;opacity:.85}
.hv-signatur:hover{color:#1d2a30}
.hv-luften{position:absolute;left:16px;bottom:20px;z-index:6;display:flex;align-items:center;gap:8px;background:var(--c-main);color:#fff;border:0;border-radius:999px;padding:11px 18px;font:800 14px inherit;font-family:inherit;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.3)}
.hv-luften svg{width:18px;height:18px}
.hv-room{position:absolute;left:50%;bottom:22px;transform:translateX(-50%);z-index:6;background:rgba(255,255,255,.95);color:var(--c-main);border-radius:999px;padding:8px 16px;font-weight:800;font-size:14px;box-shadow:0 4px 14px rgba(0,0,0,.25)}
.hv-menuknap{position:absolute;top:calc(14px + env(safe-area-inset-top,0px));right:14px;z-index:9;background:var(--c-main);color:#fff;border:0;border-radius:999px;padding:9px 18px;font-weight:800;font-size:14px;font-family:inherit;letter-spacing:.08em;text-transform:uppercase;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.3)}
.hv-menu{position:absolute;top:0;right:0;bottom:0;z-index:8;width:320px;max-width:100%;background:rgba(255,255,255,.98);overflow-y:auto;transform:translateX(105%);transition:transform .3s ease;box-shadow:-10px 0 30px rgba(0,0,0,.25)}
.hv-menu.aaben{transform:none}
.hv-menu-slor{position:absolute;inset:0;z-index:7;border:0;padding:0;background:rgba(8,14,16,.38);opacity:0;pointer-events:none;transition:opacity .3s ease;cursor:default}
.hv-menu-aaben .hv-menu-slor{opacity:1;pointer-events:auto}
/* An open menu lies over everything on the drone scene / map (a chosen point, its card) - not under it. */
.hv-menu-aaben .hv-menu-slor{z-index:12}
.hv-menu-aaben .hv-menu{z-index:13}
.hv-menu-aaben .hv-menuknap{z-index:14}
/* An open menu has the stage: the bars at the bottom slide away and come back when it closes. */
.hv-stories,.hv-room,.hv-luften,.hv-filtre{transition:opacity .25s ease,translate .3s ease}
.hv-menu-aaben :is(.hv-stories,.hv-room,.hv-luften,.hv-filtre){opacity:0;translate:0 24px;pointer-events:none}
.hv-menu-aaben .hv-stories>*{pointer-events:none}
.hv-menu-head{padding:56px 20px 16px;text-align:center;color:#fff}
.hv-menu-head img{height:58px;width:auto;max-width:220px;object-fit:contain;display:block;margin:0 auto 10px}
.hv-menu-titel{font-size:20px;font-weight:800;letter-spacing:.08em}
.hv-gruppe{border-bottom:1px solid #e6eaeb}
.hv-gtitel{display:flex;justify-content:space-between;align-items:center;width:100%;padding:12px 22px;border:0;background:none;font:600 16px inherit;font-family:inherit;color:var(--c-main);cursor:pointer;text-align:left}
.hv-gtitel:hover{color:var(--c-accent)}
.hv-enkel{border-bottom:1px solid #e6eaeb}
.hv-items{padding:0 0 8px}
.hv-items button{display:block;width:100%;text-align:left;padding:5px 22px 5px 36px;border:0;background:none;font:400 14.5px inherit;font-family:inherit;color:#4a6168;cursor:pointer}
.hv-items button:hover{color:var(--c-accent)}
.hv-ext{margin-left:6px;font-size:12px;color:var(--c-accent-dark)}
.hv-light{color:var(--c-main)!important;border-bottom:1px solid #e6eaeb}
.hv-light img{width:auto!important;height:auto!important;max-width:180px;max-height:64px}
.hv-light .hv-menu-titel{display:none}
.hv-light .hv-sub{color:#7a8a90}
.hv-contact{margin:0 22px 26px;padding:14px 16px;border-radius:14px;background:var(--c-soft);display:flex;flex-direction:column;gap:8px}
.hv-contact-t{font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#7a8a90}
.hv-contact a{display:flex;gap:8px;align-items:center;overflow-wrap:anywhere;min-width:0;color:var(--c-main);text-decoration:none;font-size:14px;font-weight:600}
.hv-contact a:hover{color:var(--c-accent-dark)}
.hv-ci{flex:none;width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;opacity:.65}
.hv-contact-form .hv-ci{opacity:.9}
.hv-social{display:flex;flex-wrap:wrap;gap:14px;margin-top:4px}
.hv-contact .hv-social a{width:34px;height:34px;justify-content:center;border-radius:10px;transition:transform .15s}
.hv-contact .hv-social a:hover{transform:translateY(-2px)}
.hv-social svg{width:30px;height:30px}
.hv-menu-cta{padding:14px 22px 24px;display:flex;flex-direction:column;gap:8px}
.hv-pano{position:absolute;inset:0;z-index:15;background:#0d1b20;animation:hvFade .4s ease}
/* The sharp copy waits unseen over the small one until it has drawn, then fades in. */
.hv-pano-skarp{opacity:0;pointer-events:none;transition:opacity .35s ease}
.hv-pano-skarp.hv-pano-skarp-vist{opacity:1;pointer-events:auto}
@keyframes hvFade{from{opacity:0}to{opacity:1}}
.hv-pano-titel{position:absolute;top:calc(16px + env(safe-area-inset-top,0px));left:16px;z-index:2;background:rgba(21,50,58,.9);color:#fff;font-weight:800;font-size:16px;padding:8px 16px;border-radius:999px}
.hv-pano-luk{position:absolute;left:16px;bottom:20px;z-index:2;background:var(--c-main);color:#fff;border:0;border-radius:999px;padding:11px 18px;font-weight:800;font-size:14px;font-family:inherit;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.3)}
.hv-wel{position:absolute;inset:0;z-index:12;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(13,27,32,.38);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);animation:hvFade .45s ease}
.hv-wel-grid{display:grid;grid-template-columns:1.6fr 1fr 1fr;grid-auto-rows:minmax(150px,auto);gap:16px;width:100%;max-width:1000px}
.hv-wel-main{grid-row:span 2;background:var(--c-soft);border-radius:20px;padding:28px 28px 22px;display:flex;flex-direction:column;animation:hvUp .6s cubic-bezier(.2,.7,.2,1)}
.hv-film{position:absolute;inset:0;z-index:30;background:#000;transition:opacity .9s ease}
.hv-film.ude{opacity:0;pointer-events:none}
.hv-film video{position:relative;width:100%;height:100%;object-fit:cover}
/* Upright phone: the wide film zoomed just enough to keep its middle (the logo), on a blurred copy of itself. */
@media (max-aspect-ratio:1/1){
  .hv-film::before{content:"";position:absolute;inset:-40px;background:var(--poster) center/cover;filter:blur(24px) brightness(.6)}
  .hv-film video{position:absolute;top:50%;left:50%;width:190%;max-width:none;height:auto;transform:translate(-50%,-50%)}
  .hv-film video{-webkit-mask-image:linear-gradient(transparent,#000 12%,#000 88%,transparent);mask-image:linear-gradient(transparent,#000 12%,#000 88%,transparent)}
}
.hv-film button{position:absolute;right:20px;bottom:24px;border:1px solid rgba(255,255,255,.5);background:rgba(0,0,0,.35);color:#fff;border-radius:999px;padding:9px 18px;font:inherit;font-weight:700;font-size:13px;letter-spacing:.06em;cursor:pointer;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
.hv-wel-main.hv-light img{width:auto;height:64px;max-width:200px;object-fit:contain;object-position:left;padding:0;background:none;border-radius:0}
.hv-wel-main img{box-sizing:border-box;height:56px;width:auto;min-width:56px;max-width:220px;object-fit:contain;background:var(--c-main);border-radius:12px;padding:8px;margin-bottom:18px}
.hv-wel-kick{font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#7a8a90}
.hv-wel-main h1{margin:6px 0 10px;font-size:42px;line-height:1.02;font-weight:900;color:var(--c-main);letter-spacing:-.01em;text-wrap:balance}
.hv-wel-main p{margin:0;font-size:16px;line-height:1.55;color:#3d4a50}
.hv-wel-skip{margin-top:auto;padding-top:18px;align-self:flex-start;border:0;background:none;font:800 13px inherit;font-family:inherit;letter-spacing:.1em;text-transform:uppercase;color:var(--c-main);cursor:pointer;opacity:.7}
.hv-wel-skip:hover{opacity:1}
.hv-tile{position:relative;border:0;border-radius:20px;padding:18px;text-align:left;cursor:pointer;display:flex;flex-direction:column;justify-content:flex-end;font-family:inherit;min-height:150px;transition:transform .25s,box-shadow .25s;animation:hvUp .6s cubic-bezier(.2,.7,.2,1) both}
.hv-tile:nth-child(2){animation-delay:.05s}.hv-tile:nth-child(3){animation-delay:.1s}.hv-tile:nth-child(4){animation-delay:.15s}.hv-tile:nth-child(5){animation-delay:.2s}.hv-tile:nth-child(6){animation-delay:.25s}.hv-tile:nth-child(7){animation-delay:.3s}
@keyframes hvUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
.hv-tile:hover{transform:translateY(-4px);box-shadow:0 18px 40px rgba(0,0,0,.35)}
.hv-tile small{padding-right:30px;font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;opacity:.75;margin-bottom:4px}
.hv-tile b{font-size:24px;line-height:1.05;font-weight:900}
.hv-tile em+.hv-tile-plus+small{margin-top:10px}
.hv-tile em{align-self:flex-start;margin:-4px 0 auto -4px;font-style:normal;font-size:10.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;padding:3px 9px;border-radius:999px;background:var(--c-accent);color:#fff}
.hv-tile-plus{position:absolute;top:14px;right:14px;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:16px}
.hv-tile-light{background:#fff;color:var(--c-main)}.hv-tile-light .hv-tile-plus{background:var(--c-main);color:#fff}
.hv-tile-dark{background:var(--c-main);color:#fff}.hv-tile-dark .hv-tile-plus{background:#fff;color:var(--c-main)}
.hv-tile-accent{background:var(--c-accent);color:#fff}.hv-tile-accent em{background:rgba(255,255,255,.24)}.hv-tile-accent .hv-tile-plus{background:#fff;color:var(--c-accent)}
.hv-tile-foto{background-size:cover;background-position:center;color:#fff;text-shadow:0 1px 8px rgba(0,0,0,.35)}.hv-tile-foto small{opacity:.9}.hv-tile-foto .hv-tile-plus{background:#fff;color:var(--c-main);text-shadow:none}
.hv-tile-last{background:#e7eef0;color:var(--c-main)}.hv-tile-last .hv-tile-plus{background:var(--c-main);color:#fff}
.hv-wel-x{position:absolute;top:calc(16px + env(safe-area-inset-top,0px));right:16px;width:44px;height:44px;border-radius:12px;border:0;background:rgba(255,255,255,.92);font-size:24px;cursor:pointer;color:var(--c-main)}
.hv-welcome .hv-intro,.hv-welcome .hv-filtre,.hv-welcome .hv-menuknap{opacity:0;pointer-events:none}
.hv-dev{position:absolute;right:12px;bottom:12px;z-index:20;font-family:system-ui,sans-serif}
.hv-dev>button{background:rgba(0,0,0,.65);color:#fff;border:0;border-radius:8px;padding:5px 10px;font-size:11px;cursor:pointer}
.hv-devpanel{position:absolute;right:0;bottom:30px;width:340px;max-height:60vh;overflow-y:auto;background:#fff;border-radius:10px;padding:12px;font-size:12px;box-shadow:0 10px 30px rgba(0,0,0,.35);color:#1d2a30}
.hv-devpanel form{display:flex;gap:6px;align-items:center;margin-bottom:6px}
.hv-devpanel input{flex:1;min-width:0;border:1px solid #cbd5d8;border-radius:6px;padding:4px 6px}
.hv-devpanel form button{background:#1d2a30;color:#fff;border:0;border-radius:6px;padding:4px 10px;cursor:pointer}
.hv-devpanel ul{margin:4px 0 0;padding:0 0 0 14px}
.hv-devpanel li{margin:2px 0}
.hv-devt{margin:8px 0 0;font-weight:700}
.hv-warn{color:#b81c17;margin:0 0 6px}
.hv-devcode{display:block;margin-top:6px;padding:6px;background:#f1f2f3;border-radius:6px;font-size:11px;word-break:break-all;user-select:all}
.hv-devbtn{background:#1d2a30;color:#fff;border:0;border-radius:6px;padding:5px 10px;cursor:pointer}
.hv-devcheck{display:flex;gap:6px;align-items:center;margin:0 0 8px;font-weight:600}
/* An open point: the welcome box and the filter step aside so they don't cover other points. */
.hv-punkt .hv-intro,.hv-punkt .hv-filtre{opacity:0;pointer-events:none}
.hv-intro{transition:opacity .25s}
/* Switched off in the editor (Luftfoto og kort → Over kortet), per device. */
@media (min-width:761px){.hv-boks-ud-d .hv-intro,.hv-filter-ud-d .hv-filtre{display:none}}
@media (max-width:760px){.hv-boks-ud-m .hv-intro,.hv-filter-ud-m .hv-filtre{display:none}}
/* The points' names (Luftfoto og kort → Over kortet), per device - after the defaults further down, so they win. */
@media (max-width:760px){
  /* Slim welcome bar instead of the big card, with room for the menu button. */
  .hv-intro{top:calc(10px + env(safe-area-inset-top,0px));left:10px;right:104px;width:auto;display:flex;align-items:center;border-radius:14px}
  .hv-intro-head{padding:8px 10px;flex:none}
  .hv-intro-head img{height:30px;margin:0}
  /* One box on phones: the logo stands straight on it (no box of its own) - on the tour's colour when the logo is light. */
  .hv-intro-head{background:transparent!important}
  .hv-intro-moerk{background:var(--c-main)}
  .hv-intro-moerk .hv-intro-body h1{color:#fff}
  .hv-intro .hv-sub{display:none}
  .hv-intro-body{padding:6px 10px;min-width:0;display:flex;flex-direction:column;gap:5px}
  .hv-intro-body h1{font-size:13.5px;line-height:1.2;margin:0;overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;text-wrap:balance}
  .hv-intro-body p{display:none}
  .hv-intro .hv-btn{padding:6px 10px;font-size:12.5px}
  .hv-menuknap{top:calc(12px + env(safe-area-inset-top,0px));right:10px;padding:10px 16px;font-size:13px}
  /* Categories: one row you can swipe. */
  .hv-filtre{left:10px;right:10px;bottom:calc(10px + env(safe-area-inset-bottom,0px));max-width:none;padding:7px 8px}
  .hv-filtre-t{display:none}
  /* All categories in rows (as many as fit), a size a thumb hits - or one row to scroll (filterScroll), or rows of 2-4 (filterColumns). */
  .hv-chips{gap:6px}
  .hv-chips button{font-size:13.5px;padding:6px 12px 6px 6px}
  .hv-chips button i{width:18px;height:18px}
  .hv-filter-rul .hv-chips{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none}
  .hv-filter-rul .hv-chips::-webkit-scrollbar{display:none}
  .hv-filter-rul .hv-chips button{flex:none}
  /* Rows of 2-4 (set under Luftfoto og kort): every category seen at once, long names cut short. */
  .hv-filter-kol .hv-chips{display:grid;overflow:visible;gap:5px}
  .hv-filter-kol-2 .hv-chips{grid-template-columns:repeat(2,minmax(0,1fr))}
  .hv-filter-kol-3 .hv-chips{grid-template-columns:repeat(3,minmax(0,1fr))}
  .hv-filter-kol-4 .hv-chips{grid-template-columns:repeat(4,minmax(0,1fr))}
  .hv-filter-kol .hv-chips button{min-width:0;padding:4px 8px 4px 4px}
  .hv-filter-kol-4 .hv-chips button{font-size:11px;gap:4px}
  .hv-filter-kol .hv-chips button i{flex:none}
  .hv-filter-kol .hv-chips button span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  /* Only icons until you zoom in - the names crowd each other on a narrow screen. The open point keeps its name. */
  .hv-navn{display:none;font-size:11px;padding:1px 8px}
  .hv-zoom .hv-navn,.hv-hs.hv-aktiv .hv-navn{display:block}
  .hv-navne-m-always .hv-navn{display:block}
  .hv-navne-m-never .hv-hs .hv-navn,.hv-navne-m-never.hv-zoom .hv-hs .hv-navn{display:none}
  .hv-ikon{width:30px;height:30px;border-width:2px}.hv-ikon svg{width:15px;height:15px}
  /* Smaller on a phone (set under Luftfoto og kort) - the icon's centre stays on its place. */
  .hv-pkt{transform:translate(-50%,-50%) scale(var(--pkt-m,.85))}
  /* An open point: the panel takes the bottom, the bars step aside. */
  .hv-panel{top:auto;bottom:0;left:0;right:0;width:auto;max-height:62%;border-radius:18px 18px 0 0;padding-bottom:calc(18px + env(safe-area-inset-bottom,0px))}
  .hv-fotos{aspect-ratio:auto;height:min(44vw,200px);border-radius:18px 18px 0 0;margin-bottom:10px}
  /* A compact card: short text (tap for all), the chips in one row, the buttons always at the bottom. */
  .hv-panel{padding-top:14px}
  .hv-panel h2{font-size:21px;margin-bottom:5px}
  .hv-ptekst{font-size:14px!important;line-height:1.45!important;margin-bottom:8px!important;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden;cursor:pointer}
  .hv-ptekst.aaben{display:block}
  .hv-pchips{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;margin:0 -18px;padding:0 18px}
  .hv-pchips::-webkit-scrollbar{display:none}
  .hv-pchips span{flex:none}
  .hv-gaa{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;margin:0 -18px 8px;padding:0 18px}
  .hv-gaa button{flex:none}
  .hv-pknapper{position:sticky;bottom:calc(-18px - env(safe-area-inset-bottom,0px));z-index:2;display:flex;gap:8px;margin:10px -18px calc(-18px - env(safe-area-inset-bottom,0px));padding:10px 18px calc(12px + env(safe-area-inset-bottom,0px));background:var(--c-soft);box-shadow:0 -8px 16px -12px rgba(0,0,0,.25)}
  .hv-pknapper:empty{display:none}
  .hv-pknapper{flex-wrap:wrap}
  .hv-pknapper .hv-wide{margin-top:0;flex:1 1 40%;min-width:0;padding-left:10px;padding-right:10px;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .hv-logo{height:calc(var(--logo-h) * .74);max-width:45vw;top:calc(var(--logo-top,12px) + env(safe-area-inset-top,0px));left:var(--logo-side,12px)}
  .hv-logo-kort{height:calc(var(--logo-h) * .74 - 8px);padding:7px 10px;border-radius:11px}
  .hv-menu{width:100%}
  .hv-room{bottom:76px}
  /* A place card has that spot - the room's name steps aside while it shows. */
  .hv-med-kort .hv-room,.hv-med-kort .rt-knap{opacity:0;pointer-events:none}
  .hv-dev{bottom:calc(64px + env(safe-area-inset-bottom,0px));right:10px}
  .hv-dev>button{font-size:10px;padding:3px 7px}
  .hv-punkt .hv-dev{display:none}
  .hv-wel{align-items:flex-start;padding:12px;overflow-y:auto}
  .hv-wel-grid{grid-template-columns:1fr 1fr;gap:10px;grid-auto-rows:auto}
  .hv-wel-main{grid-column:span 2;grid-row:auto;padding:16px 18px}
  .hv-wel-main img{height:40px;min-width:40px;max-width:160px;padding:6px;margin-bottom:10px}
  .hv-wel-kick{display:none}
  .hv-wel-main h1{font-size:26px;margin-top:0}
  .hv-wel-main p{font-size:14px}
  .hv-wel-skip{padding-top:10px;font-size:12px}
  .hv-tile{min-height:112px;padding:14px;border-radius:16px}
  .hv-tile b{font-size:18px}
  .hv-wel-x{top:calc(10px + env(safe-area-inset-top,0px));right:10px;width:38px;height:38px}
  .hv-devpanel{width:calc(100vw - 20px)}
}
/*
 * A phone on its side: wider than the phone layout's 760 px, but only ~350-430 px high - the computer layout would cover
 * the tour. Everything on top of the tour is drawn smaller (the 3D view and the drone picture stay as they are), and
 * whole-screen layers (welcome, sheets) scroll instead of being cut off. The notch side is kept clear.
 */
@media (max-height:500px) and (min-width:500px){
  .gd-card,.gd-bars,.hv-intro,.hv-panel,.ip-card,.hv-menuknap,.bm-knap,.ls,.hv-logo,.hv-filtre,.hv-luften,.hv-room,.hv-live-chip,
  .hv-pano-luk,.hv-pano-titel,.hv-pick,.rt-knap,.vj-chip,.vj-kort,.km-soeg,.km-zoom,.pk,.pk-mini,.dz-dock,.dz-here,.dz-sheet,.dy-bar,.fb-bar,.fb-tab,.hv-maal,.pc,.hv-find-m,
  .hv-stories > *,.hv-menu > *,.hv-wel > *,.bm > *,.hv-live > *,.dy > *,.fd > *,.cf-bg > *,.ob > *,.dz-cover > *{zoom:var(--ui-zoom,.72)}
  .hv-wel > *,.dz-cover > *{zoom:calc(var(--ui-zoom,.72) * .83)}
  .hv-wel,.bm,.hv-live,.dy,.fd,.cf-bg,.ob{overflow-y:auto;-webkit-overflow-scrolling:touch;align-items:flex-start}
  .hv-menu{overflow-y:auto}
  .gd-card{max-height:calc((100dvh - 24px) / var(--ui-zoom,.72));overflow-y:auto}
  .gd-card,.hv-intro,.hv-filtre,.hv-luften{left:max(16px,env(safe-area-inset-left,0px))}
  .hv-menuknap,.bm-knap{right:max(14px,env(safe-area-inset-right,0px))}
}
/* An upright phone: the floating parts drawn to the phone's size (--ui-zoom, 0.86-1 - a small phone a little smaller). */
@media (max-width:760px) and (min-height:501px){
  .gd-card,.gd-bars,.hv-intro,.hv-panel,.ip-card,.hv-menuknap,.bm-knap,.ls,.hv-logo,.hv-filtre,.hv-luften,.hv-room,.hv-live-chip,.hv-find-m,
  .hv-pano-luk,.hv-pano-titel,.hv-pick,.rt-knap,.vj-chip,.vj-kort,.km-soeg,.km-zoom,.pk,.pk-mini,.dz-dock,.dz-here,.dy-bar,.hv-maal,.pc,
  .hv-menu > *,.hv-wel > *,.dz-cover > *{zoom:var(--ui-zoom,1)}
  .gd-card{max-height:calc((100dvh - 120px) / var(--ui-zoom,1));overflow-y:auto}
}
`;

/* The logo in the right corner: the menu button, its panel and what sits under it change to the left. */
const LOGO_RIGHT_CSS = `
.hv-logo-h .hv-logo{left:auto;right:var(--logo-side,16px)}
.hv-logo-h .hv-menuknap,.hv-logo-h .sp-menuknap,.hv-logo-h .hv-maal{right:auto;left:14px}
.hv-logo-h .hv-live-chip,.hv-logo-h .hv-panel{right:auto;left:16px}
.hv-logo-h .hv-menu{right:auto;left:0;transform:translateX(-105%);box-shadow:10px 0 30px rgba(0,0,0,.25)}
.hv-logo-h .hv-menu.aaben{transform:none}
.hv-logo-h .sp-menu-top{flex-direction:row-reverse}
@media (max-width:760px){
  .hv-logo-h .hv-logo{left:auto;right:var(--logo-side,12px)}
  .hv-logo-h .hv-menuknap,.hv-logo-h .sp-menuknap{right:auto;left:10px}
  .hv-logo-h .hv-live-chip{right:auto;left:12px}
  .hv-logo-h .hv-panel{left:0;right:0}
  .hv-logo-h .hv-intro{left:104px;right:10px}
}
`;

/** The contact box's icons - thin lines in the tour's own colour (not emoji). */
const CONTACT_ICONS = {
  pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  phone: '<path d="M6.6 3.5h2.6l1.4 4-1.9 1.3a12 12 0 0 0 6.5 6.5l1.3-1.9 4 1.4v2.6a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2z"/>',
  mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m4 7 8 6 8-6"/>',
  write: '<path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-4-4L4 16v4z"/><path d="m13.5 6.5 4 4"/>',
};

function ContactIcon({ kind }: { kind: keyof typeof CONTACT_ICONS }) {
  return <svg className="hv-ci" viewBox="0 0 24 24" aria-hidden dangerouslySetInnerHTML={{ __html: CONTACT_ICONS[kind] }} />;
}
