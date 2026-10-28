"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ScanMap } from "@/lib/matterport-graph";
import { placeHref } from "../../tours/places";
import type { TourConfig } from "../../tours/types";
import { Group, ssOfHref, type PreviewApi } from "./ui";

/*
 * "Scanpunkter": every scan point seen from above, per floor (MPSkins' Scan
 * Points / Sweep Actions in one). Each dot shows what it's used for - in the
 * menu, a place card, a tag, the start, or hidden. A click flies the preview
 * there; from the point you can hide it, give it a place card, or make it the
 * start.
 */

type Edit = (fn: (draft: TourConfig) => void) => void;

const COLORS = { menu: "#34c759", card: "#5856d6", tag: "#ff9500", plain: "#8e8e93" };

/** How the dots look: the border colour and whether it's hidden, selected or the start. */
type DotLook = { border: string; color?: string; hidden?: boolean; selected?: boolean; start?: boolean };

/**
 * A floor's plan with its scan points, as in MPSkins. Moving about: drag the
 * plan, or scroll (a trackpad's two fingers, the mouse wheel) - zoom with a
 * pinch, Ctrl/Cmd + the wheel or the buttons. Marking many: drag across the
 * dots, or Shift + drag a box. A click on a dot is `onTap`.
 */
function PlanView({
  map,
  floor,
  big,
  zoom,
  setZoom,
  marked,
  setMarked,
  additive,
  look,
  onTap,
  onEmptyClick,
}: {
  map: ScanMap;
  floor: number;
  big: boolean;
  zoom: number;
  setZoom: (z: number) => void;
  marked: Set<number>;
  setMarked: (fn: (m: Set<number>) => Set<number>) => void;
  /** Dragging over dots only ever adds (the picker); else a new drag starts a new marking, unless Shift is held. */
  additive?: boolean;
  look: (ss: number, sid: string) => DotLook;
  onTap: (ss: number) => void;
  onEmptyClick?: () => void;
}) {
  const [failedPlan, setFailedPlan] = useState<string | null>(null);
  const [box, setBox] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const painting = useRef<{ start: number; shift: boolean; moved: boolean } | null>(null);
  const panning = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null);
  const planEl = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  /** Where the box should scroll once the plan is drawn at the new zoom (so the spot under the cursor stays put). */
  const anchor = useRef<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || !anchor.current) return;
    el.scrollLeft = anchor.current.left;
    el.scrollTop = anchor.current.top;
    anchor.current = null;
  }, [zoom]);
  const zoomNow = useRef(zoom);
  useEffect(() => {
    zoomNow.current = zoom;
  });
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    // A non-passive listener, so the page itself doesn't scroll meanwhile.
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      if (!e.ctrlKey && !e.metaKey) {
        // Scrolling moves about the plan (up/down, and sideways on a trackpad or with Shift).
        el.scrollLeft += e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
        if (!e.shiftKey) el.scrollTop += e.deltaY;
        return;
      }
      // A pinch (the browser sends it as Ctrl + wheel) or Ctrl/Cmd + the wheel: zoom around the spot under the cursor.
      const old = zoomNow.current;
      const next = Math.min(8, Math.max(1, old * Math.exp(-Math.max(-50, Math.min(50, e.deltaY)) * 0.01)));
      if (next === old) return;
      const r = el.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      // Several wheel steps can come before the plan is drawn again: go on from where the last one will put it.
      const left = anchor.current?.left ?? el.scrollLeft;
      const top = anchor.current?.top ?? el.scrollTop;
      anchor.current = { left: ((left + x) / old) * next - x, top: ((top + y) / old) * next - y };
      zoomNow.current = next;
      setZoom(next);
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [big, map, floor, setZoom]);
  const pct = (e: React.PointerEvent) => {
    const r = planEl.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 };
  };

  const points = map.points.filter((p) => p.floor === floor);
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const pad = 1.5;
  const [minX, maxX, minY, maxY] = [Math.min(...xs) - pad, Math.max(...xs) + pad, Math.min(...ys) - pad, Math.max(...ys) + pad];
  const w = maxX - minX;
  const h = maxY - minY;
  const plan = map.floors[floor];
  // Only the part of the plan where the scan points are (a plan can cover a whole site, the scans a corner of it) - with a margin.
  const placed = points.filter((p) => p.px != null && p.py != null);
  // Big (full screen): the whole plan, as in MPSkins - there's room for it.
  const crop = big
    ? { l: 0, r: 100, t: 0, b: 100 }
    : placed.length
    ? {
        l: Math.max(0, Math.min(...placed.map((p) => p.px!)) - 9),
        r: Math.min(100, Math.max(...placed.map((p) => p.px!)) + 9),
        t: Math.max(0, Math.min(...placed.map((p) => p.py!)) - 9),
        b: Math.min(100, Math.max(...placed.map((p) => p.py!)) + 9),
      }
    : { l: 0, r: 100, t: 0, b: 100 };
  const cw = Math.max(5, crop.r - crop.l);
  const ch = Math.max(5, crop.b - crop.t);
  /** Dots grow a little with zoom, but less than the plan, so crowded spots open up. */
  const dot = Math.round((big ? 24 : 21) * Math.pow(zoom, 0.35));

  return (
    <div ref={scroller} className={big ? "min-h-0 flex-1 overflow-auto bg-[#ececee]" : "-mx-1 max-h-[560px] overflow-auto rounded-xl bg-[#f5f5f7] ring-1 ring-black/[.04]"}>
      {plan?.image && plan.aspect ? (
        // Matterport's own top-down photo of the floor, with every scan point where it really is - cut to where the points are.
        <div
          className={`relative overflow-hidden ${big ? "mx-auto" : ""}`}
          style={{
            width: big ? `min(${zoom * 100}%, calc(${zoom} * (100vh - 140px) * ${(cw / ch) * plan.aspect}))` : `${zoom * 100}%`,
            aspectRatio: String((cw / ch) * plan.aspect),
          }}
        >
          <div
            ref={planEl}
            className="absolute cursor-grab touch-none select-none active:cursor-grabbing"
            style={{ width: `${10000 / cw}%`, height: `${10000 / ch}%`, left: `${(-crop.l * 100) / cw}%`, top: `${(-crop.t * 100) / ch}%` }}
            onPointerDown={(e) => {
              if (e.target !== e.currentTarget && !(e.target instanceof HTMLImageElement)) return;
              if (e.shiftKey) {
                // Shift + drag: a box that marks the points in it.
                const at = pct(e);
                setBox({ x0: at.x, y0: at.y, x1: at.x, y1: at.y });
                return;
              }
              const el = scroller.current!;
              panning.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop, moved: false };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              const pan = panning.current;
              if (pan && e.buttons === 1) {
                const el = scroller.current!;
                if (Math.abs(e.clientX - pan.x) + Math.abs(e.clientY - pan.y) > 3) pan.moved = true;
                el.scrollLeft = pan.left - (e.clientX - pan.x);
                el.scrollTop = pan.top - (e.clientY - pan.y);
                return;
              }
              if (box && e.buttons === 1) {
                const at = pct(e);
                setBox({ ...box, x1: at.x, y1: at.y });
              }
            }}
            onPointerUp={() => {
              const pan = panning.current;
              panning.current = null;
              if (pan && !pan.moved) onEmptyClick?.();
              if (box) {
                const [l, r, t, b] = [Math.min(box.x0, box.x1), Math.max(box.x0, box.x1), Math.min(box.y0, box.y1), Math.max(box.y0, box.y1)];
                if (r - l > 0.5 || b - t > 0.5)
                  setMarked((m) => new Set([...m, ...points.filter((p) => p.px != null && p.py != null && p.px >= l && p.px <= r && p.py >= t && p.py <= b).map((p) => p.ss)]));
                setBox(null);
              }
              const paint = painting.current;
              painting.current = null;
              // A click (no drag) on a dot.
              if (paint && !paint.moved) onTap(paint.start);
            }}
            onPointerLeave={() => {
              setBox(null);
              painting.current = null;
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={plan.image}
              alt=""
              onError={() => setFailedPlan(plan.image)}
              className={`absolute inset-0 h-full w-full select-none object-contain ${failedPlan === plan.image ? "invisible" : ""}`}
              draggable={false}
            />
            {failedPlan === plan.image && <p className="absolute inset-x-0 bottom-2 text-center text-[12px] text-[#8e8e93]">Plantegningen kunne ikke hentes fra Matterport - genindlæs siden.</p>}
            {points.map((p) => {
              if (p.px == null || p.py == null) return null;
              const l = look(p.ss, p.sid);
              return (
                <button
                  key={p.sid}
                  type="button"
                  title={`Punkt ${p.ss}`}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    painting.current = { start: p.ss, shift: e.shiftKey, moved: false };
                  }}
                  onPointerEnter={(e) => {
                    const paint = painting.current;
                    if (!paint || e.buttons !== 1 || p.ss === paint.start) return;
                    // Dragging from one dot over others: they're all marked (a new marking, unless adding).
                    const first = !paint.moved;
                    paint.moved = true;
                    setMarked((m) => new Set([...(first && !additive && !paint.shift ? [] : m), paint.start, p.ss]));
                  }}
                  className={`absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full font-bold leading-none tracking-tight tabular-nums shadow-[0_1px_4px_rgba(0,0,0,.45)] transition hover:z-10 hover:scale-125 ${marked.has(p.ss) && (additive || marked.size > 1) ? "z-10 ring-[3px] ring-[#0071e3] ring-offset-1" : ""} ${l.selected ? "z-10 scale-125 ring-2 ring-[#1d1d1f]" : ""} ${l.start ? "outline outline-2 outline-offset-2 outline-[#0071e3]" : ""}`}
                  style={{
                    left: `${p.px}%`,
                    top: `${p.py}%`,
                    width: dot,
                    height: dot,
                    fontSize: Math.max(11, dot * 0.5),
                    // Solid white with black digits - readable on any plan, whatever its colours.
                    background: additive && marked.has(p.ss) ? "#0071e3" : "#fff",
                    color: additive && marked.has(p.ss) ? "#fff" : l.hidden ? "#d70015" : "#000",
                    border: l.hidden ? "2px dashed #ff3b30" : `2px solid ${l.border}`,
                  }}
                >
                  {p.ss}
                </button>
              );
            })}
            {box && <div className="pointer-events-none absolute border-2 border-[#0071e3] bg-[#0071e3]/10" style={{ left: `${Math.min(box.x0, box.x1)}%`, top: `${Math.min(box.y0, box.y1)}%`, width: `${Math.abs(box.x1 - box.x0)}%`, height: `${Math.abs(box.y1 - box.y0)}%` }} />}
          </div>
        </div>
      ) : (
        <svg viewBox={`${minX} ${-maxY} ${w} ${h}`} style={{ width: `${zoom * 100}%`, display: "block" }} className="aspect-auto">
          {points.map((p) => {
            const l = look(p.ss, p.sid);
            const on = additive && marked.has(p.ss);
            const r = Math.max(w, h) / 48;
            return (
              <g key={p.sid} onClick={() => onTap(p.ss)} className="cursor-pointer">
                {l.start && <circle cx={p.x} cy={-p.y} r={r * 1.7} fill="none" stroke="#0071e3" strokeWidth={r * 0.35} />}
                <circle cx={p.x} cy={-p.y} r={r} fill={on ? "#0071e3" : l.hidden ? "#fff" : l.border} stroke={l.selected ? "#1d1d1f" : l.hidden ? "#c7c7cc" : "#fff"} strokeWidth={r * 0.25} strokeDasharray={l.hidden ? `${r * 0.4} ${r * 0.3}` : undefined} />
                <text x={p.x} y={-p.y + r * 0.35} textAnchor="middle" fontSize={r * 0.95} fontWeight={700} fill={l.hidden && !on ? "#8e8e93" : "#fff"} className="pointer-events-none select-none">
                  {p.ss}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

/** The +, − and whole-plan buttons over a big plan. */
function ZoomButtons({ setZoom }: { setZoom: (fn: (z: number) => number) => void }) {
  return (
    <>
      <button type="button" title="Zoom ind" onClick={() => setZoom((z) => Math.min(8, z * 1.5))} className="h-9 w-9 rounded-lg bg-[#f2f2f7] text-[17px] font-semibold hover:bg-[#e9e9eb]">
        +
      </button>
      <button type="button" title="Zoom ud" onClick={() => setZoom((z) => Math.max(1, z / 1.5))} className="h-9 w-9 rounded-lg bg-[#f2f2f7] text-[17px] font-semibold hover:bg-[#e9e9eb]">
        −
      </button>
      <button type="button" title="Hele kortet" onClick={() => setZoom(() => 1)} className="h-9 w-9 rounded-lg bg-[#f2f2f7] text-[15px] hover:bg-[#e9e9eb]">
        ↺
      </button>
    </>
  );
}

const MOVE_HINT = "Træk eller scroll for at flytte rundt · knib eller Ctrl/Cmd + hjul for at zoome";

/**
 * Picks the scan points something is shown at (a place card's "Vises ved
 * punkt") on the big plan: click a point to take it or leave it, drag across
 * points or Shift + drag a box to take many.
 */
export function ScanPointPicker({ map, config, mpskinsHidden, title, value, onDone, onClose }: { map: ScanMap; config: TourConfig; mpskinsHidden: string[]; title: string; value: number[]; onDone: (ss: number[]) => void; onClose: () => void }) {
  const [floor, setFloor] = useState(() => Math.max(0, map.points.find((p) => value.includes(p.ss))?.floor ?? 0));
  const [zoom, setZoomState] = useState(1);
  const setZoom = (fn: (z: number) => number) => setZoomState(fn);
  const [marked, setMarked] = useState<Set<number>>(() => new Set(value));
  const hidden = new Set([...config.hiddenSweeps, ...mpskinsHidden]);
  const points = map.points.filter((p) => p.floor === floor);
  const toggle = (ss: number) => setMarked((m) => (m.has(ss) ? new Set([...m].filter((x) => x !== ss)) : new Set([...m, ss])));
  return (
    <div className="fixed inset-0 z-[80] flex bg-[#1d1d1f]/60 p-4 backdrop-blur-sm" role="dialog" aria-label={title} onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b border-black/[.06] px-4 py-2.5">
            {map.floors.length > 1 && (
              <div className="flex rounded-[9px] bg-[#e9e9eb] p-[2px]">
                {map.floors.map((f, i) => (
                  <button key={i} type="button" onClick={() => setFloor(i)} className={`rounded-[7px] px-3 py-[5px] text-[13px] font-medium ${floor === i ? "bg-white shadow" : "text-[#1d1d1f]/70"}`}>
                    {f.name}
                  </button>
                ))}
              </div>
            )}
            <span className="text-[13px] text-[#6e6e73]">Klik på punkterne, det skal vises ved · træk hen over punkter eller Shift + træk en firkant for mange · {MOVE_HINT.toLowerCase()}</span>
            <span className="ml-auto flex flex-none gap-1">
              <ZoomButtons setZoom={setZoom} />
            </span>
          </div>
          <PlanView map={map} floor={floor} big zoom={zoom} setZoom={(z) => setZoomState(z)} marked={marked} setMarked={setMarked} additive look={(ss, sid) => ({ border: "#8e8e93", hidden: hidden.has(sid) })} onTap={toggle} />
        </div>
        <aside className="flex w-[300px] flex-none flex-col border-l border-black/[.06] bg-[#f5f5f7]">
          <div className="border-b border-black/[.06] p-4">
            <p className="text-[15px] font-semibold">{title}</p>
            <p className="text-[12px] text-[#6e6e73]">{marked.size ? `${marked.size} ${marked.size === 1 ? "punkt" : "punkter"} valgt` : "Ingen punkter valgt endnu"}</p>
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-4 content-start gap-1.5 overflow-y-auto p-4">
            {[...points].sort((a, b) => a.ss - b.ss).map((p) => (
              <button
                key={p.sid}
                type="button"
                onClick={() => toggle(p.ss)}
                className={`h-9 rounded-lg border-2 text-[14px] font-semibold tabular-nums ${marked.has(p.ss) ? "border-[#0071e3] bg-[#0071e3] text-white" : hidden.has(p.sid) ? "border-dashed border-[#ff3b30] bg-white text-[#ff3b30]" : "border-[#d1d1d6] bg-white text-[#1d1d1f]"}`}
              >
                {p.ss}
              </button>
            ))}
          </div>
          <div className="flex gap-2 border-t border-black/[.06] p-4">
            <button type="button" onClick={onClose} className="flex-1 rounded-full bg-white py-2 text-[14px] font-medium ring-1 ring-black/[.08]">
              Annullér
            </button>
            <button type="button" onClick={() => onDone([...marked].sort((a, b) => a - b))} className="flex-1 rounded-full bg-[#0071e3] py-2 text-[14px] font-medium text-white">
              Brug {marked.size || ""}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

export function ScanPointsEditor({
  config,
  edit,
  preview,
  map,
  mpskinsHidden,
  expected,
}: {
  config: TourConfig;
  edit: Edit;
  preview: PreviewApi;
  map: ScanMap | null;
  mpskinsHidden: string[];
  /** How many scan points MPSkins knows of (when the tour has an MPSkins page). */
  expected: number | null;
}) {
  const [floor, setFloor] = useState(0);
  /** Matterport's signed link to the plan ran out or failed - points are still shown, on a plain background. */
  const [selected, setSelected] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  /** The plan full screen (as in MPSkins): big, with every point as a number beside it. */
  const [big, setBig] = useState(false);
  /* Marking many at once: drag over the dots - or Shift + drag a box. */
  const [marked, setMarked] = useState<Set<number>>(new Set());

  /** What each scan point is used for in the setup. */
  const uses = useMemo(() => {
    const u = new Map<number, Set<"menu" | "card" | "tag" | "start">>();
    const add = (ss: number | null, what: "menu" | "card" | "tag" | "start") => ss && (u.get(ss) ?? u.set(ss, new Set()).get(ss)!).add(what);
    config.menu.forEach((m) => ("items" in m ? m.items.forEach(([, h]) => add(ssOfHref(h), "menu")) : add(ssOfHref(m.href), "menu")));
    config.places?.forEach((p) => add(ssOfHref(p.href), "menu"));
    config.guide?.stops.forEach((s) => "href" in s && add(ssOfHref(s.href), "menu"));
    config.placeCards?.forEach((c) => c.ss.forEach((n) => add(n, "card")));
    config.info?.forEach((i) => i.ss.forEach((n) => add(n, "tag")));
    add(ssOfHref(config.start), "start");
    return u;
  }, [config]);

  if (!map) return <Group><p className="text-[14px] text-[#6e6e73]">Kunne ikke hente scanpunkterne fra Matterport for denne tour.</p></Group>;

  const points = map.points.filter((p) => p.floor === floor);
  const hidden = new Set([...config.hiddenSweeps, ...mpskinsHidden]);
  const sel = map.points.find((p) => p.ss === selected) ?? null;
  const selUses = sel ? uses.get(sel.ss) : undefined;
  const colorOf = (ss: number) => {
    const u = uses.get(ss);
    return u?.has("card") ? COLORS.card : u?.has("tag") ? COLORS.tag : u?.has("menu") ? COLORS.menu : COLORS.plain;
  };

  function go(ss: number) {
    setSelected(ss);
    preview.go(`Punkt ${ss}`, placeHref(config, ss));
  }

  /** The plan with its points - shown in the panel, or big (full screen); only one of them at a time. */
  const planView = (
    <PlanView
      map={map}
      floor={floor}
      big={big}
      zoom={zoom}
      setZoom={setZoom}
      marked={marked}
      setMarked={setMarked}
      look={(ss, sid) => ({ border: colorOf(ss), hidden: hidden.has(sid), selected: selected === ss, start: uses.get(ss)?.has("start") })}
      onTap={(ss) => {
        setMarked(new Set());
        go(ss);
      }}
      onEmptyClick={() => setMarked(new Set())}
    />
  );

  return (
    <>
      {big && (
        <div className="fixed inset-0 z-[80] flex bg-[#1d1d1f]/60 p-4 backdrop-blur-sm" role="dialog" aria-label="Scanpunkter" onKeyDown={(e) => e.key === "Escape" && setBig(false)}>
          <div className="flex min-h-0 flex-1 overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-center gap-2 border-b border-black/[.06] px-4 py-2.5">
                {map.floors.length > 1 && (
                  <div className="flex rounded-[9px] bg-[#e9e9eb] p-[2px]">
                    {map.floors.map((f, i) => (
                      <button key={i} type="button" onClick={() => setFloor(i)} className={`rounded-[7px] px-3 py-[5px] text-[13px] font-medium ${floor === i ? "bg-white shadow" : "text-[#1d1d1f]/70"}`}>
                        {f.name}
                      </button>
                    ))}
                  </div>
                )}
                <span className="text-[13px] text-[#6e6e73]">Klik på et punkt for at vælge det · træk hen over punkter eller Shift + træk en firkant for at markere mange · {MOVE_HINT.toLowerCase()}</span>
                <span className="ml-auto flex flex-none gap-1">
                  <ZoomButtons setZoom={setZoom} />
                  <button type="button" onClick={() => setBig(false)} className="ml-2 rounded-full bg-[#1d1d1f] px-4 text-[13px] font-medium text-white">
                    Færdig
                  </button>
                </span>
              </div>
              {planView}
            </div>
            <aside className="flex w-[300px] flex-none flex-col border-l border-black/[.06] bg-[#f5f5f7]">
              <div className="border-b border-black/[.06] p-4">
                <p className="text-[15px] font-semibold">{points.length} scanpunkter</p>
                <p className="text-[12px] text-[#6e6e73]">{points.filter((p) => hidden.has(p.sid)).length} skjult · klik et nummer for at gå derhen</p>
              </div>
              {sel && (
                <div className="space-y-2 border-b border-black/[.06] p-4">
                  <p className="text-[14px] font-semibold">Punkt {sel.ss}</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {!mpskinsHidden.includes(sel.sid) && (
                      <button
                        type="button"
                        className="rounded-lg bg-white py-1.5 text-[13px] font-medium text-[#0071e3] ring-1 ring-black/[.06]"
                        onClick={() => edit((d) => void (d.hiddenSweeps = d.hiddenSweeps.includes(sel.sid) ? d.hiddenSweeps.filter((x) => x !== sel.sid) : [...d.hiddenSweeps, sel.sid]))}
                      >
                        {config.hiddenSweeps.includes(sel.sid) ? "Vis punktet" : "Skjul punktet"}
                      </button>
                    )}
                  </div>
                </div>
              )}
              {marked.size > 1 && (
                <div className="flex items-center gap-1.5 border-b border-black/[.06] p-3">
                  <span className="flex-1 text-[13px] font-medium">{marked.size} markeret</span>
                  {(
                    [
                      ["Skjul", true],
                      ["Vis", false],
                    ] as const
                  ).map(([text, hide]) => (
                    <button
                      key={text}
                      type="button"
                      className="rounded-full bg-white px-3 py-1 text-[13px] font-medium text-[#0071e3] ring-1 ring-black/[.06]"
                      onClick={() =>
                        edit((d) => {
                          const sids = map.points.filter((p) => marked.has(p.ss) && !mpskinsHidden.includes(p.sid)).map((p) => p.sid);
                          d.hiddenSweeps = hide ? [...new Set([...d.hiddenSweeps, ...sids])] : d.hiddenSweeps.filter((x) => !sids.includes(x));
                        })
                      }
                    >
                      {text}
                    </button>
                  ))}
                </div>
              )}
              <div className="grid min-h-0 flex-1 grid-cols-4 content-start gap-1.5 overflow-y-auto p-4">
                {[...points].sort((a, b) => a.ss - b.ss).map((p) => (
                  <button
                    key={p.sid}
                    type="button"
                    onClick={() => go(p.ss)}
                    className={`h-9 rounded-lg border-2 text-[14px] font-semibold tabular-nums ${selected === p.ss ? "border-[#1d1d1f] bg-white" : hidden.has(p.sid) ? "border-dashed border-[#ff3b30] bg-white text-[#ff3b30]" : "bg-white text-[#1d1d1f]"}`}
                    style={selected === p.ss || hidden.has(p.sid) ? undefined : { borderColor: colorOf(p.ss) }}
                  >
                    {p.ss}
                  </button>
                ))}
              </div>
            </aside>
          </div>
        </div>
      )}
      {expected != null && expected > map.points.length && (
        <p className="rounded-xl bg-[#ff9500]/10 px-3 py-2 text-[12px] leading-snug text-[#a05a00]">
          Matterport sendte kun {map.points.length} af {expected} scanpunkter (det sker af og til - MPSkins kender det også). De manglende virker stadig i touren - de findes, når touren åbner - men vises ikke på kortet.
        </p>
      )}
      <Group>
        <div className="flex items-center gap-2">
          {map.floors.length > 1 && (
            <div className="flex rounded-[9px] bg-[#e9e9eb] p-[2px]">
              {map.floors.map((f, i) => (
                <button key={i} type="button" onClick={() => setFloor(i)} className={`rounded-[7px] px-3 py-[5px] text-[13px] font-medium ${floor === i ? "bg-white shadow" : "text-[#1d1d1f]/70"}`}>
                  {f.name}
                </button>
              ))}
            </div>
          )}
          <span className="text-[12px] text-[#8e8e93]">{points.length} punkter</span>
          <div className="ml-auto flex gap-1">
            <button type="button" onClick={() => (setBig(true), setZoom(1))} className="rounded-full bg-[#0071e3] px-3 text-[12px] font-medium text-white">
              Stor visning
            </button>
            {(["−", "+"] as const).map((t) => (
              <button key={t} type="button" onClick={() => setZoom((z) => Math.min(6, Math.max(1, z * (t === "+" ? 1.5 : 1 / 1.5))))} className="h-7 w-7 rounded-full bg-[#f2f2f7] text-[15px] font-semibold hover:bg-[#e9e9eb]">
                {t}
              </button>
            ))}
          </div>
        </div>
        {big ? (
          <p className="rounded-xl bg-[#f5f5f7] px-3 py-6 text-center text-[13px] text-[#8e8e93]">Kortet er åbent i stor visning.</p>
        ) : (
          planView
        )}
        {marked.size > 1 ? (
          <div className="flex items-center gap-2 rounded-xl bg-[#0071e3]/10 px-3 py-2">
            <span className="flex-1 text-[13px] font-medium">{marked.size} punkter markeret</span>
            {(
              [
                ["Skjul", true],
                ["Vis", false],
              ] as const
            ).map(([text, hide]) => (
              <button
                key={text}
                type="button"
                className="rounded-full bg-white px-3 py-1 text-[13px] font-medium text-[#0071e3] ring-1 ring-black/[.06]"
                onClick={() =>
                  edit((d) => {
                    const sids = map.points.filter((p) => marked.has(p.ss) && !mpskinsHidden.includes(p.sid)).map((p) => p.sid);
                    d.hiddenSweeps = hide ? [...new Set([...d.hiddenSweeps, ...sids])] : d.hiddenSweeps.filter((s) => !sids.includes(s));
                  })
                }
              >
                {text}
              </button>
            ))}
            <button type="button" className="px-1 text-[13px] text-[#6e6e73]" onClick={() => setMarked(new Set())}>
              Fravælg
            </button>
          </div>
        ) : (
          <p className="text-[11px] text-[#8e8e93]">Klik på et punkt for at gå derhen. Træk hen over punkter - eller Shift + træk en firkant - for at markere mange og skjule/vise dem på én gang. Træk eller scroll for at flytte rundt, knib eller Ctrl/Cmd + hjul for at zoome.</p>
        )}
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[#6e6e73]">
          {(
            [
              [COLORS.menu, "I menuen / steder"],
              [COLORS.card, "Stedkort"],
              [COLORS.tag, "Tag"],
              [COLORS.plain, "Ikke brugt"],
            ] as const
          ).map(([c, t]) => (
            <span key={t} className="flex items-center gap-1">
              <i className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />
              {t}
            </span>
          ))}
          <span className="flex items-center gap-1">
            <i className="h-2.5 w-2.5 rounded-full border border-dashed border-[#c7c7cc] bg-white" />
            Skjult
          </span>
          <span className="flex items-center gap-1">
            <i className="h-2.5 w-2.5 rounded-full ring-2 ring-[#0071e3]" />
            Start
          </span>
        </div>
      </Group>

      {sel ? (
        <Group title={`Punkt ${sel.ss}`}>
          <p className="text-[13px] text-[#6e6e73]">
            {selUses?.size
              ? [selUses.has("start") && "Touren starter her", selUses.has("menu") && "Bruges i menuen", selUses.has("card") && "Har stedkort", selUses.has("tag") && "Har tags"].filter(Boolean).join(" · ")
              : "Bruges ikke endnu."}{" "}
            Forhåndsvisningen står her nu.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {mpskinsHidden.includes(sel.sid) ? (
              <span className="col-span-2 rounded-xl bg-[#f2f2f7] px-3 py-2 text-[13px] text-[#6e6e73]">Skjult i MPSkins - vises aldrig.</span>
            ) : (
              <button
                type="button"
                className="rounded-xl bg-white py-2 text-[14px] font-medium text-[#0071e3] ring-1 ring-black/[.06] hover:bg-[#0071e3]/5"
                onClick={() => edit((d) => void (d.hiddenSweeps = d.hiddenSweeps.includes(sel.sid) ? d.hiddenSweeps.filter((s) => s !== sel.sid) : [...d.hiddenSweeps, sel.sid]))}
              >
                {config.hiddenSweeps.includes(sel.sid) ? "Vis punktet" : "Skjul punktet"}
              </button>
            )}
            <button
              type="button"
              className="rounded-xl bg-white py-2 text-[14px] font-medium text-[#0071e3] ring-1 ring-black/[.06] hover:bg-[#0071e3]/5"
              onClick={() => edit((d) => void (d.placeCards = [...(d.placeCards ?? []), { ss: [sel.ss], title: "Nyt stedkort", text: "" }]))}
            >
              + Stedkort her
            </button>
            <button
              type="button"
              className="rounded-xl bg-white py-2 text-[14px] font-medium text-[#0071e3] ring-1 ring-black/[.06] hover:bg-[#0071e3]/5"
              onClick={async () => {
                const r = await preview.view();
                edit((d) => void d.menu.push({ title: r.room ?? `Punkt ${sel.ss}`, href: r.href && ssOfHref(r.href) === sel.ss ? r.href : placeHref(d, sel.ss) }));
              }}
            >
              + Til menuen
            </button>
          </div>
          <p className="text-[11px] leading-snug text-[#8e8e93]">
            &quot;Til menuen&quot; bruger den retning, forhåndsvisningen kigger - drej først. Hvor touren starter, vælges under Start. Stedkortets tekst skrives under Stedkort.
          </p>
        </Group>
      ) : (
        <p className="px-1 text-[12px] text-[#8e8e93]">Klik på et punkt for at gå derhen i forhåndsvisningen.</p>
      )}
    </>
  );
}
