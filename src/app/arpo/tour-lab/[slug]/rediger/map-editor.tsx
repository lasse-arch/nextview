"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { placeMapSpots } from "@/lib/actions/tour-ai";
import { ICONS, ICON_NAMES, guessIcon } from "../../tours/icons";
import { PANO_HFOV, isPlaceHref, panoHfov, pointOfHref } from "../../tours/places";
import "pannellum/build/pannellum.css";
import type { TourConfig, TourPoint } from "../../tours/types";
import { Choice, Field, Group, Icon, input, PanoZoom, Toggle, UploadButton } from "./ui";
import { AiImageButton } from "./ai-image";

/*
 * "Luftfoto og kort": an illustrated map (or site plan, or drone photo) the
 * tour starts on, with points on it. Set up on a big canvas of its own:
 * click to put a point down, drag it to move it, pick its icon, size and
 * category - or let it walk through the menu's rooms, so each one is placed
 * with a single click (name, link into the tour and icon come along), or let
 * nextviewAI find them on the picture. A 360° picture is set up in 360°.
 */

type Edit = (fn: (draft: TourConfig) => void) => void;
type Map = NonNullable<TourConfig["map"]>;

const PALETTE = ["#c9872f", "#2f8fb5", "#5a7d2a", "#8a5a2a", "#b8432b", "#2f7d4f", "#6b4fa0", "#d0537a", "#3a3a3a"];
const svg = (name: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] ?? ICONS.pin}</svg>`;
const slugId = (s: string) => s.toLowerCase().replace(/æ/g, "ae").replace(/ø/g, "oe").replace(/å/g, "aa").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "punkt";

/** A point on a 360° picture: % of the flat picture <-> the direction it's seen in (as the tour turns it). */
const toXY = (pitch: number, yaw: number): [number, number] => {
  const r1 = (v: number) => Math.round(v * 10) / 10;
  return [r1((((((yaw + 180) / 360) * 100) % 100) + 100) % 100), r1(Math.min(100, Math.max(0, ((90 - pitch) / 180) * 100)))];
};
const toDir = (x: number, y: number) => ({ yaw: (x / 100) * 360 - 180, pitch: 90 - (y / 100) * 180 });

/** A new point's id: from its name, not one already used. */
function freeId(points: TourPoint[], name: string) {
  const base = slugId(name);
  let id = base;
  for (let i = 2; points.some((p) => p.id === id); i++) id = `${base}-${i}`;
  return id;
}

/** Is a point in the menu already (its room, or the point itself)? */
function inMenu(T: TourConfig, p: TourPoint) {
  const hrefs = T.menu.flatMap((m) => ("items" in m ? m.items.map((i) => i[1]) : [m.href]));
  return hrefs.some((h) => (p.tour && h === p.tour) || pointOfHref(h) === p.id);
}

/** Reads an image's real size (the map's coordinates are % of it). */
function imageSize(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => reject(new Error("Billedet kunne ikke åbnes."));
    img.src = src;
  });
}

/** The menu's rooms (name + place in the tour). */
function menuRooms(T: TourConfig): [string, string][] {
  const all = T.menu.flatMap((m) => ("items" in m ? m.items : [[m.title, m.href] as [string, string]])).filter(([, h]) => isPlaceHref(h));
  return all.filter(([n], i) => all.findIndex(([x]) => x === n) === i);
}

export function MapEditor({ config, edit, focus }: { config: TourConfig; edit: Edit; /** A point to open straight away (from another tab, e.g. a guide stop) - with a counter, so the same point can be asked again. */ focus?: { id: string; n: number } | null }) {
  const M = config.map;
  const [open, setOpen] = useState(false);
  // Asked for a point from another tab: open the map on it (once per ask).
  const [focusSeen, setFocusSeen] = useState(0);
  if (focus && focus.n !== focusSeen) {
    setFocusSeen(focus.n);
    if (M) setOpen(true);
  }
  const [error, setError] = useState<string | null>(null);

  async function setImage(url: string) {
    setError(null);
    try {
      const { w, h } = await imageSize(url);
      // A 2:1 picture is a 360° photo (equirectangular) - shown as one you look around in.
      const panorama = Math.abs(w / h - 2) < 0.05 ? true : undefined;
      edit((d) => {
        d.map = d.map ? { ...d.map, image: url, w, h, panorama } : { image: url, w, h, spots: {}, start: { x: 50, y: 50, zoom: 1 }, panorama };
        if (!Object.keys(d.categories).length) d.categories = { steder: { name: "Steder", color: d.colors.accent } };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  if (!M)
    return (
      <>
      {config.drone && <OverviewUiToggles config={config} edit={edit} />}
      {config.drone && <DroneToMap config={config} edit={edit} />}
      <Group>
        <p className="text-[14px] leading-snug">Start touren på et kort over stedet - en tegning, en situationsplan eller et dronefoto - med punkter man kan trykke på og gå ind fra.</p>
        <p className="text-[12px] leading-snug text-[#8e8e93]">Brug et stort billede (fx 4000 px bredt) - man kan zoome ind på det. JPG eller PNG.</p>
        <UploadButton accept="image/*" label="Upload kortbillede" onDone={setImage} className="block w-full cursor-pointer rounded-xl bg-[#0071e3] py-2.5 text-center text-[15px] font-medium text-white" />
        {error && <p className="text-[12px] text-[#ff3b30]">{error}</p>}
      </Group>
      </>
    );

  const placed = config.points.filter((p) => M.spots[p.id]);
  const missing = menuRooms(config).filter(([name, href]) => !config.points.some((p) => p.name === name || p.tour === href));
  return (
    <>
      <Group>
        <button type="button" onClick={() => setOpen(true)} className="group relative block w-full overflow-hidden rounded-xl ring-1 ring-black/[.06]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={M.image} alt="" className="block w-full" />
          {placed.map((p) => (
            <span key={p.id} className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white" style={{ left: `${M.spots[p.id][0]}%`, top: `${M.spots[p.id][1]}%`, background: config.categories[p.cat]?.color ?? "#333" }} />
          ))}
          <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/25">
            <span className="rounded-full bg-white/95 px-4 py-2 text-[14px] font-semibold text-[#1d1d1f] shadow-lg">Redigér kortet</span>
          </span>
        </button>
        <p className="text-[12px] text-[#8e8e93]">
          {placed.length} punkter på kortet{missing.length ? ` · ${missing.length} rum fra menuen er ikke sat ind endnu` : ""}.
        </p>
      </Group>
      <Group title="Teksten over kortet">
        <Field title="Overskrift">
          <input className={input} value={M.intro?.title ?? config.drone?.intro.title ?? ""} placeholder={config.brand} onChange={(e) => edit((d) => void (d.map!.intro = { title: e.target.value, lead: d.map!.intro?.lead ?? d.drone?.intro.lead ?? "" }))} />
        </Field>
        <Field title="Kort tekst">
          <input className={input} value={M.intro?.lead ?? config.drone?.intro.lead ?? ""} placeholder="Tryk på et sted for at se mere" onChange={(e) => edit((d) => void (d.map!.intro = { title: d.map!.intro?.title ?? d.drone?.intro.title ?? d.brand, lead: e.target.value }))} />
        </Field>
        <Field title="Søgefeltet">
          <input className={input} value={M.searchPlaceholder ?? ""} placeholder="Søg…" onChange={(e) => edit((d) => void (d.map!.searchPlaceholder = e.target.value || undefined))} />
        </Field>
        <Field title="Knappen tilbage til kortet">
          <input className={input} value={M.backLabel ?? config.drone?.backLabel ?? ""} placeholder="Tilbage til kortet" onChange={(e) => edit((d) => void (d.map!.backLabel = e.target.value || undefined))} />
        </Field>
        {!M.panorama && (
          <Toggle
            on={M.clouds !== false}
            onChange={(on) => edit((d) => void (d.map!.clouds = on ? undefined : false))}
            title="Skyer, der driver over"
            hint="Svage skyskygger, der langsomt glider hen over kortet, så det ser levende ud - som et dronefoto en solskinsdag. Slå fra på et rent situationskort eller en tegning."
          />
        )}
      </Group>
      <OverviewUiToggles config={config} edit={edit} />
      <Group title="Billede">
        <div className="flex gap-2">
          <UploadButton accept="image/*" label="Skift kortbillede" onDone={setImage} />
          <button type="button" className="text-[13px] text-[#ff3b30] hover:underline" onClick={() => confirm("Fjern kortet? Punkterne bliver liggende, men vises ikke.") && edit((d) => void (d.map = undefined))}>
            Fjern kortet
          </button>
        </div>
        <AiImageButton src={M.image} onUse={setImage} />
        <p className="text-[12px] text-[#8e8e93]">
          {M.w} × {M.h} px. Punkterne sidder i procent af billedet - et nyt billede i samme udsnit passer stadig.
        </p>
        <Toggle
          on={Boolean(M.panorama)}
          onChange={(on) => edit((d) => void (d.map!.panorama = on || undefined))}
          title="Det er et 360°-billede"
          hint="Touren viser det som 360°, man kan kigge rundt i, med punkterne på - og du sætter punkterne i 360° under Redigér kortet. Slås til af sig selv, når billedet er 2:1."
        />
        {error && <p className="text-[12px] text-[#ff3b30]">{error}</p>}
      </Group>
      {open && <MapCanvas config={config} edit={edit} onClose={() => setOpen(false)} startWith={focus?.id ?? null} />}
    </>
  );
}

/* ------------------------------------------------------------------ */

/** The big canvas: the map, the points on it, and the selected point's settings beside it. */
function MapCanvas({ config, edit, onClose, startWith }: { config: TourConfig; edit: Edit; onClose: () => void; startWith: string | null }) {
  const M = config.map as Map;
  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState<string | null>(startWith && config.points.some((p) => p.id === startWith) ? startWith : null);
  /** What the next click on the map does: put down a new point, one of the menu's rooms, or set the start view's centre. */
  const [placing, setPlacing] = useState<null | { kind: "new" } | { kind: "rooms"; queue: [string, string][] } | { kind: "point"; id: string } | { kind: "start"; mobile: boolean }>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const moved = useRef(false);
  const wrap = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const point = config.points.find((p) => p.id === selected) ?? null;
  const cats = Object.entries(config.categories);
  const rooms = useMemo(() => menuRooms(config), [config]);
  const missing = rooms.filter(([name, href]) => !config.points.some((p) => p.name === name || p.tour === href));
  const unplaced = config.points.filter((p) => !M.spots[p.id]);
  const notInMenu = config.points.filter((p) => M.spots[p.id] && !inMenu(config, p));
  /** A 360° picture is set up in 360° (it can be shown flat too). */
  const [in360, setIn360] = useState(Boolean(M.panorama));
  /** The 360° picture as a computer or a phone shows it (the start view and zoom are set per device). */
  const [phone, setPhone] = useState(false);
  const pano = useRef<{ view: () => { x: number; y: number; zoom: number } } | null>(null);
  const [aiBusy, startAi] = useTransition();
  const [aiNote, setAiNote] = useState<{ text: string; error?: boolean } | null>(null);

  /** nextviewAI finds the menu's rooms and the points not on the picture yet - and puts them where it sees them. */
  function aiPlace() {
    const places = [...missing.map(([name, href]) => ({ key: `rum:${href}`, name })), ...unplaced.map((p) => ({ key: `punkt:${p.id}`, name: p.name, text: p.text }))];
    setAiNote(null);
    startAi(async () => {
      const r = await placeMapSpots(config.slug, M.image, places, Boolean(M.panorama)).catch((err: unknown) => ({ ok: false as const, error: String(err) }));
      if (!r.ok) return setAiNote({ text: r.error, error: true });
      const n = Object.keys(r.spots).length;
      edit((d) => {
        for (const [key, pos] of Object.entries(r.spots)) {
          if (key.startsWith("punkt:")) {
            if (d.points.some((p) => p.id === key.slice(6))) d.map!.spots[key.slice(6)] = pos;
            continue;
          }
          const href = key.slice(4);
          const name = missing.find(([, h]) => h === href)?.[0];
          if (!name) continue;
          const id = freeId(d.points, name);
          const cat = Object.keys(d.categories)[0] ?? "steder";
          if (!d.categories[cat]) d.categories[cat] = { name: "Steder", color: d.colors.accent };
          d.points.push({ id, name, cat, icon: guessIcon(name), yaw: 0, pitch: 0, tour: href, text: "", chips: [] });
          d.map!.spots[id] = pos;
        }
      });
      setAiNote({ text: `${n} ${n === 1 ? "punkt" : "punkter"} sat ind - tjek dem, og flyt dem der sidder skævt. ${r.note}` });
    });
  }

  /** The map's points that aren't in the menu yet: each one in the menu (its room, or the point itself). */
  function addToMenu() {
    edit((d) => {
      for (const p of d.points) if (d.map?.spots[p.id] && !inMenu(d, p)) d.menu.push({ title: p.name, href: p.tour ?? `#punkt:${p.id}` });
    });
    setAiNote({ text: `${notInMenu.length} ${notInMenu.length === 1 ? "punkt" : "punkter"} lagt i menuen - ret rækkefølge og grupper under Menu.` });
  }

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (placing) setPlacing(null);
        else if (selected) setSelected(null);
        else onClose();
      }
      if ((e.key === "Backspace" || e.key === "Delete") && selected && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement)) removePoint(selected);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  const at = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = wrap.current!.getBoundingClientRect();
    const r1 = (v: number) => Math.round(Math.min(100, Math.max(0, v)) * 10) / 10;
    return [r1(((e.clientX - r.left) / r.width) * 100), r1(((e.clientY - r.top) / r.height) * 100)];
  };

  function newPoint(name: string, tour: string | null, pos: [number, number]) {
    const id = freeId(config.points, name);
    const cat = (point && config.categories[point.cat] ? point.cat : null) ?? cats[0]?.[0] ?? "steder";
    edit((d) => {
      if (!d.categories[cat]) d.categories[cat] = { name: "Steder", color: d.colors.accent };
      d.points.push({ id, name, cat, icon: guessIcon(name), yaw: 0, pitch: 0, tour, text: "", chips: [] });
      d.map!.spots[id] = pos;
    });
    return id;
  }
  function removePoint(id: string) {
    edit((d) => {
      d.points = d.points.filter((p) => p.id !== id);
      delete d.map!.spots[id];
      // Nothing left pointing at it: walking times to it, and the finder's answers.
      for (const p of d.points) if (p.walks?.some((w) => w.to === id)) p.walks = p.walks.filter((w) => w.to !== id);
      d.finder?.questions.forEach((q) => q.options.forEach((o) => (o.points = o.points.filter((x) => x !== id))));
    });
    setSelected(null);
  }
  const setPoint = (fn: (p: TourPoint) => void) => edit((d) => void fn(d.points.find((p) => p.id === selected)!));

  function clickMap(e: React.MouseEvent) {
    placeAt(at(e));
  }
  /** A click on the picture (flat or 360°) at `pos`: does what's being placed - or just closes the selected point. */
  function placeAt(pos: [number, number]) {
    if (!placing) return setSelected(null);
    if (placing.kind === "new") {
      setSelected(newPoint("Nyt sted", null, pos));
      setPlacing(null);
    } else if (placing.kind === "point") {
      const id = placing.id;
      edit((d) => void (d.map!.spots[id] = pos));
      setSelected(id);
      setPlacing(null);
    } else if (placing.kind === "rooms") {
      const [[name, href], ...rest] = placing.queue;
      setSelected(newPoint(name, href, pos));
      setPlacing(rest.length ? { kind: "rooms", queue: rest } : null);
    } else {
      const key = placing.mobile ? "startMobile" : "start";
      edit((d) => void (d.map![key] = { x: pos[0], y: pos[1], zoom: d.map![key]?.zoom ?? (placing.mobile ? 1.15 : 1) }));
      setPlacing(null);
    }
  }

  const spot = (p: TourPoint): [number, number] | null => (drag?.id === p.id ? [drag.x, drag.y] : (M.spots[p.id] ?? null));
  const banner =
    placing?.kind === "new"
      ? "Klik på kortet, hvor det nye sted skal være."
      : placing?.kind === "rooms"
        ? `Klik der, hvor "${placing.queue[0][0]}" ligger.`
        : placing?.kind === "point"
          ? `Klik der, hvor "${config.points.find((p) => p.id === placing.id)?.name ?? ""}" ligger.`
        : placing?.kind === "start"
          ? `Klik på midten af det, man skal se først${placing.mobile ? " på mobil" : ""}.`
          : null;

  return (
    <div className="fixed inset-0 z-[80] flex bg-[#1d1d1f]/60 backdrop-blur-sm" role="dialog" aria-label="Redigér kortet">
      <div className="m-4 flex min-h-0 flex-1 overflow-hidden rounded-2xl bg-[#f5f5f7] shadow-2xl">
        {/* The map */}
        <div className="relative flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b border-black/[.06] bg-white px-4 py-2.5">
            <button type="button" onClick={() => setPlacing({ kind: "new" })} className="whitespace-nowrap rounded-full bg-[#0071e3] px-3.5 py-1.5 text-[13px] font-medium text-white">
              + Nyt punkt
            </button>
            {missing.length > 0 && (
              <button type="button" onClick={() => setPlacing({ kind: "rooms", queue: missing })} title="Klik dem ind ét for ét" className="whitespace-nowrap rounded-full bg-[#f2f2f7] px-3.5 py-1.5 text-[13px] font-medium">
                Sæt rum ind ({missing.length})
              </button>
            )}
            {missing.length + unplaced.length > 0 && (
              <button
                type="button"
                disabled={aiBusy}
                onClick={aiPlace}
                title="nextviewAI ser på billedet og sætter menuens rum og de punkter, der mangler, der hvor de er"
                className="whitespace-nowrap rounded-full bg-gradient-to-r from-[#7c3aed] to-[#0071e3] px-3.5 py-1.5 text-[13px] font-medium text-white disabled:opacity-60"
              >
                {aiBusy ? "nextviewAI kigger…" : `✦ nextviewAI sætter dem (${missing.length + unplaced.length})`}
              </button>
            )}
            {notInMenu.length > 0 && (
              <button type="button" onClick={addToMenu} title="Hvert punkt på kortet, der ikke er i menuen, kommer i menuen" className="whitespace-nowrap rounded-full bg-[#f2f2f7] px-3.5 py-1.5 text-[13px] font-medium">
                Læg i menuen ({notInMenu.length})
              </button>
            )}
            {M.panorama && in360 && (
              <span className="flex rounded-full bg-[#f2f2f7] p-0.5 text-[12px] font-medium">
                {([false, true] as const).map((v) => (
                  <button key={String(v)} type="button" onClick={() => setPhone(v)} className={`rounded-full px-2.5 py-1 ${phone === v ? "bg-white shadow" : "text-[#6e6e73]"}`}>
                    {v ? "Mobil" : "Computer"}
                  </button>
                ))}
              </span>
            )}
            {M.panorama && (
              <span className="flex rounded-full bg-[#f2f2f7] p-0.5 text-[12px] font-medium">
                {([true, false] as const).map((v) => (
                  <button key={String(v)} type="button" onClick={() => setIn360(v)} className={`rounded-full px-2.5 py-1 ${in360 === v ? "bg-white shadow" : "text-[#6e6e73]"}`}>
                    {v ? "360°" : "Fladt"}
                  </button>
                ))}
              </span>
            )}
            <span className={`ml-auto flex items-center gap-2 text-[12px] text-[#6e6e73] ${in360 && M.panorama ? "invisible" : ""}`}>
              <button type="button" className="rounded-full bg-[#f2f2f7] px-2.5 py-1 font-medium" onClick={() => setZoom((z) => Math.max(1, +(z - 0.5).toFixed(1)))}>
                −
              </button>
              {Math.round(zoom * 100)} %
              <button type="button" className="rounded-full bg-[#f2f2f7] px-2.5 py-1 font-medium" onClick={() => setZoom((z) => Math.min(5, +(z + 0.5).toFixed(1)))}>
                +
              </button>
            </span>
            <button type="button" onClick={onClose} className="rounded-full bg-[#1d1d1f] px-4 py-1.5 text-[13px] font-medium text-white">
              Færdig
            </button>
          </div>
          {/* The picture keeps its place: the lines about what's going on lie over it, so it never jumps when they come and go. */}
          <div className="relative flex min-h-0 flex-1 flex-col">
          <div className="absolute inset-x-0 top-0 z-20 shadow-sm">
          {banner && (
            <div className="flex items-center gap-3 bg-[#0071e3] px-4 py-2 text-[13px] text-white">
              <span className="font-medium">{banner}</span>
              {placing?.kind === "rooms" && (
                <button type="button" className="underline" onClick={() => setPlacing(placing.queue.length > 1 ? { kind: "rooms", queue: placing.queue.slice(1) } : null)}>
                  Spring over
                </button>
              )}
              <button type="button" className="ml-auto underline" onClick={() => setPlacing(null)}>
                Stop (Esc)
              </button>
            </div>
          )}
          {aiNote && (
            <div className={`flex items-start gap-3 px-4 py-2 text-[13px] ${aiNote.error ? "bg-[#ff3b30]/10 text-[#c4271d]" : "bg-[#7c3aed]/10 text-[#4c1d95]"}`}>
              <span className="flex-1">{aiNote.text}</span>
              <button type="button" className="underline" onClick={() => setAiNote(null)}>
                Luk
              </button>
            </div>
          )}
          </div>
          {in360 && M.panorama ? (
            phone ? (
              <div className="flex min-h-0 flex-1 items-center justify-center bg-[#e9e9ee] px-4 pb-4 pt-14">
                <div className="relative flex h-full max-h-[844px] flex-col overflow-hidden rounded-[36px] border-[10px] border-[#1d1d1f] bg-black shadow-2xl" style={{ aspectRatio: "390 / 844" }}>
                  <Pano360 key="mobil" config={config} phone selected={selected} picking={Boolean(placing)} onApi={(a) => (pano.current = a)} onPick={placeAt} onSelect={setSelected} />
                  <PhoneChrome config={config} />
                </div>
              </div>
            ) : (
              <Pano360 key="computer" config={config} selected={selected} picking={Boolean(placing)} onApi={(a) => (pano.current = a)} onPick={placeAt} onSelect={setSelected} />
            )
          ) : (
          <div ref={scroller} className="min-h-0 flex-1 overflow-auto p-4">
            <div ref={wrap} className={`relative mx-auto select-none ${placing ? "cursor-crosshair" : ""}`} style={{ width: `${zoom * 100}%`, aspectRatio: `${M.w} / ${M.h}` }} onClick={clickMap}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={M.image} alt="" draggable={false} className="block h-full w-full rounded-lg" />
              {(["start", "startMobile"] as const).map((k) =>
                M[k] ? (
                  <span key={k} title={k === "start" ? "Første udsnit (computer)" : "Første udsnit (mobil)"} className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 text-[18px] text-white drop-shadow" style={{ left: `${M[k]!.x}%`, top: `${M[k]!.y}%` }}>
                    {k === "start" ? "⌖" : "▯"}
                  </span>
                ) : null
              )}
              {config.points.map((p) => {
                const pos = spot(p);
                if (!pos) return null;
                const color = config.categories[p.cat]?.color ?? "#333";
                return (
                  <div
                    key={p.id}
                    className={`absolute flex -translate-x-1/2 -translate-y-1/2 cursor-grab items-center gap-1.5 active:cursor-grabbing ${selected === p.id ? "z-10" : ""}`}
                    style={{ left: `${pos[0]}%`, top: `${pos[1]}%`, transform: `translate(-50%,-50%) scale(${p.size ?? 1})` }}
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      e.currentTarget.setPointerCapture(e.pointerId);
                      moved.current = false;
                      setSelected(p.id);
                      setDrag({ id: p.id, x: pos[0], y: pos[1] });
                    }}
                    onPointerMove={(e) => {
                      if (drag?.id !== p.id) return;
                      moved.current = true;
                      const [x, y] = at(e);
                      setDrag({ id: p.id, x, y });
                    }}
                    onPointerUp={() => {
                      if (drag?.id === p.id && moved.current) edit((d) => void (d.map!.spots[p.id] = [drag.x, drag.y]));
                      setDrag(null);
                    }}
                  >
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-full text-white shadow-[0_2px_8px_rgba(0,0,0,.35)] ring-2 ${selected === p.id ? "ring-[#0071e3] ring-offset-2" : "ring-white"}`}
                      style={{ background: color }}
                    >
                      <span className="h-[18px] w-[18px]" dangerouslySetInnerHTML={{ __html: svg(p.icon) }} />
                    </span>
                    <span className="whitespace-nowrap rounded-full bg-white/95 px-2 py-0.5 text-[12px] font-semibold text-[#1d1d1f] shadow">{p.name}</span>
                  </div>
                );
              })}
            </div>
          </div>
          )}
          </div>
        </div>

        {/* Beside the map: the point, or the map's points and categories */}
        <aside className="w-[340px] flex-none space-y-4 overflow-y-auto border-l border-black/[.06] p-4">
          {point ? (
            <PointPanel config={config} point={point} rooms={rooms} setPoint={setPoint} setImageZoom={(src, z) =>
                    edit((d) => {
                      const all = { ...d.imageView };
                      if (z) all[src] = z;
                      else delete all[src];
                      d.imageView = Object.keys(all).length ? all : undefined;
                    })} onMove={() => setPlacing({ kind: "point", id: point.id })} onRemove={() => removePoint(point.id)} onDone={() => setSelected(null)}
              edit={edit}
              setWalk={(to, minutes) =>
                // Both ways: the walk from A to B is the walk from B to A.
                edit((d) => {
                  const put = (from: string, other: string) => {
                    const p = d.points.find((x) => x.id === from);
                    if (!p) return;
                    const rest = (p.walks ?? []).filter((w) => w.to !== other);
                    p.walks = minutes == null ? (rest.length ? rest : undefined) : [...rest, { to: other, minutes }];
                  };
                  put(point.id, to);
                  put(to, point.id);
                })
              } />
          ) : (
            <>
              <Group title="Luftfotoets første udsnit">
                <p className="text-[12px] leading-snug text-[#8e8e93]">{in360 && M.panorama ? `Hvad man ser først på ${phone ? "mobil" : "computer"}. Drej og zoom 360°-billedet til det, man skal se, og tryk. Skift mellem Computer og Mobil øverst.` : "Hvad man ser først. Klik på knappen og så på kortet."}</p>
                {(["start", "startMobile"] as const).filter((k) => !(in360 && M.panorama) || (k === "startMobile") === phone).map((k) => (
                  <div key={k} className="space-y-1.5">
                    {in360 && M.panorama ? (
                      <button
                        type="button"
                        className="w-full rounded-xl bg-white py-2 text-[13px] font-medium text-[#0071e3] ring-1 ring-black/[.06]"
                        onClick={() => {
                          const v = pano.current?.view();
                          if (v) edit((d) => void (d.map![k] = v));
                        }}
                      >
                        {k === "start" ? "Vis dette først - computer" : "Vis dette først - mobil"}
                      </button>
                    ) : (
                      <button type="button" className="w-full rounded-xl bg-white py-2 text-[13px] font-medium text-[#0071e3] ring-1 ring-black/[.06]" onClick={() => setPlacing({ kind: "start", mobile: k === "startMobile" })}>
                        {k === "start" ? "Sæt midten - computer" : "Sæt midten - mobil"}
                      </button>
                    )}
                    {M[k] && (
                      <Field title={`Zoom ${k === "start" ? "computer" : "mobil"}: ${M[k]!.zoom.toFixed(2)}×`}>
                        <input type="range" min={0.7} max={3} step={0.05} className="w-full accent-[#0071e3]" value={M[k]!.zoom} onChange={(e) => edit((d) => void (d.map![k] = { ...d.map![k]!, zoom: Number(e.target.value) }))} />
                      </Field>
                    )}
                  </div>
                ))}
              </Group>
              <CategoriesPanel config={config} edit={edit} />
              {unplaced.length > 0 && (
                <Group title="Punkter, der ikke er på kortet">
                  <p className="text-[12px] text-[#8e8e93]">Fx fra luftfotoet. Tryk og klik så på kortet.</p>
                  <div className="flex flex-wrap gap-1.5">
                    {unplaced.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="rounded-full bg-white px-2.5 py-1 text-[12px] ring-1 ring-black/[.08] hover:ring-[#0071e3]"
                        onClick={() => setPlacing({ kind: "point", id: p.id })}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                </Group>
              )}
              <Group title={`På kortet (${config.points.filter((p) => M.spots[p.id]).length})`}>
                <ul className="-mx-1 space-y-0.5">
                  {config.points
                    .filter((p) => M.spots[p.id])
                    .map((p) => (
                      <li key={p.id}>
                        <button type="button" onClick={() => setSelected(p.id)} className="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left text-[13px] hover:bg-black/[.04]">
                          <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full text-white" style={{ background: config.categories[p.cat]?.color ?? "#333" }}>
                            <span className="h-3 w-3" dangerouslySetInnerHTML={{ __html: svg(p.icon) }} />
                          </span>
                          <span className="flex-1 truncate">{p.name}</span>
                          {!p.tour && <span className="text-[11px] text-[#ff9500]">intet sted</span>}
                        </button>
                      </li>
                    ))}
                </ul>
              </Group>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

type PanoViewer = {
  destroy(): void;
  on(event: string, cb: (e: MouseEvent) => void): void;
  mouseEventToCoords(e: MouseEvent): [number, number];
  addHotSpot(h: Record<string, unknown>): void;
  removeHotSpot(id: string): boolean;
  getPitch(): number;
  getYaw(): number;
  getHfov(): number;
  resize(): void;
};

/**
 * The 360° picture as the visitor sees it - turn and zoom it, click to put a
 * point down (or move one), click a point to pick it. Positions are still
 * kept as % of the flat picture, so the tour shows them the same way.
 */
function Pano360({
  config,
  selected,
  picking,
  phone = false,
  onApi,
  onPick,
  onSelect,
}: {
  config: TourConfig;
  selected: string | null;
  picking: boolean;
  /** As a phone shows it: its own start view and zoom. */
  phone?: boolean;
  /** What the start buttons need: the view shown right now (null when the viewer is gone). */
  onApi: (api: { view: () => { x: number; y: number; zoom: number } } | null) => void;
  onPick: (pos: [number, number]) => void;
  onSelect: (id: string) => void;
}) {
  const M = config.map as Map;
  const el = useRef<HTMLDivElement>(null);
  const viewer = useRef<PanoViewer | null>(null);
  const shown = useRef<string[]>([]);
  const stopResize = useRef<(() => void) | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Read through refs: the viewer's own events are bound once.
  const pick = useRef(onPick);
  const select = useRef(onSelect);
  const giveApi = useRef(onApi);
  useEffect(() => {
    pick.current = onPick;
    select.current = onSelect;
    giveApi.current = onApi;
  });

  useEffect(() => {
    let dead = false;
    (async () => {
      if (!window.pannellum) await import("pannellum/build/pannellum.js");
      if (dead || !el.current || !window.pannellum) return;
      const s = (phone ? (M.startMobile ?? M.start) : M.start) ?? { x: 50, y: 50, zoom: 1 };
      const v = window.pannellum.viewer(el.current, {
        type: "equirectangular",
        panorama: M.image,
        autoLoad: true,
        showFullscreenCtrl: false,
        ...toDir(s.x, s.y),
        hfov: panoHfov(phone, s.zoom),
        minHfov: 25,
        maxHfov: 120,
        hotSpots: [], // addHotSpot needs the list to be there
      }) as unknown as PanoViewer;
      v.on("error", () => setError("360°-billedet kunne ikke vises - prøv Fladt."));
      // A click (not a drag to look around) on the picture itself puts down / moves a point.
      let down: { x: number; y: number } | null = null;
      v.on("mousedown", (e) => (down = { x: e.clientX, y: e.clientY }));
      v.on("mouseup", (e) => {
        const d = down;
        down = null;
        if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) return;
        if ((e.target as HTMLElement | null)?.closest?.(".mk-hs")) return;
        const [pitch, yaw] = v.mouseEventToCoords(e);
        pick.current(toXY(pitch, yaw));
      });
      viewer.current = v;
      // The box changes size (the blue "click where…" line comes and goes): the viewer must follow at once,
      // or a click is read against the old size and the point lands beside where you clicked.
      const box = el.current;
      const ro = new ResizeObserver(() => v.resize());
      ro.observe(box);
      stopResize.current = () => ro.disconnect();
      giveApi.current({
        view: () => {
          const [x, y] = toXY(v.getPitch(), v.getYaw());
          return { x, y, zoom: Math.round(((phone ? PANO_HFOV.mobile : PANO_HFOV.desktop) / v.getHfov()) * 100) / 100 };
        },
      });
      setReady(true);
    })();
    return () => {
      dead = true;
      stopResize.current?.();
      viewer.current?.destroy();
      viewer.current = null;
      giveApi.current(null);
      shown.current = [];
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the viewer is made once per picture; the start view is only where it opens
  }, [M.image, phone]);

  // The points, as hotspots - put up again when they (or the chosen one) change.
  useEffect(() => {
    const v = viewer.current;
    if (!ready || !v) return;
    shown.current.forEach((id) => v.removeHotSpot(id));
    shown.current = [];
    for (const p of config.points) {
      const pos = M.spots[p.id];
      if (!pos) continue;
      const color = config.categories[p.cat]?.color ?? "#333";
      v.addHotSpot({
        id: p.id,
        ...toDir(pos[0], pos[1]),
        cssClass: `mk-hs${selected === p.id ? " mk-valgt" : ""}`,
        createTooltipFunc: (div: HTMLElement) => {
          const dot = document.createElement("span");
          dot.className = "mk-dot";
          dot.style.background = color;
          dot.innerHTML = svg(p.icon);
          const label = document.createElement("span");
          label.className = "mk-navn";
          label.textContent = p.name;
          div.append(dot, label);
        },
        clickHandlerFunc: () => select.current(p.id),
      });
      shown.current.push(p.id);
    }
  }, [ready, config.points, config.categories, M.spots, selected]);

  return (
    <div className={`relative min-h-0 flex-1 ${picking ? "mk-picking" : ""}`}>
      <div ref={el} className="absolute inset-0" />
      {error && <p className="absolute left-4 top-4 rounded-lg bg-white px-3 py-2 text-[13px] text-[#ff3b30] shadow">{error}</p>}
      {!phone && <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1 text-[12px] text-white">Træk for at dreje · rul for at zoome · klik på et punkt for at vælge det</p>}
      <style>{`
.mk-hs{width:0;height:0;overflow:visible;cursor:pointer;z-index:2}
.mk-hs .mk-dot{position:absolute;left:-16px;top:-16px;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,.35);outline:2px solid #fff}
.mk-hs .mk-dot svg{width:18px;height:18px}
.mk-hs .mk-navn{position:absolute;left:22px;top:-11px;white-space:nowrap;border-radius:999px;background:rgba(255,255,255,.95);padding:2px 8px;font:600 12px/18px system-ui,sans-serif;color:#1d1d1f;box-shadow:0 1px 4px rgba(0,0,0,.25)}
.mk-hs.mk-valgt{z-index:3}
.mk-hs.mk-valgt .mk-dot{outline:3px solid #0071e3;outline-offset:2px}
.mk-picking .pnlm-dragfix,.mk-picking .pnlm-render-container{cursor:crosshair!important}
`}</style>
    </div>
  );
}

/** On the phone preview: what lies over the picture in the tour (the box at the top, the menu button, the filter) - roughly as the tour draws it. */
function PhoneChrome({ config }: { config: TourConfig }) {
  const M = config.map as Map;
  const box = config.overviewUi?.box?.mobile !== false;
  const filter = config.overviewUi?.filter?.mobile !== false && Object.keys(config.categories).length > 0;
  return (
    <div className="pointer-events-none absolute inset-0 z-10 text-[12px]">
      {box && (
        <div className="absolute left-2.5 right-[88px] top-2.5 flex items-center overflow-hidden rounded-[14px] shadow-lg" style={{ background: config.colors.soft }}>
          <div className="flex-none px-2.5 py-2" style={{ background: config.colors.main }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {config.logo && <img src={config.logo} alt="" className="h-[30px]" />}
          </div>
          <div className="min-w-0 px-2.5 py-1.5">
            <div className="truncate font-extrabold" style={{ color: config.colors.main }}>
              {M.intro?.title ?? config.drone?.intro.title ?? config.brand}
            </div>
          </div>
        </div>
      )}
      <div className="absolute right-2.5 top-2.5 rounded-full px-3.5 py-2 font-extrabold tracking-wider text-white shadow-lg" style={{ background: config.colors.main }}>
        MENU
      </div>
      {filter && <div className="absolute bottom-2.5 left-2.5 right-2.5 rounded-xl bg-white/95 px-3 py-2 font-semibold text-[#1d1d1f] shadow">{M.filterTitle ?? "Vis"} · {Object.values(config.categories).map((c) => c.name).join(" · ")}</div>}
    </div>
  );
}

/** What lies over the map, per device: the box at the top and the filter - each can be switched off. */
function OverviewUiToggles({ config, edit }: { config: TourConfig; edit: Edit }) {
  const ui = config.overviewUi;
  const set = (what: "box" | "filter", device: "desktop" | "mobile", on: boolean) =>
    edit((d) => {
      const next = { box: { ...d.overviewUi?.box }, filter: { ...d.overviewUi?.filter } };
      if (on) delete next[what][device];
      else next[what][device] = false;
      const clean = (o: object) => (Object.keys(o).length ? o : undefined);
      const box = clean(next.box) as typeof next.box | undefined;
      const filter = clean(next.filter) as typeof next.filter | undefined;
      // The other settings over the map stay as they are.
      const rest = { ...d.overviewUi, box, filter };
      d.overviewUi = Object.values(rest).some((v) => v !== undefined) ? rest : undefined;
    });
  return (
    <Group title="Over kortet">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-[11px] text-[#8e8e93]">
            <th className="pb-1 text-left font-medium" />
            <th className="pb-1 font-medium">Computer</th>
            <th className="pb-1 font-medium">Mobil</th>
          </tr>
        </thead>
        <tbody>
          {(
            [
              ["box", "Boksen øverst", "Logo, overskrift, tekst og den første knap (fx Kontakt os)"],
              ["filter", "Filteret", 'Boksen nederst ("Vis" med kategorierne)'],
            ] as const
          ).map(([what, title, hint]) => (
            <tr key={what}>
              <td className="py-1 pr-2">
                <div className="font-medium text-[#1d1d1f]">{title}</div>
                <div className="text-[11px] leading-snug text-[#8e8e93]">{hint}</div>
              </td>
              {(["desktop", "mobile"] as const).map((device) =>
                // The filter on a phone is set just below (show all, rows, scroll or hide).
                what === "filter" && device === "mobile" ? (
                  <td key={device} className="text-center text-[11px] text-[#8e8e93]" title="Se Filteret på mobil nedenfor">
                    ↓
                  </td>
                ) : (
                  <td key={device} className="text-center">
                    <input type="checkbox" className="h-4 w-4 accent-[#0071e3]" checked={ui?.[what]?.[device] !== false} onChange={(e) => set(what, device, e.target.checked)} />
                  </td>
                )
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <Field title="Filteret på mobil" hint="Vis alle: alle kategorier i rækker, så man ser dem. Rul: én række, man skubber sidelæns. Skjul: intet filter.">
        <Choice
          value={ui?.filter?.mobile === false ? "skjul" : ui?.filterColumns ? String(ui.filterColumns) : ui?.filterScroll ? "rul" : "alle"}
          options={[
            ["alle", "Vis alle"],
            ["2", "2 pr. række"],
            ["3", "3 pr. række"],
            ["rul", "Rul"],
            ["skjul", "Skjul"],
          ]}
          onChange={(v) =>
            edit((d) => {
              const filter = { ...d.overviewUi?.filter };
              if (v === "skjul") filter.mobile = false;
              else delete filter.mobile;
              d.overviewUi = {
                ...d.overviewUi,
                filter: Object.keys(filter).length ? filter : undefined,
                filterColumns: v === "2" || v === "3" ? (Number(v) as 2 | 3) : undefined,
                filterScroll: v === "rul" ? true : undefined,
              };
            })
          }
        />
      </Field>
      {(["desktop", "mobile"] as const).map((device) => (
        <Field key={device} title={`Navne på punkterne - ${device === "desktop" ? "computer" : "mobil"}`} hint={device === "mobile" ? "Aldrig: kun ikonerne - navnet står i kortet, når man trykker. Godt på et travlt luftfoto." : undefined}>
          <Choice
            value={ui?.names?.[device] ?? (device === "mobile" ? "zoom" : "always")}
            options={[
              ["always", "Altid"],
              ["zoom", "Når man zoomer ind"],
              ["never", "Aldrig"],
            ]}
            onChange={(v) =>
              edit((d) => {
                const names = { ...d.overviewUi?.names, [device]: v === (device === "mobile" ? "zoom" : "always") ? undefined : v };
                if (!names[device]) delete names[device];
                d.overviewUi = { ...d.overviewUi, names: Object.keys(names).length ? names : undefined };
              })
            }
          />
        </Field>
      ))}
    </Group>
  );
}

function PointPanel({
  config,
  point: p,
  rooms,
  setPoint,
  setImageZoom,
  onMove,
  onRemove,
  onDone,
  setWalk,
  edit,
}: {
  edit: Edit;
  config: TourConfig;
  point: TourPoint;
  setWalk: (to: string, minutes: number | null) => void;
  rooms: [string, string][];
  setPoint: (fn: (p: TourPoint) => void) => void;
  setImageZoom: (src: string, view: NonNullable<TourConfig["imageView"]>[string] | undefined) => void;
  onMove: () => void;
  onRemove: () => void;
  onDone: () => void;
}) {
  const [allIcons, setAllIcons] = useState(false);
  const icons = Object.keys(ICON_NAMES);
  const shown = allIcons ? icons : icons.slice(0, 16).includes(p.icon) ? icons.slice(0, 16) : [p.icon, ...icons.slice(0, 15)];
  return (
    <>
      <div className="flex items-center justify-between">
        <button type="button" onClick={onDone} className="text-[13px] text-[#0071e3]">
          ‹ Alle punkter
        </button>
        <span className="flex gap-3">
          <button type="button" onClick={onMove} className="text-[13px] text-[#0071e3] hover:underline">
            Flyt
          </button>
          <button type="button" onClick={onRemove} className="text-[13px] text-[#ff3b30] hover:underline">
            Slet punkt
          </button>
        </span>
      </div>
      <Group>
        <Field title="Navn">
          <input
            className={`${input} bg-white`}
            value={p.name}
            onChange={(e) =>
              setPoint((x) => {
                // The icon follows the name while it's still the guessed one (e.g. "Nyt sted" → "Spisesalen" gives the dining icon).
                if (x.icon === guessIcon(x.name)) x.icon = guessIcon(e.target.value);
                x.name = e.target.value;
              })
            }
          />
        </Field>
        <Field title="Kategori">
          <select className={`${input} bg-white`} value={p.cat} onChange={(e) => setPoint((x) => void (x.cat = e.target.value))}>
            {Object.entries(config.categories).map(([id, c]) => (
              <option key={id} value={id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field title={`Størrelse: ${Math.round((p.size ?? 1) * 100)} %`} hint="Større til de vigtigste steder.">
          <input type="range" min={0.6} max={1.8} step={0.05} className="w-full accent-[#0071e3]" value={p.size ?? 1} onChange={(e) => setPoint((x) => void (x.size = Number(e.target.value) === 1 ? undefined : Number(e.target.value)))} />
        </Field>
      </Group>
      <Group title="Ikon">
        <div className="grid grid-cols-8 gap-1">
          {shown.map((name) => (
            <button
              key={name}
              type="button"
              title={ICON_NAMES[name] ?? name}
              onClick={() => setPoint((x) => void (x.icon = name))}
              className={`flex aspect-square items-center justify-center rounded-lg ${p.icon === name ? "bg-[#0071e3] text-white" : "bg-white text-[#1d1d1f] ring-1 ring-black/[.06] hover:ring-[#0071e3]"}`}
            >
              <span className="h-[18px] w-[18px]" dangerouslySetInnerHTML={{ __html: svg(name) }} />
            </button>
          ))}
        </div>
        <button type="button" className="text-[12px] text-[#0071e3]" onClick={() => setAllIcons((v) => !v)}>
          {allIcons ? "Færre ikoner" : `Alle ${icons.length} ikoner`}
        </button>
      </Group>
      <Group title="Når man trykker på det">
        <Field title="Tekst" hint="1-3 korte sætninger om stedet.">
          <textarea className={`${input} min-h-[80px] resize-y bg-white`} value={p.text} onChange={(e) => setPoint((x) => void (x.text = e.target.value))} />
        </Field>
        <Field title="Små mærker" hint="Adskilt af komma, fx: 2 elever, Udsigt, Nyt i år">
          <input className={`${input} bg-white`} value={p.chips.join(", ")} onChange={(e) => setPoint((x) => void (x.chips = e.target.value.split(",").map((c) => c.trim()).filter(Boolean)))} />
        </Field>
        <Field title='"Gå ind" fører til' hint="Et rum fra menuen.">
          <select className={`${input} bg-white`} value={p.tour ?? ""} onChange={(e) => setPoint((x) => void (x.tour = e.target.value || null))}>
            <option value="">Ingen - kun teksten</option>
            {p.tour && !rooms.some(([, h]) => h === p.tour) && <option value={p.tour}>(eget sted)</option>}
            {rooms.map(([name, href]) => (
              <option key={href} value={href}>
                {name}
              </option>
            ))}
          </select>
        </Field>
        <Field title="Billeder" hint="Vises øverst på kortet, man bladrer med et tryk. Fx kundens sommerbilleder af en pool, der er lukket på dronebilledet.">
          {(p.images ?? []).length > 0 && (
            <div className="grid grid-cols-3 gap-1.5">
              {(p.images ?? []).map((src, i) => (
                <div key={src} className="group relative aspect-[16/10] overflow-hidden rounded-lg bg-white ring-1 ring-black/[.06]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    title="Fjern"
                    className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white opacity-0 group-hover:opacity-100"
                    onClick={() =>
                      setPoint((x) => {
                        x.images = (x.images ?? []).filter((_, j) => j !== i);
                        if (!x.images.length) delete x.images;
                      })
                    }
                  >
                    <Icon d='<path d="M6 6l12 12M18 6L6 18"/>' className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <UploadButton accept="image/*" label="Tilføj billede" onDone={(url) => setPoint((x) => void (x.images = [...(x.images ?? []), url]))} />
          {/* The first photo (the one shown first) - e.g. a closed pool made summery. */}
          <AiImageButton src={p.images?.[0] ?? ""} onUse={(url) => setPoint((x) => void (x.images = [url, ...(x.images ?? []).slice(1)]))} />
        </Field>
        <Field title="360°-billede (valgfrit)" hint='Et 360°-foto taget lige her (2:1). Kortet får knappen "Oplev i 360°", og billedet åbner, så man kan kigge rundt.'>
          {p.panorama ? (
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.panorama} alt="" className="h-12 w-24 rounded-lg object-cover ring-1 ring-black/[.06]" />
              <UploadButton accept="image/*" label="Skift" onDone={(url) => setPoint((x) => void (x.panorama = url))} />
              <button type="button" className="text-[13px] text-[#ff3b30] hover:underline" onClick={() => setPoint((x) => void delete x.panorama)}>
                Fjern
              </button>
            </div>
          ) : null}
          {p.panorama && <AiImageButton src={p.panorama} onUse={(url) => setPoint((x) => void (x.panorama = url))} />}
          {!p.panorama && protoPano(config, p) && <PrototypePano config={config} point={p} edit={edit} />}
          {p.panorama ? (
            <PanoZoom src={p.panorama} value={config.imageView?.[p.panorama]} onChange={(z) => setImageZoom(p.panorama!, z)} />
          ) : (
            <UploadButton accept="image/*" label="Upload 360°-billede" onDone={(url) => setPoint((x) => void (x.panorama = url))} />
          )}
        </Field>
        <Field title="Knap" hint='Fx "Book din plads" med linket til bookingen. Tom = ingen knap.'>
          <input
            className={`${input} bg-white`}
            placeholder="Tekst på knappen"
            value={p.button?.label ?? ""}
            onChange={(e) => setPoint((x) => void (x.button = e.target.value || x.button?.href ? { label: e.target.value, href: x.button?.href ?? "" } : undefined))}
          />
          <input
            className={`${input} mt-1.5 bg-white`}
            placeholder="https://…"
            value={p.button?.href ?? ""}
            onChange={(e) => setPoint((x) => void (x.button = e.target.value || x.button?.label ? { label: x.button?.label ?? "", href: e.target.value } : undefined))}
          />
        </Field>
      </Group>
      <Group title="Gåafstande">
        <p className="text-[12px] leading-snug text-[#8e8e93]">
          Hvor mange minutter man går herfra til andre steder. Vises på kortet (&quot;2 min til stranden&quot;) og som streger på billedet, når punktet er åbent. Gælder begge veje.
        </p>
        {(p.walks ?? []).map((w) => {
          const other = config.points.find((x) => x.id === w.to);
          if (!other) return null;
          return (
            <div key={w.to} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-[14px]">{other.name}</span>
              <input
                type="number"
                min={1}
                max={120}
                className={`${input} w-[70px] bg-white py-1.5 text-right`}
                value={w.minutes}
                onChange={(e) => {
                  const n = Math.round(Number(e.target.value));
                  if (n >= 1 && n <= 120) setWalk(w.to, n);
                }}
                aria-label={`Minutter til ${other.name}`}
              />
              <span className="text-[13px] text-[#8e8e93]">min</span>
              <button type="button" className="text-[#c7c7cc] hover:text-[#ff3b30]" title="Fjern" onClick={() => setWalk(w.to, null)}>
                <Icon d='<path d="M6 6l12 12M18 6L6 18"/>' className="h-4 w-4" />
              </button>
            </div>
          );
        })}
        {config.points.some((x) => x.id !== p.id && !p.walks?.some((w) => w.to === x.id)) && (
          <select className={`${input} bg-white`} value="" onChange={(e) => e.target.value && setWalk(e.target.value, 2)}>
            <option value="">+ Gåafstand til …</option>
            {config.points
              .filter((x) => x.id !== p.id && !p.walks?.some((w) => w.to === x.id))
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
          </select>
        )}
      </Group>
    </>
  );
}

/** A prototype's 360° photo (tiles under `panos`) as one picture: the tiles' folder + "-360.jpg" (made from them). */
const protoPano = (T: TourConfig, p: TourPoint) => (p.pano && T.panos ? `${T.panos.basePath}/${p.pano}-360.jpg` : null);

/** Makes a point's prototype 360° photo its own picture - its start direction kept with the picture. */
function adoptPanoPicture(d: TourConfig, id: string, url: string) {
  const p = d.points.find((x) => x.id === id);
  if (!p) return;
  if (p.panoStart) d.imageView = { ...d.imageView, [url]: { ...d.imageView?.[url], yaw: p.panoStart.yaw, pitch: p.panoStart.pitch } };
  p.panorama = url;
  delete p.pano;
  delete p.panoStart;
}

/**
 * A drone scene from the early prototypes is cut into tiles in the code, so
 * the editor can't show it. When the whole 360° picture is there too (the
 * tiles' folder + "-360.jpg", or the scene's own picture), one click makes it
 * the tour's 360° map: the same picture, points, start and words - editable
 * here like any other.
 */
function DroneToMap({ config, edit }: { config: TourConfig; edit: Edit }) {
  const D = config.drone!;
  const image = D.panorama || `${D.basePath}-360.jpg`;
  const [found, setFound] = useState<{ w: number; h: number } | null | undefined>(undefined);
  /** The points' prototype 360° photos that exist as one picture (point id → picture). */
  const [panos, setPanos] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    const all = config.points.map((p) => [p.id, protoPano(config, p)] as const).filter((x): x is readonly [string, string] => Boolean(x[1]));
    Promise.all(all.map(([id, url]) => imageSize(url).then(() => [id, url] as const, () => null))).then((r) => alive && setPanos(Object.fromEntries(r.filter((x) => x != null))));
    return () => {
      alive = false;
    };
  }, [config]);
  useEffect(() => {
    let alive = true;
    imageSize(image).then(
      (s) => alive && setFound(Math.abs(s.w / s.h - 2) < 0.05 ? s : null),
      () => alive && setFound(null)
    );
    return () => {
      alive = false;
    };
  }, [image]);
  const at = (v: { yaw: number; pitch: number; hfov: number }, phone: boolean) => ({
    x: Math.round(((v.yaw + 180) / 360) * 1000) / 10,
    y: Math.round(((90 - v.pitch) / 180) * 1000) / 10,
    zoom: Math.round(((phone ? PANO_HFOV.mobile : PANO_HFOV.desktop) / v.hfov) * 100) / 100,
  });
  return (
    <Group title="Luftfotoet">
      {found === undefined ? (
        <p className="text-[13px] text-[#8e8e93]">Henter luftfotoet…</p>
      ) : found ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="Luftfotoet" className="aspect-[2/1] w-full rounded-xl object-cover ring-1 ring-black/[.06]" />
          <p className="text-[12px] leading-snug text-[#8e8e93]">
            Luftfotoet er fra prototypen og ligger som fliser i koden, så det kan ikke rettes her endnu. Gør det til et almindeligt 360°-billede: samme billede, punkter, start og tekster - og så kan du flytte punkterne, sætte gåafstande, bruge &quot;Find din plads&quot; og skifte billedet.
          </p>
          <button
            type="button"
            className="w-full rounded-xl bg-[#0071e3] py-2.5 text-[15px] font-medium text-white"
            onClick={() =>
              edit((d) => {
                const drone = d.drone!;
                d.map = {
                  image,
                  w: found.w,
                  h: found.h,
                  panorama: true,
                  spots: Object.fromEntries(d.points.map((p) => [p.id, [Math.round(((p.yaw + 180) / 360) * 10000) / 100, Math.round(((90 - p.pitch) / 180) * 10000) / 100]])),
                  start: at(drone.start, false),
                  startMobile: at(drone.startMobile, true),
                  intro: drone.intro,
                  backLabel: drone.backLabel,
                  filterTitle: drone.filterTitle,
                };
                d.drone = undefined;
                // The guide's and points' 360° photos too, so they can be seen and changed here.
                for (const [id, url] of Object.entries(panos)) adoptPanoPicture(d, id, url);
              })
            }
          >
            Gør luftfotoet redigerbart
          </button>
        </>
      ) : (
        <p className="text-[12px] leading-snug text-[#8e8e93]">
          Luftfotoet er fra prototypen og ligger som fliser i koden ({D.basePath}). Det kan ikke rettes her - upload det hele 360°-billede nedenfor for at lave det om til et redigerbart kort.
        </p>
      )}
    </Group>
  );
}

/** A point's 360° photo from the prototype (tiles in the code): shown, and made the point's own picture with one click. */
function PrototypePano({ config, point, edit }: { config: TourConfig; point: TourPoint; edit: Edit }) {
  const url = protoPano(config, point)!;
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    imageSize(url).then(
      () => alive && setOk(true),
      () => alive && setOk(false)
    );
    return () => {
      alive = false;
    };
  }, [url]);
  if (!ok) return ok === false ? <p className="text-[12px] text-[#8e8e93]">Punktet har et 360°-billede fra prototypen (fliser i koden), som ikke kan vises her.</p> : null;
  return (
    <div className="space-y-1.5 rounded-xl bg-white p-2.5 ring-1 ring-black/[.06]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" className="aspect-[2/1] w-full rounded-lg object-cover" />
      <p className="text-[11px] leading-snug text-[#8e8e93]">360°-billedet er fra prototypen. Gør det til punktets eget billede, så du kan sætte zoom, rette det med AI eller skifte det.</p>
      <button type="button" className="w-full rounded-lg bg-[#0071e3] py-1.5 text-[13px] font-medium text-white" onClick={() => edit((d) => adoptPanoPicture(d, point.id, url))}>
        Gør 360°-billedet redigerbart
      </button>
    </div>
  );
}

function CategoriesPanel({ config, edit }: { config: TourConfig; edit: Edit }) {
  const cats = Object.entries(config.categories);
  return (
    <Group title="Kategorier">
      <p className="text-[12px] leading-snug text-[#8e8e93]">Farven på punkterne - og filtret over kortet (fx Her bor du, Værksteder, Udenfor).</p>
      <ul className="space-y-1.5">
        {cats.map(([id, c]) => {
          const used = config.points.filter((p) => p.cat === id).length;
          return (
            <li key={id} className="flex items-center gap-2">
              <input type="color" value={c.color} onChange={(e) => edit((d) => void (d.categories[id].color = e.target.value))} className="h-7 w-7 flex-none cursor-pointer rounded-full border-0 bg-transparent p-0" />
              <input className={`${input} bg-white py-1.5 text-[13px]`} value={c.name} onChange={(e) => edit((d) => void (d.categories[id].name = e.target.value))} />
              <span className="w-6 text-right text-[11px] text-[#8e8e93]">{used}</span>
              <button type="button" disabled={used > 0} title={used ? "Bruges af punkter" : "Fjern"} className="text-[#c7c7cc] hover:text-[#ff3b30] disabled:opacity-30" onClick={() => edit((d) => void delete d.categories[id])}>
                <Icon d='<path d="M6 6l12 12M18 6L6 18"/>' className="h-4 w-4" />
              </button>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        className="w-full rounded-xl bg-white py-2 text-[13px] font-medium text-[#0071e3] ring-1 ring-black/[.06]"
        onClick={() =>
          edit((d) => {
            let n = Object.keys(d.categories).length + 1;
            while (d.categories[`kategori${n}`]) n++;
            d.categories[`kategori${n}`] = { name: "Ny kategori", color: PALETTE[(n - 1) % PALETTE.length] };
          })
        }
      >
        + Kategori
      </button>
    </Group>
  );
}
