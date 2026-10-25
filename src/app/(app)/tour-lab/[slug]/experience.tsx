"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveTourGa4Id, saveTourStoryImage } from "@/lib/actions/tour-lab";
import { connectSdk, showcaseUrl, uLinkTarget, type CameraPose, type MpSdk, type SweepInfo, type Vec3 } from "../matterport";
import type { AvailableUnit } from "@/lib/availability/boxdepotet";
import type { MenuEntry, TourConfig, TourPlace, TourPoint, WelcomeGo } from "../tours/types";
import { CoverWelcome, DESIGNS_CSS, DockMenu, PickerMenu } from "./designs";
import { GUIDE_CSS, GuidePlayer, guideStops } from "./guide";
import { INFO_CSS, InfoDots, usePlaceInfo } from "./info";
import { MAP_CSS, MapScene, type MapApi } from "./map";
import { ROUTE_CSS, RouteLine, RouteSheet, RouteStatus, flightMs, shortestPath, straighten, type Destination, type RouteGraph } from "./wayfinding";
import { LINKS_CSS, LinkPopup, LinkProvider, TourLink, openLink, type LinkPopupState } from "./links";
import { Stories, STORIES_CSS, storyJpeg, type StoryRoom } from "./stories";
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
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/** Bundled with Arpo (npm "pannellum"), not fetched from a CDN - the tour shouldn't depend on one. */
async function loadPannellum(): Promise<void> {
  if (window.pannellum) return;
  // The build is a plain script that sets window.pannellum.
  await import("pannellum/build/pannellum.js");
}

/* ---------------------------------------------------------------------------
 * GA4: every interaction in the tour becomes an event. Without a measurement
 * id the events are still shown in the event log, so the tracking plan can
 * be checked before it's connected.
 * ------------------------------------------------------------------------- */
type TrackedEvent = { name: string; params: Record<string, string | number>; at: number };
const eventLog: TrackedEvent[] = [];
const logListeners = new Set<() => void>();

function track(name: string, params: Record<string, string | number> = {}) {
  const full = { tour: "halvorsminde", ...params };
  window.gtag?.("event", name, full);
  eventLog.unshift({ name, params: full, at: Date.now() });
  eventLog.length = Math.min(eventLog.length, 30);
  logListeners.forEach((l) => l());
}

function useGa4(id: string | null, title: string) {
  useEffect(() => {
    if (!id || window.gtag) return;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() {
      // gtag.js expects the arguments object itself, not an array.
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    };
    window.gtag("js", new Date());
    window.gtag("config", id, { page_title: title });
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
    document.head.appendChild(s);
  }, [id, title]);
}

/* ---------------------------------------------------------------------------
 * Icons (from the drone page) and small helpers.
 * ------------------------------------------------------------------------- */
const ICONS: Record<string, string> = {
  seng: '<path d="M3 18v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5M3 18v2M21 18v2M3 13h18M6 11V9a2 2 0 0 1 2-2h3"/>',
  mad: '<path d="M7 3v8a2 2 0 0 0 2 2v8M5 3v5M9 3v5M17 3c-2 0-3 2-3 5s1 4 3 4v9"/>',
  sofa: '<path d="M4 11V8a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v3M3 11h18v6H3zM6 17v2M18 17v2"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4"/>',
  skrue: '<path d="M14 7l3-3 3 3-3 3M14 7l-8 8-3 3 3-3M14 7l-2 2"/><path d="M9 12l3 3"/>',
  hammer: '<path d="M14 6l4 4M12 8l-7 7a2 2 0 0 0 3 3l7-7M14 4l6 6-2 2-6-6z"/>',
  saks: '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><path d="M8 7l12 10M8 17L20 7"/>',
  hal: '<path d="M3 11l9-7 9 7v9H3z"/><path d="M9 20v-5h6v5M3 11h18"/>',
  loeft: '<path d="M4 10h16M7 7v6M17 7v6M4 10V8M20 10V8M12 4v16"/>',
  bold: '<circle cx="12" cy="12" r="9"/><path d="M12 7l4 3-1.5 4.5h-5L8 10z"/>',
  skov: '<path d="M12 3l5 7h-3l4 6H6l4-6H7z"/><path d="M12 16v5"/>',
  sauna: '<path d="M4 20h16M6 20v-7a6 6 0 0 1 12 0v7M9 8s1-2 0-4M15 8s1-2 0-4"/>',
};

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
const slug = (s: string) =>
  s.toLowerCase().replace(/æ/g, "ae").replace(/ø/g, "oe").replace(/å/g, "aa").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

type Box = { left: number; right: number; top: number; bottom: number };
const overlaps = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/**
 * Hides the names that would cover another point's icon or a name already
 * shown - the open point first, then in setup order - so every point can be
 * clicked whatever the zoom. A hidden name shows when its icon is hovered.
 */
function declutterNames(selected: string | null) {
  const points = [...document.querySelectorAll<HTMLElement>(".hv-hs[data-punkt]:not(.hv-skjult)")].filter((el) => el.style.visibility !== "hidden");
  points.sort((a, b) => Number(b.dataset.punkt === selected) - Number(a.dataset.punkt === selected));
  const icons = points.map((el) => el.querySelector(".hv-ikon")?.getBoundingClientRect());
  const shown: Box[] = [];
  points.forEach((el, i) => {
    const name = el.querySelector<HTMLElement>(".hv-navn");
    if (!name) return;
    const box = name.getBoundingClientRect();
    if (!box.width) return;
    const hit = icons.some((icon, j) => j !== i && icon && icon.width && overlaps(box, icon)) || shown.some((s) => overlaps(box, s));
    name.classList.toggle("hv-gemt", hit);
    if (!hit) shown.push(box);
  });
}

function readLastRoom(key: string): { name: string; href: string } | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
}

export function Experience({
  tour: T,
  sdkKey,
  ga4Id,
  modelId,
  sweepBySs,
  hiddenSweeps,
  storyImages,
  routeGraph,
  units,
}: {
  tour: TourConfig;
  sdkKey: string | null;
  ga4Id: string | null;
  modelId: string | null;
  sweepBySs: Record<number, string>;
  hiddenSweeps: string[];
  /** Room name -> picture URL for the story cards. */
  storyImages: Record<string, string>;
  /** The model's scan-point network, for "Find vej". */
  routeGraph: RouteGraph | null;
  /** Rooms available right now (live), for the room picker. */
  units: AvailableUnit[];
}) {
  useGa4(ga4Id, T.title);
  const { names: ROOM_NAMES, links: ROOM_LINKS } = useMemo(() => roomIndex([...T.menu, ...(T.places ? [{ title: "", items: T.places.map((p): [string, string] => [p.name, p.href]) }] : [])]), [T]);
  const LAST_ROOM_KEY = `${T.slug}-last-room`;
  /** The rooms of "Historier": the ones the setup names, otherwise every room in the menu. */
  const storyRooms = useMemo<StoryRoom[]>(() => {
    const all = T.menu
      .flatMap((m) => ("items" in m ? m.items : [[m.title, m.href] as [string, string]]))
      .filter(([, href]) => href.includes("explore.nextview360.dk"));
    const unique = all.filter(([name], i) => all.findIndex(([n]) => n === name) === i);
    const picked = T.stories?.rooms ? T.stories.rooms.map((r) => unique.find(([n]) => n === r)).filter((x): x is [string, string] => Boolean(x)) : unique;
    return picked.map(([name, href]) => ({ name, href, image: storyImages[name] }));
  }, [T, storyImages]);
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
  const currentSweep = useRef<string | null>(null);
  const roomTimer = useRef<{ name: string | null; at: number } | null>(null);
  /** "Kun punkter": no free walking - only the current scan point is enabled, the menu and points move you. */
  const [pointsOnly, setPointsOnly] = useState(T.navigation === "points");
  const pointsOnlyRef = useRef(pointsOnly);
  const [phase, setPhase] = useState<"drone" | "tour">(T.drone ? "drone" : "tour");
  const [selected, setSelected] = useState<Point | null>(null);
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [menuOpen, setMenuOpen] = useState(false);
  /** Zoomed in on the drone picture: room for the point names on a phone. */
  const [zoomed, setZoomed] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [tourReadyMs, setTourReadyMs] = useState<number | null>(null);
  const [tourError, setTourError] = useState<string | null>(null);
  const [entering, setEntering] = useState(false);
  const [room, setRoom] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [pano, setPano] = useState<Point | null>(null);
  /** The welcome tiles - skipped when the link already says where to go. */
  const [welcome, setWelcome] = useState(false);
  const [cover, setCover] = useState(false);
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
  /** "Find vej": the picker, and the walk in progress. */
  const [routeOpen, setRouteOpen] = useState(false);
  const [route, setRoute] = useState<{ dest: Destination; step: number; steps: number; arrived: boolean } | null>(null);
  const routeRun = useRef(0);
  /** The route still ahead, drawn on the floor. */
  const [routeLine, setRouteLine] = useState<Vec3[]>([]);
  const GUIDE = useMemo(() => guideStops(T), [T]);
  const [linkPopup, setLinkPopup] = useState<LinkPopupState>(null);
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

  /* ----- The tour: loaded in the background from the start, behind the drone scene. ----- */
  useEffect(() => {
    if (!iframe.current || !sdkKey || !modelId) return;
    const started = now();
    let sub: { cancel(): void } | null = null;
    const ssBySweep = Object.fromEntries(Object.entries(sweepBySs).map(([ss, id]) => [id, Number(ss)]));
    sdkRef.current = connectSdk(iframe.current, sdkKey).then(async (sdk) => {
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
      setSdk(sdk);
      if (coverWaitingRef.current) {
        coverWaitingRef.current = false;
        setCoverWaiting(false);
        setCover(false);
      }
      track("tour_ready", { load_ms: Math.round(now() - started) });
      const current = (sdk as unknown as { Sweep: { current: { subscribe(cb: (s: { sid?: string }) => void): { cancel(): void } } } }).Sweep.current;
      sub = current.subscribe((s) => {
        if (!s?.sid) return;
        const first = currentSweep.current == null;
        currentSweep.current = s.sid;
        if (first && pointsOnlyRef.current) lockTo(sdk, allSweeps.current, s.sid);
        const ss = ssBySweep[s.sid];
        currentSsRef.current = ss ?? null;
        setCurrentSs(ss ?? null);
        const name = ss != null ? ROOM_NAMES[ss] ?? null : null;
        // Time spent where the visitor just was (named rooms only).
        if (roomTimer.current?.name && roomTimer.current.name !== name) {
          track("room_time", { room_name: roomTimer.current.name, seconds: Math.round((now() - roomTimer.current.at) / 1000) });
        }
        if (roomTimer.current?.name !== name) roomTimer.current = { name, at: now() };
        setRoom(name);
        track("room_view", { sweep_id: s.sid, room_name: name ?? "(uden navn)" });
        if (name && ss != null) {
          try {
            localStorage.setItem(LAST_ROOM_KEY, JSON.stringify({ name, href: ROOM_LINKS[ss] }));
          } catch {}
        }
      });
      return sdk;
    });
    sdkRef.current.catch((err) => setTourError(err instanceof Error ? err.message : String(err)));
    return () => sub?.cancel();
  }, [sdkKey, modelId, sweepBySs, hiddenSweeps, ROOM_NAMES, ROOM_LINKS, LAST_ROOM_KEY, T.start]);

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

  const flyTo = useCallback(
    async (href: string, transition: "fly" | "instant") => {
      const target = uLinkTarget(href);
      const sweep = target ? sweepBySs[target.ss] : null;
      if (!sdkRef.current || !sweep) return false;
      const sdk = await sdkRef.current;
      const locked = pointsOnlyRef.current;
      const from = currentSweep.current;
      if (locked) await sdk.Sweep.enable(sweep);
      if (transition === "fly" && T.jump === "fade") {
        // A real cross-fade instead of Matterport's fade to black: a picture of the view on top,
        // the new room underneath at once, then the picture fades away - like stepping to the next scan.
        const shot = crossfade.current;
        const fr = iframe.current;
        if (shot && fr) {
          const w = Math.min(fr.clientWidth, 1600);
          const pic = await sdk.Renderer.takeScreenShot({ width: w, height: Math.round((w * fr.clientHeight) / fr.clientWidth) }, { mattertags: false, sweeps: false }).catch(() => null);
          if (pic) {
            shot.style.transition = "none";
            shot.src = pic;
            await shot.decode().catch(() => {});
            shot.style.opacity = "1";
          }
        }
        await sdk.Sweep.moveTo(sweep, { rotation: target?.rotation, transition: sdk.Sweep.Transition.INSTANT });
        await new Promise((r) => setTimeout(r, 160)); // the new room's first frames
        if (shot) {
          shot.style.transition = "opacity .5s ease";
          shot.style.opacity = "0";
        }
      } else {
        await sdk.Sweep.moveTo(sweep, {
          rotation: target?.rotation,
          transition: transition === "instant" ? sdk.Sweep.Transition.INSTANT : sdk.Sweep.Transition.FLY,
          transitionTime: transition === "instant" ? undefined : T.flyMs,
        });
      }
      if (locked && from && from !== sweep) await sdk.Sweep.disable(from).catch(() => {});
      return true;
    },
    [sweepBySs, T]
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

  const openPoint = useCallback(
    (p: Point) => {
      setSelected(p);
      track("drone_point_click", { point_name: p.name, category: T.categories[p.cat].name });
      if (T.map) mapApi.current?.focus(p.id);
      const v = drone.current;
      if (v) {
        // On a computer the panel covers the right side, so the point is centred in what's left of the screen.
        const panel = window.innerWidth > 760 ? 183 : 0;
        const yaw = p.yaw + (panel / window.innerWidth) * v.getHfov();
        v.lookAt(Math.max(p.pitch, -70), yaw, v.getHfov(), 700);
      }
      if (p.tour) prepare(p.tour);
    },
    [prepare, T]
  );

  useEffect(() => {
    mobile.current = window.innerWidth <= 760;
    const D = T.drone;
    if (!D || T.map) return;
    let cancelled = false;
    let declutter = 0;
    loadPannellum().then(() => {
      if (cancelled || !droneEl.current || !window.pannellum) return;
      const start = mobile.current ? D.startMobile : D.start;
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
        type: "multires",
        autoLoad: true,
        showControls: false,
        compass: false,
        multiRes: {
          basePath: D.basePath,
          path: "/%l/%s%y_%x",
          extension: "jpg",
          tileResolution: 512,
          maxLevel: D.maxLevel,
          cubeResolution: D.cubeResolution,
        },
        yaw: start.yaw,
        pitch: start.pitch,
        hfov: start.hfov,
        minHfov: mobile.current ? 40 : 50,
        maxHfov: mobile.current ? 110 : 115,
        minPitch: -90,
        maxPitch: 25,
        mouseZoom: true,
        keyboardZoom: false,
        hotSpots,
      });
      drone.current.on("zoomchange", (hfov) => setZoomed(Number(hfov) < 56));
      declutter = window.setInterval(() => declutterNames(selectedId.current), 120);
      track("drone_view");
    });
    return () => {
      cancelled = true;
      window.clearInterval(declutter);
      drone.current?.destroy();
      drone.current = null;
    };
  }, [openPoint, T]);

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
    if (entering) return;
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
      setEntering(false);
      return;
    }
    track("tour_enter_done", { destination: pointName, enter_ms: Math.round(now() - started) });
    setSelected(null);
    setMenuOpen(false);
    setPhase("tour");
    setEntering(false);
  }

  function backToDrone() {
    prepared.current = null;
    track("back_to_drone", { room_name: room ?? "" });
    setMenuOpen(false);
    if (!T.drone) return;
    setPhase("drone");
    const start = mobile.current ? T.drone.startMobile : T.drone.start;
    setTimeout(() => drone.current?.lookAt(start.pitch, start.yaw, start.hfov, 1200), 350);
    setTimeout(() => mapApi.current?.reset(), 350);
  }

  /** What greets the visitor once they're in: the welcome, or the menu if it's open on start. */
  function afterStart() {
    if (T.design?.welcome === "cover" && T.cover) {
      setCover(true);
      track("welcome_view", { style: "cover" });
      return;
    }
    if (T.welcome) {
      setLastRoom(readLastRoom(LAST_ROOM_KEY));
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
    const q = new URLSearchParams(window.location.search);
    const rum = q.get("rum");
    const punkt = q.get("punkt");
    const ss = q.get("ss");
    requestAnimationFrame(() => {
      if (rum || punkt || ss) setIntro(null); // a link to a place goes straight there
      if (rum) {
        const hit = T.menu.flatMap((m) => ("items" in m ? m.items : [[m.title, m.href] as [string, string]])).find(([n]) => slug(n) === rum);
        if (hit) {
          track("start_link", { kind: "rum", target: hit[0] });
          enterRef.current(hit[1], "link", hit[0]);
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
        enterRef.current(`${T.tourPage}?${q.toString()}`, "link", ROOM_NAMES[Number(ss)] ?? `ss=${ss}`);
        return;
      }
      if (T.intro) return; // the welcome comes when the film ends
      afterStartRef.current();
    });
  }, [openPoint, T, ROOM_NAMES, LAST_ROOM_KEY]);

  function chooseWelcome(go: WelcomeGo | "last" | "skip", label: string) {
    track("welcome_choice", { choice: label });
    setWelcome(false);
    if (go === "skip") return;
    if (go === "last") {
      if (lastRoom) enterTour(lastRoom.href, "welcome", lastRoom.name);
      return;
    }
    if ("href" in go) {
      track("cta_click", { label, link_url: go.href, place: "welcome" });
      openLink(T, go.href, label, popup);
      return;
    }
    if ("room" in go) {
      enterTour(go.room, "welcome", go.name);
      return;
    }
    if ("guide" in go) return startGuide("welcome");
    // The drone scene, optionally with only one category's points showing.
    const only = go.drone;
    setHidden(only ? Object.fromEntries(Object.keys(T.categories).map((k) => [k, k !== only])) : {});
  }

  async function menuGo(name: string, group: string, href: string) {
    if (href === "#luften") {
      setMenuOpen(false);
      backToDrone();
      return;
    }
    if (!href.includes("explore.nextview360.dk")) {
      track("cta_click", { label: name, link_url: href, place: "menu" });
      openLink(T, href, name, popup);
      return;
    }
    track("menu_click", { item_name: name, group });
    if (phase === "drone") return enterTour(href, "menu", name);
    setMenuOpen(false);
    await flyTo(href, "fly");
  }

  async function storyGo(r: StoryRoom) {
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
      const saved = await saveTourStoryImage(T.slug, r.name, await storyJpeg(shot));
      if (!saved.ok) throw new Error(saved.error);
    }
    progress(`Færdig - ${storyRooms.length} billeder.`);
    router.refresh();
  }

  /** A place from the cover or the dock: into the tour, right there. */
  async function placeGo(p: TourPlace, from: string) {
    track("place_click", { place_name: p.name, from });
    setCover(false);
    if (phase === "drone") return enterTour(p.href, from, p.name);
    await flyTo(p.href, "fly");
  }

  /* ----- "Vis mig rundt" ----- */
  function guideGo(i: number) {
    const stop = GUIDE[i];
    setGuideAt(i);
    if (phase === "drone") return enterTour(stop.href, "guide", stop.title);
    flyTo(stop.href, "fly").then(() => sdk?.Camera.rotate?.(18, 0, { speed: 3 }).catch(() => {}));
  }
  function startGuide(from: string) {
    if (!GUIDE.length) return;
    track("guide_start", { from, stops: GUIDE.length });
    setMenuOpen(false);
    setWelcome(false);
    setCover(false);
    setSelected(null);
    guideGo(0);
  }
  function closeGuide(completed: boolean) {
    track(completed ? "guide_complete" : "guide_close", { stop: (guideAt ?? 0) + 1, stops: GUIDE.length });
    setGuideAt(null);
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

  /* ----- "Find vej" ----- */
  const DESTINATIONS = useMemo<Destination[]>(
    () =>
      T.menu.flatMap((m) =>
        ("items" in m ? m.items.map(([name, href]) => ({ name, group: m.title, href })) : [{ name: m.title, href: m.href }]).filter((d) =>
          d.href.includes("explore.nextview360.dk")
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
    setRouteOpen(false);
    setMenuOpen(false);
    const run = ++routeRun.current;
    const target = uLinkTarget(dest.href);
    const goal = target ? sweepBySs[target.ss] : null;
    const from = currentSweep.current;
    const path = sdk && routeGraph && goal && from ? shortestPath(routeGraph, from, goal) : null;
    const flights = path && routeGraph ? straighten(routeGraph, path) : null;
    track("route_start", { destination: dest.name, group: dest.group ?? "", flights: flights ? flights.length - 1 : 0 });
    if (!sdk || !routeGraph || !flights || flights.length < 2) {
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
    if (first != null) await sdk.Sweep.moveTo(flights[0], { rotation: { x: -8, y: first }, transition: sdk.Sweep.Transition.FLY, transitionTime: 700 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 500));
    for (let i = 1; i <= steps; i++) {
      if (routeRun.current !== run) return;
      const sid = flights[i];
      const last = i === steps;
      // Arrive already facing the next stretch, so the next flight starts straight ahead.
      const yaw = last ? null : heading(sid, flights[i + 1]) ?? heading(flights[i - 1], sid);
      const closed = pointsOnlyRef.current || hiddenSweeps.includes(sid);
      if (closed) await sdk.Sweep.enable(sid).catch(() => {});
      await sdk.Sweep.moveTo(sid, {
        rotation: last ? target?.rotation : yaw != null ? { x: -8, y: yaw } : undefined,
        transition: sdk.Sweep.Transition.FLY,
        transitionTime: flightMs(routeGraph, flights[i - 1], sid),
      }).catch(() => {});
      const prev = flights[i - 1];
      if (pointsOnlyRef.current || hiddenSweeps.includes(prev)) await sdk.Sweep.disable(prev).catch(() => {});
      setRoute({ dest, step: i, steps, arrived: last });
      setRouteLine(last ? [] : line(i));
    }
    track("route_arrive", { destination: dest.name, flights: steps });
  }
  function stopRoute() {
    if (route && !route.arrived) track("route_stop", { destination: route.dest.name, step: route.step });
    routeRun.current++;
    setRoute(null);
    setRouteLine([]);
  }

  const place = usePlaceInfo(sdk, iframe, useCallback(() => currentSsRef.current, []));

  const ctaClick = (label: string, href: string, place: string) => track("cta_click", { label, link_url: href, place });

  return (
    <LinkProvider T={T} popup={popup}>
    <div className={`hv fixed inset-0 z-50 overflow-hidden bg-[#0d1b20] ${selected ? "hv-punkt" : ""} ${zoomed ? "hv-zoom" : ""} ${welcome ? "hv-welcome" : ""} ${phase === "tour" && T.stories?.mobile ? "hv-st-on-m" : ""} ${menuOpen ? "hv-menu-aaben" : ""} ${T.design?.menu === "dock" ? "hv-dock" : ""} ${guideAt != null ? "hv-guiding" : ""} ${route ? "hv-routing" : ""} ${phase === "tour" && T.stories?.desktop ? "hv-st-on-d" : ""}`} style={
        {
          fontFamily: `'${T.font}', system-ui, sans-serif`,
          "--c-main": T.colors.main,
          "--c-accent": T.colors.accent,
          "--c-accent-dark": T.colors.accentDark,
          "--c-soft": T.colors.soft,
          "--font-heading": `'${T.fontHeading ?? T.font}', serif`,
          "--logo-h": `${T.logoSize ?? 46}px`,
        } as React.CSSProperties
      }>
      <link rel="stylesheet" href={`https://fonts.googleapis.com/css2?family=${T.font}:wght@400;600;700;800;900&display=swap`} />
      {T.fontHeading && <link rel="stylesheet" href={`https://fonts.googleapis.com/css2?family=${T.fontHeading.replace(/ /g, "+")}:wght@500;600&display=swap`} />}
      <style>{CSS + STORIES_CSS + DESIGNS_CSS + LINKS_CSS + GUIDE_CSS + INFO_CSS + MAP_CSS + ROUTE_CSS}</style>

      {/* The tour, always mounted so it loads while the visitor is in the drone scene. */}
      {modelId && (
        <iframe
          ref={iframe}
          title="Matterport"
          src={showcaseUrl(modelId, sdkKey, { ...T.matterportParams, ...startParams(T.start) })}
          className={`absolute inset-0 h-full w-full border-0 transition-opacity duration-500 ${phase === "tour" ? "opacity-100" : "pointer-events-none opacity-0"}`}
          allow="fullscreen; xr-spatial-tracking; autoplay"
        />
      )}
      {T.jump === "fade" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img ref={crossfade} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover" style={{ opacity: 0 }} />
      )}

      {/* The drone scene on top; fades away when going into the tour. */}
      {T.drone && (
      <div className={`absolute inset-0 transition-opacity duration-500 ${phase === "drone" ? "opacity-100" : "pointer-events-none opacity-0"}`}>
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

        <div className="hv-intro">
          <div className="hv-intro-head" style={{ background: T.colors.main }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={T.logo} alt={T.brand} />
            <div className="hv-sub">{T.subtitle}</div>
          </div>
          <div className="hv-intro-body">
            <h1>{T.drone?.intro.title}</h1>
            <p>{T.drone?.intro.lead}</p>
            <TourLink className="hv-btn hv-primary" href={T.cta[0].href} label={T.cta[0].label} onClick={() => ctaClick(T.cta[0].label, T.cta[0].href, "intro")}>
              {T.cta[0].label}
            </TourLink>
          </div>
        </div>

        <div className="hv-filtre">
          <div className="hv-filtre-t">{T.drone?.filterTitle}</div>
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
                {c.name}
              </button>
            ))}
          </div>
        </div>

        {selected && (
          <aside className="hv-panel">
            <button type="button" className="hv-luk" aria-label="Luk" onClick={() => setSelected(null)}>
              ×
            </button>
            <div className="hv-kat" style={{ color: T.categories[selected.cat].color }}>
              {T.categories[selected.cat].name}
            </div>
            <h2>{selected.name}</h2>
            <p>{selected.text}</p>
            <div className="hv-pchips">
              {selected.chips.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
            {selected.tour ? (
              <button type="button" className="hv-btn hv-primary hv-wide" disabled={entering} onClick={() => enterTour(selected.tour!, "drone", selected.name)}>
                {entering ? "Går ind…" : "Gå ind i rummet"}
              </button>
            ) : (
              selected.pano && (
                <button
                  type="button"
                  className="hv-btn hv-primary hv-wide"
                  onClick={() => {
                    track("pano_open", { point_name: selected.name });
                    setPano(selected);
                  }}
                >
                  Oplev i 360°
                </button>
              )
            )}
          </aside>
        )}
      </div>
      )}

      {welcome && T.welcome && (
        <div className="hv-wel" role="dialog" aria-modal="true" aria-label={T.welcome.title}>
          <div className="hv-wel-grid">
            <div className={`hv-wel-main ${T.logoOnLight ? "hv-light" : ""}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={T.logo} alt={T.brand} />
              <div className="hv-wel-kick">{T.welcome.kicker}</div>
              <h1>{T.welcome.title}</h1>
              <p>{T.welcome.lead}</p>
              {GUIDE.length > 0 && (
                <button type="button" className="hv-wel-guide" onClick={() => chooseWelcome({ guide: true }, "Vis mig rundt")}>
                  ▶ Vis mig rundt
                </button>
              )}
              <button type="button" className="hv-wel-skip" onClick={() => chooseWelcome("skip", T.welcome!.skip)}>
                {T.welcome.skip} →
              </button>
            </div>
            {lastRoom && (
              <button type="button" className="hv-tile hv-tile-last" onClick={() => chooseWelcome("last", "Fortsæt hvor du slap")}>
                <span className="hv-tile-plus">↺</span>
                <small>Fortsæt hvor du slap</small>
                <b>{lastRoom.name}</b>
              </button>
            )}
            {T.welcome.tiles.map((t) => (
              <button key={t.title} type="button" className={`hv-tile hv-tile-${t.style}`} onClick={() => chooseWelcome(t.go, t.title)}>
                {t.recommended && <em>Anbefalet</em>}
                <span className="hv-tile-plus">+</span>
                <small>{t.kicker}</small>
                <b>{t.title}</b>
              </button>
            ))}
          </div>
          <button type="button" className="hv-wel-x" aria-label="Luk" onClick={() => chooseWelcome("skip", "luk")}>
            ×
          </button>
        </div>
      )}

      {pano?.pano && T.panos && <PanoView name={pano.name} dir={pano.pano} panos={T.panos} onClose={() => setPano(null)} />}

      {/* Logo (MPSkins: left, 200px, 13px from the edges). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={T.logo} alt={T.brand} className={`hv-logo ${T.logoOnLight ? "hv-logo-kort" : ""} ${phase === "tour" ? "" : "hidden"}`} />

      {/* Inside the tour: back to the air, the room's name, the menu. */}
      {phase === "tour" && (
        <>
          {T.drone && (
          <button type="button" className="hv-luften" onClick={backToDrone}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 5l4 4M19 5l-4 4M5 19l4-4M19 19l-4-4M9 9h6v6H9z" />
            </svg>
            {T.drone.backLabel}
          </button>
          )}
          {T.stories && storyRooms.length > 0 && (
            <Stories
              rooms={storyRooms}
              current={room}
              devices={T.stories}
              leading={T.drone ? { label: T.drone.backLabel, onClick: backToDrone } : undefined}
              onGo={storyGo}
              onEvent={track}
            />
          )}
          {room && <div className="hv-room">{room}</div>}
        </>
      )}

      {T.design?.menu === "picker" ? (
        phase === "tour" && !cover && <PickerMenu T={T} units={units} onGo={menuGo} onCta={(label, href) => ctaClick(label, href, "picker")} />
      ) : T.design?.menu === "dock" ? (
        phase === "tour" && !cover && <DockMenu T={T} room={room} onGuide={() => startGuide("dock")} onPlace={(p) => placeGo(p, "dock")} onItem={(label, href) => ctaClick(label, href, "dock")} />
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
        {menuOpen ? "Luk" : "Menu"}
      </button>
      <nav className={`hv-menu ${menuOpen ? "aaben" : ""}`}>
        <div className={`hv-menu-head ${T.logoOnLight ? "hv-light" : ""}`} style={{ background: T.logoOnLight ? "#fff" : T.colors.main }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={T.logo} alt="" />
          <div className="hv-menu-titel">{T.brand.toUpperCase()}</div>
          <div className="hv-sub">{T.subtitle}</div>
        </div>
        {GUIDE.length > 0 && (
          <button type="button" className="hv-guide-knap" onClick={() => startGuide("menu")}>
            ▶
            <span>
              Vis mig rundt
              <small>{GUIDE.length} steder · ca. {Math.ceil((GUIDE.length * (T.guide?.seconds ?? 9)) / 60)} min</small>
            </span>
          </button>
        )}
        {T.menu.map((m) =>
          "items" in m ? (
            <div key={m.title} className="hv-gruppe">
              <button type="button" className="hv-gtitel" onClick={() => setOpenGroup((g) => (g === m.title ? null : m.title))}>
                {m.title}
                <span>{openGroup === m.title ? "−" : "+"}</span>
              </button>
              {openGroup === m.title && (
                <div className="hv-items">
                  {m.items.map(([name, href]) => (
                    <button key={name} type="button" onClick={() => menuGo(name, m.title, href)}>
                      {name}
                      {!href.includes("explore.nextview360.dk") && <span className="hv-ext">↗</span>}
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
        <div className="hv-menu-cta">
          {T.cta.map((c) => (
            <TourLink key={c.label} className={`hv-btn ${c.primary ? "hv-primary" : "hv-secondary"}`} href={c.href} label={c.label} onClick={() => ctaClick(c.label, c.href, "menu")}>
              {c.label}
            </TourLink>
          ))}
        </div>
        {T.contact && (
          <div className="hv-contact">
            <div className="hv-contact-t">Kontakt</div>
            {T.contact.address && (
              <TourLink href={T.contact.mapUrl ?? "#"} label={T.contact.address ?? "Kort"} onClick={() => track("contact_click", { kind: "map" })}>
                <span>📍</span>
                {T.contact.address}
              </TourLink>
            )}
            {T.contact.phone && (
              <a href={`tel:${T.contact.phone.replace(/\s/g, "")}`} onClick={() => track("contact_click", { kind: "phone" })}>
                <span>📞</span>
                {T.contact.phone}
              </a>
            )}
            {T.contact.email && (
              <a href={`mailto:${T.contact.email}`} onClick={() => track("contact_click", { kind: "email" })}>
                <span>✉️</span>
                {T.contact.email}
              </a>
            )}
            {T.contact.instagram && (
              <TourLink href={T.contact.instagram} label="Instagram" onClick={() => track("contact_click", { kind: "instagram" })}>
                <span>📷</span>
                Instagram
              </TourLink>
            )}
          </div>
        )}
        <a className="hv-signatur" href="https://nextview360.dk" target="_blank" rel="noopener" onClick={() => track("nextview_click", { place: "menu" })}>
          Præsenteret af
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="nextview360.dk" />
        </a>
      </nav>
      </>
      )}

      {cover && T.cover && (
        <CoverWelcome
          T={T}
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
          onGuide={GUIDE.length ? () => startGuide("cover") : undefined}
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
            Spring over
          </button>
        </div>
      )}

      {/* Prototype tools: status and the GA4 event log. */}
      <div className="hv-dev">
        <button type="button" onClick={() => setShowLog((s) => !s)}>
          {tourError ? "⚠ Tour" : tourReadyMs != null ? `Tour klar ${(tourReadyMs / 1000).toFixed(1).replace(".", ",")} s` : "Tour indlæses…"} · GA4 {ga4Id ? "✓" : "–"}
        </button>
        {showLog && (
          <DevPanel onCopyView={copyView} place={T.info ? place : undefined} onCaptureStories={T.stories ? captureStories : undefined} storyCount={storyRooms.length} ga4Id={ga4Id} tourError={tourError} sdkKey={sdkKey} modelId={modelId} pointsOnly={pointsOnly} onPointsOnly={setNavigation} />
        )}
      </div>
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
          Find vej
        </button>
      )}
      {routeLine.length > 1 && phase === "tour" && <RouteLine sdk={sdk} points={routeLine} frame={iframe} />}
      {routeOpen && <RouteSheet destinations={DESTINATIONS} boxes={T.wayfinding?.boxes} onGo={walkTo} onClose={() => setRouteOpen(false)} />}
      {route && (
        <RouteStatus
          dest={route.dest}
          step={route.step}
          steps={route.steps}
          arrived={route.arrived}
          cta={T.cta.find((c) => c.primary)}
          onStop={stopRoute}
          onCta={() => ctaClick(T.cta.find((c) => c.primary)!.label, T.cta.find((c) => c.primary)!.href, "route")}
        />
      )}
      {guideAt != null && GUIDE[guideAt] && (
        <GuidePlayer stops={GUIDE} index={guideAt} seconds={T.guide?.seconds ?? 9} onGo={guideGo} onClose={closeGuide} onEvent={track} />
      )}
      {linkPopup && <LinkPopup open={linkPopup} onClose={() => setLinkPopup(null)} />}
    </div>
    </LinkProvider>
  );
}

/** A 360° photo at a point, full screen over the drone scene. */
function PanoView({
  name,
  dir,
  panos,
  onClose,
}: {
  name: string;
  dir: string;
  panos: NonNullable<TourConfig["panos"]>;
  onClose: () => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let viewer: PannellumViewer | null = null;
    let cancelled = false;
    loadPannellum().then(() => {
      if (cancelled || !el.current || !window.pannellum) return;
      viewer = window.pannellum.viewer(el.current, {
        type: "multires",
        autoLoad: true,
        showControls: false,
        compass: false,
        multiRes: {
          basePath: `${panos.basePath}/${dir}`,
          path: "/%l/%s%y_%x",
          extension: "jpg",
          tileResolution: 512,
          maxLevel: panos.maxLevel,
          cubeResolution: panos.cubeResolution,
        },
        hfov: window.innerWidth <= 760 ? 90 : 100,
        minHfov: 40,
        maxHfov: 120,
        pitch: -10,
      });
    });
    return () => {
      cancelled = true;
      viewer?.destroy();
    };
  }, [dir, panos]);
  return (
    <div className="hv-pano">
      <div ref={el} className="absolute inset-0" />
      <div className="hv-pano-titel">{name}</div>
      <button type="button" className="hv-pano-luk" onClick={onClose}>
        ← Tilbage til luften
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
  ga4Id,
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
  ga4Id: string | null;
  tourError: string | null;
  sdkKey: string | null;
  modelId: string | null;
  pointsOnly: boolean;
  onPointsOnly: (only: boolean) => void;
}) {
  const [value, setValue] = useState(ga4Id ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [capture, setCapture] = useState<string | null>(null);
  const [view, setView] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
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
      <form
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const r = await saveTourGa4Id(value);
            setMsg(r.ok ? "Gemt - genindlæs siden." : r.error);
            if (r.ok) router.refresh();
          });
        }}
      >
        <label htmlFor="ga4">GA4-måle-id</label>
        <input id="ga4" value={value} onChange={(e) => setValue(e.target.value)} placeholder="G-XXXXXXXXXX" />
        <button type="submit" disabled={pending}>
          Gem
        </button>
      </form>
      {msg && <p>{msg}</p>}
      <p className="hv-devt">Hændelser{ga4Id ? " (sendes til GA4)" : " (ikke sendt - intet GA4-id)"}:</p>
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
.hv *{box-sizing:border-box}
.hv .pnlm-load-box{background:rgba(21,50,58,.9)!important;border-radius:12px!important;font-family:inherit!important}
.hv-hs.hv-skjult{display:none!important}
.hv-hs:hover,.hv-hs.hv-aktiv{z-index:9}
.hv-hs.hv-aktiv .hv-ikon{transform:scale(1.18);box-shadow:0 0 0 4px rgba(255,255,255,.55),0 3px 10px rgba(0,0,0,.35)}
/* The icon's centre is the place it marks, so it stays put at every zoom; the name hangs below it. */
.hv-pkt{position:relative;transform:translate(-50%,-50%);cursor:pointer;pointer-events:none}
.hv-ikon,.hv-navn{pointer-events:auto}
.hv-ikon{width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;border:3px solid #fff;box-shadow:0 3px 10px rgba(0,0,0,.35);transition:transform .15s}
.hv-ikon svg{width:17px;height:17px}
.hv-navn{position:absolute;top:100%;left:50%;transform:translateX(-50%);margin-top:4px;background:#fff;border-radius:999px;padding:2px 10px;font-size:12.5px;font-weight:800;white-space:nowrap;color:#1d2a30;box-shadow:0 2px 8px rgba(0,0,0,.25)}
.hv-pkt:hover .hv-ikon{transform:scale(1.12)}
/* A name that would cover another point steps aside until its icon is hovered. */
.hv-navn.hv-gemt{visibility:hidden;pointer-events:none}
.hv-pkt:hover .hv-navn.hv-gemt{visibility:visible}
.hv-intro{position:absolute;top:16px;left:16px;z-index:5;width:320px;background:var(--c-soft);border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,.28)}
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
.hv-panel{position:absolute;top:66px;right:16px;z-index:7;width:350px;max-height:calc(100% - 82px);overflow-y:auto;background:var(--c-soft);border-radius:16px;box-shadow:0 12px 36px rgba(0,0,0,.35);padding:18px 18px 18px;animation:hvIn .25s ease}
@keyframes hvIn{from{opacity:0;transform:translateX(16px)}to{opacity:1;transform:none}}
.hv-luk{position:absolute;top:10px;right:10px;width:32px;height:32px;border-radius:50%;border:0;background:#fff;font-size:19px;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.2)}
.hv-kat{font-size:11.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase}
.hv-panel h2{margin:2px 40px 8px 0;font-size:25px;line-height:1.1;font-weight:900;color:var(--c-main)}
.hv-panel p{margin:0 0 12px;font-size:15px;line-height:1.5;color:#3d4a50}
.hv-pchips{display:flex;flex-wrap:wrap;gap:5px}
.hv-pchips span{background:#e7eef0;color:var(--c-main);font-size:12px;font-weight:700;padding:4px 9px;border-radius:999px}
.hv-note{font-size:13px!important;color:#7a8a90!important;margin-top:12px!important}
.hv-logo{position:absolute;top:14px;left:16px;height:var(--logo-h);width:auto;max-width:min(320px,40vw);object-fit:contain;z-index:6;filter:drop-shadow(0 2px 6px rgba(0,0,0,.35))}
/* A dark logo gets a light card, so it reads on any wall. */
.hv-logo-kort{box-sizing:content-box;height:calc(var(--logo-h) - 12px);padding:9px 14px;border-radius:14px;background:rgba(255,255,255,.94);filter:none;box-shadow:0 6px 18px rgba(0,0,0,.18)}
.hv-signatur{display:flex;align-items:center;justify-content:center;gap:8px;padding:6px 22px 22px;font-size:11px;letter-spacing:.04em;color:#7b878c;text-decoration:none}
.hv-signatur img{height:14px;width:auto;opacity:.85}
.hv-signatur:hover{color:#1d2a30}
.hv-luften{position:absolute;left:16px;bottom:20px;z-index:6;display:flex;align-items:center;gap:8px;background:var(--c-main);color:#fff;border:0;border-radius:999px;padding:11px 18px;font:800 14px inherit;font-family:inherit;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.3)}
.hv-luften svg{width:18px;height:18px}
.hv-room{position:absolute;left:50%;bottom:22px;transform:translateX(-50%);z-index:6;background:rgba(255,255,255,.95);color:var(--c-main);border-radius:999px;padding:8px 16px;font-weight:800;font-size:14px;box-shadow:0 4px 14px rgba(0,0,0,.25)}
.hv-menuknap{position:absolute;top:14px;right:14px;z-index:9;background:var(--c-main);color:#fff;border:0;border-radius:999px;padding:9px 18px;font-weight:800;font-size:14px;font-family:inherit;letter-spacing:.08em;text-transform:uppercase;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.3)}
.hv-menu{position:absolute;top:0;right:0;bottom:0;z-index:8;width:320px;max-width:100%;background:rgba(255,255,255,.98);overflow-y:auto;transform:translateX(105%);transition:transform .3s ease;box-shadow:-10px 0 30px rgba(0,0,0,.25)}
.hv-menu.aaben{transform:none}
.hv-menu-head{padding:56px 20px 16px;text-align:center;color:#fff}
.hv-menu-head img{width:58px;height:58px;display:block;margin:0 auto 10px}
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
.hv-menu-cta{padding:14px 22px 24px;display:flex;flex-direction:column;gap:8px}
.hv-pano{position:absolute;inset:0;z-index:15;background:#0d1b20;animation:hvFade .4s ease}
@keyframes hvFade{from{opacity:0}to{opacity:1}}
.hv-pano-titel{position:absolute;top:16px;left:16px;z-index:2;background:rgba(21,50,58,.9);color:#fff;font-weight:800;font-size:16px;padding:8px 16px;border-radius:999px}
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
.hv-wel-main img{width:56px;height:56px;background:var(--c-main);border-radius:12px;padding:8px;margin-bottom:18px}
.hv-wel-kick{font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#7a8a90}
.hv-wel-main h1{margin:6px 0 10px;font-size:42px;line-height:1.02;font-weight:900;color:var(--c-main);letter-spacing:-.01em;text-wrap:balance}
.hv-wel-main p{margin:0;font-size:16px;line-height:1.55;color:#3d4a50}
.hv-wel-skip{margin-top:auto;padding-top:18px;align-self:flex-start;border:0;background:none;font:800 13px inherit;font-family:inherit;letter-spacing:.1em;text-transform:uppercase;color:var(--c-main);cursor:pointer;opacity:.7}
.hv-wel-skip:hover{opacity:1}
.hv-tile{position:relative;border:0;border-radius:20px;padding:18px;text-align:left;cursor:pointer;display:flex;flex-direction:column;justify-content:flex-end;font-family:inherit;min-height:150px;transition:transform .25s,box-shadow .25s;animation:hvUp .6s cubic-bezier(.2,.7,.2,1) both}
.hv-tile:nth-child(2){animation-delay:.05s}.hv-tile:nth-child(3){animation-delay:.1s}.hv-tile:nth-child(4){animation-delay:.15s}.hv-tile:nth-child(5){animation-delay:.2s}.hv-tile:nth-child(6){animation-delay:.25s}.hv-tile:nth-child(7){animation-delay:.3s}
@keyframes hvUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
.hv-tile:hover{transform:translateY(-4px);box-shadow:0 18px 40px rgba(0,0,0,.35)}
.hv-tile small{font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;opacity:.75;margin-bottom:4px}
.hv-tile b{font-size:24px;line-height:1.05;font-weight:900}
.hv-tile em{position:absolute;top:14px;left:14px;font-style:normal;font-size:10.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;padding:3px 9px;border-radius:999px;background:var(--c-accent);color:#fff}
.hv-tile-plus{position:absolute;top:14px;right:14px;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:16px}
.hv-tile-light{background:#fff;color:var(--c-main)}.hv-tile-light .hv-tile-plus{background:var(--c-main);color:#fff}
.hv-tile-dark{background:var(--c-main);color:#fff}.hv-tile-dark .hv-tile-plus{background:#fff;color:var(--c-main)}
.hv-tile-accent{background:var(--c-accent);color:#fff}.hv-tile-accent .hv-tile-plus{background:#fff;color:var(--c-accent)}
.hv-tile-last{background:#e7eef0;color:var(--c-main)}.hv-tile-last .hv-tile-plus{background:var(--c-main);color:#fff}
.hv-wel-x{position:absolute;top:16px;right:16px;width:44px;height:44px;border-radius:12px;border:0;background:rgba(255,255,255,.92);font-size:24px;cursor:pointer;color:var(--c-main)}
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
.hv-intro,.hv-filtre{transition:opacity .25s}
@media (max-width:760px){
  /* Slim welcome bar instead of the big card, with room for the menu button. */
  .hv-intro{top:10px;left:10px;right:104px;width:auto;display:flex;align-items:center;border-radius:14px}
  .hv-intro-head{padding:8px 10px;flex:none}
  .hv-intro-head img{height:30px;margin:0}
  .hv-intro .hv-sub{display:none}
  .hv-intro-body{padding:6px 10px;min-width:0;display:flex;flex-direction:column;gap:5px}
  .hv-intro-body h1{font-size:13.5px;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .hv-intro-body p{display:none}
  .hv-intro .hv-btn{padding:6px 10px;font-size:12.5px}
  .hv-menuknap{top:12px;right:10px;padding:10px 16px;font-size:13px}
  /* Categories: one row you can swipe. */
  .hv-filtre{left:10px;right:10px;bottom:calc(10px + env(safe-area-inset-bottom,0px));max-width:none;padding:7px 8px}
  .hv-filtre-t{display:none}
  .hv-chips{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none}
  .hv-chips::-webkit-scrollbar{display:none}
  .hv-chips button{flex:none;font-size:12px;padding:4px 10px 4px 5px}
  /* Only icons until you zoom in - the names crowd each other on a narrow screen. The open point keeps its name. */
  .hv-navn{display:none;font-size:11px;padding:1px 8px}
  .hv-zoom .hv-navn,.hv-hs.hv-aktiv .hv-navn{display:block}
  .hv-ikon{width:30px;height:30px;border-width:2px}.hv-ikon svg{width:15px;height:15px}
  /* An open point: the panel takes the bottom, the bars step aside. */
  .hv-panel{top:auto;bottom:0;left:0;right:0;width:auto;max-height:62%;border-radius:18px 18px 0 0;padding-bottom:calc(18px + env(safe-area-inset-bottom,0px))}
  .hv-logo{height:calc(var(--logo-h) * .74);max-width:45vw;top:12px;left:12px}
  .hv-logo-kort{height:calc(var(--logo-h) * .74 - 8px);padding:7px 10px;border-radius:11px}
  .hv-menu{width:100%}
  .hv-room{bottom:76px}
  .hv-dev{bottom:calc(64px + env(safe-area-inset-bottom,0px));right:10px}
  .hv-dev>button{font-size:10px;padding:3px 7px}
  .hv-punkt .hv-dev{display:none}
  .hv-wel{align-items:flex-start;padding:12px;overflow-y:auto}
  .hv-wel-grid{grid-template-columns:1fr 1fr;gap:10px;grid-auto-rows:auto}
  .hv-wel-main{grid-column:span 2;grid-row:auto;padding:16px 18px}
  .hv-wel-main img{width:40px;height:40px;padding:6px;margin-bottom:10px}
  .hv-wel-kick{display:none}
  .hv-wel-main h1{font-size:26px;margin-top:0}
  .hv-wel-main p{font-size:14px}
  .hv-wel-skip{padding-top:10px;font-size:12px}
  .hv-tile{min-height:112px;padding:14px;border-radius:16px}
  .hv-tile b{font-size:18px}
  .hv-wel-x{top:10px;right:10px;width:38px;height:38px}
  .hv-devpanel{width:calc(100vw - 20px)}
}
`;
