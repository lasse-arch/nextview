"use client";

import { useEffect, useRef, useState } from "react";
import { fetchNextStayUnits } from "@/lib/actions/tour-sites";
import { readPlanNumbers } from "@/lib/actions/tour-ai";
import { placeByNumbers } from "./unit-place";
import { matchSitePlan } from "@/lib/actions/tour-ai";
import { fitPlan } from "./plan-fit";
import type { SiteUnit, TourConfig } from "../../tours/types";
import { quadSolve } from "../staging";
import { Field, Group, input, Toggle, UploadButton } from "./ui";
import { loadSource, spotOfFlat, type Shot } from "./flat-from-pano";
import { groundOf, spotOfGround } from "../site-plan-360";

/*
 * "Pladskort over luftfotoet" in Luftfoto og kort: the campsite's own site
 * plan, laid see-through on the flat drone photo by dragging its four
 * corners onto the right spots, and its pitches and cabins - fetched from
 * Next-Stay with their place on its plan, then nudged by dragging if needed -
 * so the tour can light up the free ones for the visitor's dates.
 */

type Edit = (fn: (d: TourConfig) => void) => void;
type Corners = [[number, number], [number, number], [number, number], [number, number]];
const START: Corners = [
  [25, 25],
  [75, 25],
  [75, 75],
  [25, 75],
];
const CORNER_NAMES = ["Øverst til venstre", "Øverst til højre", "Nederst til højre", "Nederst til venstre"];
const small = "px-1 text-[12px] leading-snug text-[#8e8e93]";
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function naturalSize(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => reject(new Error("Pladskortet kunne ikke hentes."));
    img.src = src;
  });
}

/** Follows a box's width (for drawing on it in px). */
function useWidth(ref: React.RefObject<HTMLDivElement | null>) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

/** Dragging something on a box: reports where the pointer is, in % of the box. */
function dragIn(box: HTMLDivElement | null, e: React.PointerEvent, onMove: (x: number, y: number) => void) {
  if (!box) return;
  e.preventDefault();
  e.stopPropagation();
  const target = e.currentTarget as HTMLElement;
  target.setPointerCapture(e.pointerId);
  const move = (ev: PointerEvent) => {
    const r = box.getBoundingClientRect();
    const x = Math.round(((ev.clientX - r.left) / r.width) * 1000) / 10;
    const y = Math.round(((ev.clientY - r.top) / r.height) * 1000) / 10;
    onMove(Math.min(150, Math.max(-50, x)), Math.min(150, Math.max(-50, y)));
  };
  const up = () => {
    target.removeEventListener("pointermove", move);
    target.removeEventListener("pointerup", up);
    target.removeEventListener("pointercancel", up);
  };
  target.addEventListener("pointermove", move);
  target.addEventListener("pointerup", up);
  target.addEventListener("pointercancel", up);
}

/** On a 360° photo the plan is placed on the view straight down (as wide as this) - its corners are kept as spots on the 360° photo. */
const DOWN: Shot = { heading: 0, fov: 140 };

export function SitePlanEditor({ config, edit, slug }: { config: TourConfig; edit: Edit; slug: string }) {
  const M = config.map!;
  const plan = config.sitePlan;
  const overlay = plan?.overlay;
  /** Where a new plan's corners start: the middle of the picture (on a 360° photo: the middle of the ground straight down). */
  const start = (): Corners => (M.panorama ? (START.map((c) => spotOfFlat(c, DOWN)) as Corners) : START);

  if (!plan)
    return (
      <Group title="Pladskort over luftfotoet">
        <p className="text-[14px] leading-snug">Læg pladskortet gennemsigtigt oven på luftfotoet - gæsten slår det til og fra, vælger datoer og ser de ledige pladser lyse grønt.</p>
        <UploadButton
          accept="image/*"
          label="Upload pladskortet"
          onDone={(url) => edit((d) => void (d.sitePlan = { image: url, label: "Se på pladskortet", overlay: { corners: start(), opacity: 0.55 } }))}
          className="block w-full cursor-pointer rounded-xl bg-[#0071e3] py-2.5 text-center text-[15px] font-medium text-white"
        />
      </Group>
    );

  return (
    <Group title="Pladskort over luftfotoet">
      <Toggle
        on={Boolean(overlay)}
        onChange={(on) => edit((d) => void (d.sitePlan!.overlay = on ? (d.sitePlan!.overlay ?? { corners: start(), opacity: 0.55 }) : undefined))}
        title="Vis pladskortet over luftfotoet"
        hint={M.panorama ? "Gæsten får en kontakt, Pladskort, i 360°-luftfotoet - kortet ligger på jorden og bliver liggende, når man drejer." : "Gæsten får en kontakt, Pladskort, på luftfotoet. Virker bedst med et dronefoto taget lige oppefra."}
      />
      {overlay && (
        <>
          <p className={small}>Træk de fire hjørner, så pladskortet ligger præcis oven på luftfotoet - ret ind efter fx servicebygningen og vejene.</p>
          {M.panorama ? (
            <CornerPlacer360 slug={slug} pano={M.image} image={plan.image} corners={overlay.corners} opacity={overlay.opacity ?? 0.55} onChange={(corners) => edit((d) => void (d.sitePlan!.overlay!.corners = corners))} />
          ) : (
            <CornerPlacer slug={slug} M={M} image={plan.image} corners={overlay.corners} opacity={overlay.opacity ?? 0.55} onChange={(corners) => edit((d) => void (d.sitePlan!.overlay!.corners = corners))} />
          )}
          <Field title={`Gennemsigtighed: ${Math.round((overlay.opacity ?? 0.55) * 100)} %`}>
            <input
              type="range"
              min={20}
              max={100}
              step={5}
              value={Math.round((overlay.opacity ?? 0.55) * 100)}
              onChange={(e) => edit((d) => void (d.sitePlan!.overlay!.opacity = Number(e.target.value) / 100))}
              className="w-full"
            />
          </Field>
        </>
      )}
      <div className="flex items-center gap-2">
        <UploadButton accept="image/*" label="Skift pladskortet" onDone={(url) => edit((d) => void (d.sitePlan!.image = url))} />
        <button type="button" className="text-[13px] text-[#ff3b30] hover:underline" onClick={() => confirm("Fjern pladskortet og pladserne?") && edit((d) => void (d.sitePlan = undefined))}>
          Fjern
        </button>
      </div>
      <Field title="Knappen på punkter" hint="Fx på en plads' kort: åbner pladskortet i fuld skærm.">
        <input className={input} value={plan.label} onChange={(e) => edit((d) => void (d.sitePlan!.label = e.target.value))} />
      </Field>
      <NextStay config={config} edit={edit} slug={slug} />
    </Group>
  );
}

/** The drone photo with the plan bent onto it, and its four corners to drag. */
function CornerPlacer({ slug, M, image, corners, opacity, onChange }: { slug: string; M: NonNullable<TourConfig["map"]>; image: string; corners: Corners; opacity: number; onChange: (c: Corners) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const w = useWidth(box);
  const h = (w * M.h) / M.w;
  const c = w ? quadSolve(1000, 1000, corners.map(([x, y]) => ({ x: (x / 100) * w, y: (y / 100) * h }))) : null;
  const matrix = c ? `matrix3d(${c[0]},${c[3]},0,${c[6]},${c[1]},${c[4]},0,${c[7]},0,0,1,0,${c[2]},${c[5]},0,1)` : undefined;
  return (
    <div className="space-y-2">
    <div ref={box} className="relative w-full touch-none select-none overflow-hidden rounded-xl ring-1 ring-black/[.06]" style={{ aspectRatio: `${M.w} / ${M.h}` }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={M.image} alt="" draggable={false} className="absolute inset-0 h-full w-full" />
      {matrix && (
        <div className="pointer-events-none absolute left-0 top-0" style={{ width: 1000, height: 1000, transformOrigin: "0 0", transform: matrix, opacity }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="" draggable={false} className="block h-full w-full" />
        </div>
      )}
      {corners.map(([x, y], i) => (
        <button
          key={i}
          type="button"
          title={CORNER_NAMES[i]}
          aria-label={CORNER_NAMES[i]}
          className="absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 cursor-move rounded-full border-2 border-white bg-[#0071e3] shadow-md"
          style={{ left: `${x}%`, top: `${y}%` }}
          onPointerDown={(e) =>
            dragIn(box.current, e, (nx, ny) => {
              const next = corners.map((p) => [...p]) as Corners;
              next[i] = [nx, ny];
              onChange(next);
            })
          }
        />
      ))}
    </div>
      <AiPlace slug={slug} plan={image} photo={async () => M.image} onCorners={(c) => onChange(c)} />
    </div>
  );
}

/**
 * The same on a 360° aerial photo: the ground seen straight down from the
 * drone, worked out from the 360° photo. Straight down, flat ground is a true
 * picture of itself (no bending), so the view can be moved, zoomed and turned
 * freely - to where the campsite is, even far from under the drone - and the
 * plan laid on it: its corners one by one, or the whole plan moved, turned
 * and scaled. The corners are saved as spots on the 360° photo.
 */
type GroundView = { cx: number; cz: number; k: number; heading: number };
type G = { x: number; y: number };
const VIEW_PX = 760;

/** A view's frame on the ground: its top (forward) and right. */
function axes(heading: number) {
  const t = (heading * Math.PI) / 180;
  return { F: { x: Math.sin(t), y: Math.cos(t) }, R: { x: Math.cos(t), y: -Math.sin(t) } };
}
/** % of the view -> the ground, and back. */
function groundAt(v: GroundView, [px, py]: [number, number]): G {
  const { F, R } = axes(v.heading);
  const r = (px / 50 - 1) * v.k;
  const f = -(py / 50 - 1) * v.k;
  return { x: v.cx + r * R.x + f * F.x, y: v.cz + r * R.y + f * F.y };
}
function viewAt(v: GroundView, g: G): [number, number] {
  const { F, R } = axes(v.heading);
  const dx = g.x - v.cx;
  const dy = g.y - v.cz;
  return [((dx * R.x + dy * R.y) / v.k + 1) * 50, (-(dx * F.x + dy * F.y) / v.k + 1) * 50];
}

/** The ground in the view, read from the 360° photo (bilinear). */
function renderGround(src: { data: Uint8ClampedArray; w: number; h: number }, size: number, v: GroundView): ImageData {
  const out = new ImageData(size, size);
  const { data, w, h } = src;
  const { F, R } = axes(v.heading);
  const px = (x: number, y: number, c: number) => data[(y * w + x) * 4 + c];
  for (let j = 0; j < size; j++) {
    const f = -(((j + 0.5) / size) * 2 - 1) * v.k;
    for (let i = 0; i < size; i++) {
      const r = (((i + 0.5) / size) * 2 - 1) * v.k;
      const gx = v.cx + r * R.x + f * F.x;
      const gz = v.cz + r * R.y + f * F.y;
      const yaw = (Math.atan2(gx, gz) * 180) / Math.PI;
      const pitch = (Math.atan2(-1, Math.hypot(gx, gz)) * 180) / Math.PI;
      let sx = ((yaw + 180) / 360) * w - 0.5;
      const sy = Math.min(h - 1.001, Math.max(0, ((90 - pitch) / 180) * h - 0.5));
      sx = ((sx % w) + w) % w;
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = (x0 + 1) % w;
      const y1 = Math.min(h - 1, y0 + 1);
      const ax = sx - x0;
      const ay = sy - y0;
      const o = (j * size + i) * 4;
      for (let c = 0; c < 3; c++) out.data[o + c] = (px(x0, y0, c) * (1 - ax) + px(x1, y0, c) * ax) * (1 - ay) + (px(x0, y1, c) * (1 - ax) + px(x1, y1, c) * ax) * ay;
      out.data[o + 3] = 255;
    }
  }
  return out;
}

/** A view that shows the whole plan with room around it (or the ground under the drone). */
function fitView(ground: G[] | null): GroundView {
  if (!ground) return { cx: 0, cz: 0, k: 2.75, heading: 0 };
  const cx = ground.reduce((a, g) => a + g.x, 0) / 4;
  const cz = ground.reduce((a, g) => a + g.y, 0) / 4;
  const k = Math.max(0.5, ...ground.map((g) => Math.max(Math.abs(g.x - cx), Math.abs(g.y - cz)))) * 1.35;
  return { cx, cz, k, heading: 0 };
}

function CornerPlacer360({ slug, pano, image, corners, opacity, onChange }: { slug: string; pano: string; image: string; corners: Corners; opacity: number; onChange: (c: Corners) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const w = useWidth(box);
  const [src, setSrc] = useState<{ data: Uint8ClampedArray; w: number; h: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ground = corners.map((c) => groundOf(c));
  const valid = ground.every(Boolean) ? (ground as G[]) : null;
  const [view, setView] = useState<GroundView>(() => fitView(valid));
  useEffect(() => {
    let dead = false;
    loadSource(pano, 6144)
      .then((s) => !dead && setSrc(s))
      .catch((e: unknown) => !dead && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      dead = true;
    };
  }, [pano]);
  // The wheel zooms the picture (not the page) - a listener that may stop the page scrolling.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      setView((v) => ({ ...v, k: Math.min(40, Math.max(0.2, v.k * (e.deltaY > 0 ? 1.12 : 1 / 1.12))) }));
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);
  useEffect(() => {
    if (!src || !canvas.current) return;
    canvas.current.width = VIEW_PX;
    canvas.current.height = VIEW_PX;
    canvas.current.getContext("2d")!.putImageData(renderGround(src, VIEW_PX, view), 0, 0);
  }, [src, view]);
  // The plan's corners in the view (a corner above the horizon can't be on the ground: it starts in the middle).
  const g: G[] = valid ?? START.map((c) => groundAt(view, c));
  const flat = g.map((p) => viewAt(view, p)) as Corners;
  const save = (next: G[]) => onChange(next.map((p) => spotOfGround(p)) as Corners);
  const mid = { x: g.reduce((a, p) => a + p.x, 0) / 4, y: g.reduce((a, p) => a + p.y, 0) / 4 };
  /** The whole plan turned (degrees, around its middle) and scaled. */
  const transform = (deg: number, scale: number) => {
    const t = (deg * Math.PI) / 180;
    save(g.map((p) => ({ x: mid.x + ((p.x - mid.x) * Math.cos(t) - (p.y - mid.y) * Math.sin(t)) * scale, y: mid.y + ((p.x - mid.x) * Math.sin(t) + (p.y - mid.y) * Math.cos(t)) * scale })));
  };
  const c = w ? quadSolve(1000, 1000, flat.map(([x, y]) => ({ x: (x / 100) * w, y: (y / 100) * w }))) : null;
  const matrix = c ? `matrix3d(${c[0]},${c[3]},0,${c[6]},${c[1]},${c[4]},0,${c[7]},0,0,1,0,${c[2]},${c[5]},0,1)` : undefined;
  const [mx, my] = viewAt(view, mid);
  const btn = "rounded-lg bg-white px-2.5 py-1.5 text-[13px] font-medium text-[#0071e3] ring-1 ring-black/[.06] hover:bg-[#0071e3]/5";
  return (
    <div className="space-y-2">
      <div
        ref={box}
        className="relative aspect-square w-full cursor-grab touch-none select-none overflow-hidden rounded-xl bg-[#f2f2f7] ring-1 ring-black/[.06] active:cursor-grabbing"
        // Drag the picture to move about; the wheel zooms.
        onPointerDown={(e) => {
          if (e.target !== e.currentTarget && e.target !== canvas.current) return;
          const v0 = view;
          let last: [number, number] | null = null;
          dragIn(box.current, e, (x, y) => {
            if (!last) last = [x, y];
            const a = groundAt(v0, last);
            const b = groundAt(v0, [x, y]);
            setView({ ...v0, cx: v0.cx - (b.x - a.x), cz: v0.cz - (b.y - a.y) });
          });
        }}
      >
        <canvas ref={canvas} className="pointer-events-none absolute inset-0 h-full w-full" />
        {!src && !error && <span className="absolute inset-0 flex items-center justify-center text-[13px] text-[#8e8e93]">Henter 360°-fotoet …</span>}
        {matrix && (
          <div className="pointer-events-none absolute left-0 top-0" style={{ width: 1000, height: 1000, transformOrigin: "0 0", transform: matrix, opacity }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image} alt="" draggable={false} className="block h-full w-full" />
          </div>
        )}
        {/* The whole plan: drag its middle to move it. */}
        <button
          type="button"
          title="Flyt hele pladskortet"
          aria-label="Flyt hele pladskortet"
          className="absolute flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 cursor-move items-center justify-center rounded-full border-2 border-white bg-[#34c759] text-[15px] text-white shadow-md"
          style={{ left: `${mx}%`, top: `${my}%` }}
          onPointerDown={(e) => {
            const g0 = g;
            let from: G | null = null;
            dragIn(box.current, e, (x, y) => {
              const at = groundAt(view, [x, y]);
              from ??= at;
              save(g0.map((p) => ({ x: p.x + at.x - from!.x, y: p.y + at.y - from!.y })));
            });
          }}
        >
          ✥
        </button>
        {flat.map(([x, y], i) => (
          <button
            key={i}
            type="button"
            title={CORNER_NAMES[i]}
            aria-label={CORNER_NAMES[i]}
            className="absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 cursor-move rounded-full border-2 border-white bg-[#0071e3] shadow-md"
            style={{ left: `${x}%`, top: `${y}%` }}
            onPointerDown={(e) =>
              dragIn(box.current, e, (nx, ny) => {
                const next = g.map((p) => ({ ...p }));
                next[i] = groundAt(view, [nx, ny]);
                save(next);
              })
            }
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-24 text-[12px] text-[#6e6e73]">Billedet</span>
        <button type="button" className={btn} onClick={() => setView((v) => ({ ...v, k: Math.max(0.2, v.k / 1.25) }))} aria-label="Zoom ind">
          +
        </button>
        <button type="button" className={btn} onClick={() => setView((v) => ({ ...v, k: Math.min(40, v.k * 1.25) }))} aria-label="Zoom ud">
          −
        </button>
        <button type="button" className={btn} onClick={() => setView((v) => ({ ...fitView(valid), heading: v.heading }))}>
          Vis hele kortet
        </button>
      </div>
      <Field title={`Drej billedet: ${Math.round(view.heading)}°`} hint="Kun visningen her - så pladsen vender som på pladskortet. Touren drejes ikke.">
        <input type="range" min={-180} max={180} step={1} value={view.heading} onChange={(e) => setView((v) => ({ ...v, heading: Number(e.target.value) }))} className="w-full" />
      </Field>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-24 text-[12px] text-[#6e6e73]">Pladskortet</span>
        <button type="button" className={btn} onClick={() => transform(-5, 1)} title="Drej 5° mod uret">
          ⟲ 5°
        </button>
        <button type="button" className={btn} onClick={() => transform(-1, 1)} title="Drej 1° mod uret">
          ⟲
        </button>
        <button type="button" className={btn} onClick={() => transform(1, 1)} title="Drej 1° med uret">
          ⟳
        </button>
        <button type="button" className={btn} onClick={() => transform(5, 1)} title="Drej 5° med uret">
          ⟳ 5°
        </button>
        <button type="button" className={btn} onClick={() => transform(0, 1 / 1.03)} title="Mindre">
          Mindre
        </button>
        <button type="button" className={btn} onClick={() => transform(0, 1.03)} title="Større">
          Større
        </button>
      </div>
      <AiPlace
        slug={slug}
        plan={image}
        hint="Zoom og flyt billedet, så hele pladsen ses, før du trykker."
        photo={async () => {
          if (!src) throw new Error("360°-fotoet er ikke hentet endnu.");
          const c = document.createElement("canvas");
          c.width = 1400;
          c.height = 1400;
          c.getContext("2d")!.putImageData(renderGround(src, 1400, view), 0, 0);
          return c.toDataURL("image/jpeg", 0.85);
        }}
        onCorners={(c) => save(c.map((p) => groundAt(view, p)))}
      />
      <p className="px-1 text-[12px] leading-snug text-[#8e8e93]">
        Sådan ser dronen jorden lige nedad. Træk i billedet for at flytte, rul eller + / − for at zoome. Læg pladskortet på: flyt det med den grønne prik, drej og skalér med knapperne, og ret de fire hjørner til sidst. I touren ligger det så på jorden i 360°-billedet.
      </p>
      {error && <p className="px-1 text-[12px] text-[#ff3b30]">{error}</p>}
    </div>
  );
}

/** "✦ nextviewAI lægger kortet på": finds the same spots on the plan and the photo, and lays the plan by them. */
function AiPlace({ slug, plan, photo, onCorners, hint }: { slug: string; plan: string; photo: () => Promise<string>; onCorners: (c: Corners) => void; hint?: string }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  async function run() {
    setBusy(true);
    setNote(null);
    try {
      const r = await matchSitePlan(slug, await photo(), plan);
      if (!r.ok) throw new Error(r.error);
      const f = fitPlan(r.pairs);
      if (!f) throw new Error("Stederne nextviewAI fandt, passede ikke sammen - zoom, så pladsen ses tydeligere, og prøv igen.");
      const at = ([x, y]: [number, number]): [number, number] => {
        const d = f.h[6] * x + f.h[7] * y + 1;
        return [Math.round(((f.h[0] * x + f.h[1] * y + f.h[2]) / d) * 100) / 100, Math.round(((f.h[3] * x + f.h[4] * y + f.h[5]) / d) * 100) / 100];
      };
      onCorners([at([0, 0]), at([100, 0]), at([100, 100]), at([0, 100])] as Corners);
      setNote({ text: `Lagt på efter ${f.used} steder (afviger ca. ${f.err.toFixed(1)} % af billedet). ${r.note} Tjek det, og ret til med knapperne - Fortryd øverst, hvis det ikke blev godt.` });
    } catch (err) {
      setNote({ text: err instanceof Error ? err.message : String(err), error: true });
    }
    setBusy(false);
  }
  return (
    <div className="space-y-1">
      <button type="button" disabled={busy} onClick={run} className="w-full rounded-xl bg-[#af52de] py-2 text-[14px] font-medium text-white disabled:opacity-50">
        {busy ? "nextviewAI kigger på billederne …" : "✦ nextviewAI lægger kortet på"}
      </button>
      {hint && !note && <p className="px-1 text-[12px] text-[#8e8e93]">{hint}</p>}
      {note && <p className={`px-1 text-[12px] leading-snug ${note.error ? "text-[#ff3b30]" : "text-[#1d1d1f]"}`}>{note.text}</p>}
    </div>
  );
}

/** Next-Stay: the booking's id, where Book goes, and the pitches fetched onto the plan. */
function NextStay({ config, edit, slug }: { config: TourConfig; edit: Edit; slug: string }) {
  const plan = config.sitePlan!;
  const ns = plan.nextStay;
  const [raw, setRaw] = useState(ns?.tenantId ?? "");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);

  async function fetchUnits() {
    const tenantId = UUID.exec(raw)?.[0];
    if (!tenantId) return setNote({ text: "Indsæt bookingens adresse (online.next-stay-booking.dk/search/…) eller dens id.", error: true });
    setBusy(true);
    setNote(null);
    try {
      const r = await fetchNextStayUnits(slug, tenantId);
      if (!r.ok) throw new Error(r.error);
      // Next-Stay places the units in pixels on its own site plan - as % of this plan (the same picture, or close to it; the dots can be dragged after).
      const { w, h } = await naturalSize(plan.image).catch(() => {
        throw new Error("Pladskort-billedet kan ikke hentes - upload det med Skift pladskortet først, så kan pladserne lægges på det.");
      });
      // A first guess (Next-Stay's map pixels on ours) - the numbers on the plan put them right just after. What was set by hand
      // on a unit (its place in the tour) stays.
      const before = new Map((plan.units ?? []).map((u) => [u.id, u]));
      const units: SiteUnit[] = r.units.map((u) => ({
        ...before.get(u.id),
        id: u.id,
        name: u.name,
        x: Math.min(100, Math.max(0, Math.round((u.x / w) * 1000) / 10)),
        y: Math.min(100, Math.max(0, Math.round((u.y / h) * 1000) / 10)),
        kind: /plads/i.test(u.category) ? "plads" : "hytte",
        cat: u.category || undefined,
        bx: u.x,
        by: u.y,
      }));
      edit((d) => {
        d.sitePlan!.nextStay = { ...d.sitePlan!.nextStay, tenantId };
        d.sitePlan!.units = units;
      });
      setNote({ text: `${units.length} pladser og hytter hentet - nextviewAI læser numrene på pladskortet og lægger dem på plads …` });
      await readNumbers(units);
    } catch (err) {
      setNote({ text: err instanceof Error ? err.message : String(err), error: true });
    }
    setBusy(false);
  }

  /** nextviewAI reads the numbers on the plan, and each unit is put on its own (the rest where the found ones say). */
  async function readNumbers(list = plan.units ?? []) {
    if (!list.length) return;
    setBusy(true);
    try {
      const r = await readPlanNumbers(slug, plan.image);
      if (!r.ok) throw new Error(r.error);
      const placed = placeByNumbers(list, r.labels);
      edit((d) => void (d.sitePlan!.units = placed.units));
      setNote({
        text: `${placed.byNumber} sat på deres nummer, ${placed.byFit} placeret ud fra de andre${placed.left ? `, ${placed.left} kunne ikke placeres - træk dem på plads` : ""}. Tjek kortet herunder.`,
      });
    } catch (err) {
      setNote({ text: `${err instanceof Error ? err.message : String(err)} Prikkerne står, hvor Next-Stay har dem - træk dem på plads.`, error: true });
    }
    setBusy(false);
  }

  return (
    <>
      <Field title="Ledige pladser live fra Next-Stay" hint="Bookingens adresse, fx https://online.next-stay-booking.dk/search/01e5…">
        <div className="flex gap-1.5">
          <input className={input} placeholder="online.next-stay-booking.dk/search/…" value={raw} onChange={(e) => setRaw(e.target.value.trim())} />
          <button type="button" disabled={busy} onClick={fetchUnits} className="whitespace-nowrap rounded-xl bg-white px-3 py-2 text-[14px] font-medium text-[#0071e3] ring-1 ring-black/[.06] hover:bg-[#0071e3]/5 disabled:opacity-50">
            {busy ? "Henter…" : plan.units?.length ? "Hent igen" : "Hent pladser"}
          </button>
        </div>
      </Field>
      {note && <p className={`px-1 text-[12px] ${note.error ? "text-[#ff3b30]" : "text-[#34c759]"}`}>{note.text}</p>}
      {ns && (
        <Field title="Book-knappen går til (valgfri)" hint="Tom = bookingens forside. Gæsten vælger datoer og plads dér.">
          <input
            className={input}
            placeholder={`https://online.next-stay-booking.dk/search/${ns.tenantId}`}
            value={ns.book ?? ""}
            onChange={(e) => edit((d) => void (d.sitePlan!.nextStay!.book = e.target.value.trim() || undefined))}
          />
        </Field>
      )}
      {plan.units && plan.units.length > 0 && (
        <button type="button" disabled={busy} onClick={() => readNumbers()} className="w-full rounded-xl bg-white px-3 py-2 text-[14px] font-medium text-[#0071e3] ring-1 ring-black/[.06] hover:bg-[#0071e3]/5 disabled:opacity-50">
          {busy ? "nextviewAI læser numrene …" : "✦ nextviewAI læser numrene og lægger prikkerne på plads"}
        </button>
      )}
      {plan.units && plan.units.length > 0 && <UnitPlacer image={plan.image} units={plan.units} onChange={(units) => edit((d) => void (d.sitePlan!.units = units))} />}
    </>
  );
}

/** The plan with every pitch and cabin as a dot - dragged where one doesn't sit right. */
function UnitPlacer({ image, units, onChange }: { image: string; units: SiteUnit[]; onChange: (u: SiteUnit[]) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<string | null>(null);
  return (
    <div className="space-y-1">
      <p className={small}>
        {units.filter((u) => u.kind !== "hytte").length} pladser og {units.filter((u) => u.kind === "hytte").length} hytter/værelser. Træk en prik, der ikke sidder rigtigt.
      </p>
      <div ref={box} className="relative w-full touch-none select-none overflow-hidden rounded-xl ring-1 ring-black/[.06]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt="" draggable={false} className="block w-full" />
        {units.map((u, i) => (
          <button
            key={u.id}
            type="button"
            title={u.name}
            aria-label={u.name}
            className={`absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-move rounded-full border border-white shadow ${u.kind === "hytte" ? "bg-[#ff9500]" : "bg-[#34c759]"}`}
            style={{ left: `${u.x}%`, top: `${u.y}%` }}
            onPointerEnter={() => setHover(u.name)}
            onPointerLeave={() => setHover(null)}
            onPointerDown={(e) => dragIn(box.current, e, (x, y) => onChange(units.map((v, k) => (k === i ? { ...v, x, y } : v))))}
          />
        ))}
        {hover && <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-white/95 px-2 py-0.5 text-[12px] font-semibold shadow">{hover}</span>}
      </div>
    </div>
  );
}
