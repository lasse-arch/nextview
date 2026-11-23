"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "pannellum/build/pannellum.css";
import type { HeatData, HeatSpot } from "@/lib/tour-heat";

/*
 * The heatmap itself - in Resultater (with "Vis stedet") and on the customer's
 * statistics and report link (just to look at): where the visitors spend their
 * time inside (Matterport's floor plan, a warm glow per scan point) and what
 * they open on the aerial photo / map (the photo at its start view, a glow on
 * each point the more it was opened). Danish or English.
 */

type Lang = "da" | "en";
type Metric = "seconds" | "visits";

const T = {
  da: { inside: "Inde i touren", aerial: "Luftfoto og punkter", time: "Tid", visits: "Besøg", little: "Lidt", much: "Meget", opened: (n: number) => `åbnet ${n} gang${n === 1 ? "" : "e"}`, show: "Vis stedet", floor: (i: number) => `Etage ${i + 1}`, visitsN: (n: number) => `${n} besøg` },
  en: { inside: "Inside the tour", aerial: "Aerial photo and points", time: "Time", visits: "Visits", little: "Little", much: "A lot", opened: (n: number) => `opened ${n} time${n === 1 ? "" : "s"}`, show: "Show the place", floor: (i: number) => `Floor ${i + 1}`, visitsN: (n: number) => `${n} visits` },
};

/** The number in a circle: minutes (or seconds under one), or visits. */
const short = (v: number, metric: Metric) => (metric === "visits" ? String(v) : v < 60 ? `${v}s` : v < 6000 ? `${Math.round(v / 60)}m` : `${Math.round(v / 3600)}t`);
const time = (s: number, lang: Lang) => (s < 60 ? `${s} ${lang === "en" ? "sec" : "sek"}` : s < 3600 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1).replace(".", lang === "en" ? "." : ",")} ${lang === "en" ? "h" : "t"}`);

/** One warm hue from little (light amber) to a lot (deep red). */
function heat(t: number): [number, number, number, number] {
  const stops: [number, number, number][] = [
    [255, 214, 102],
    [255, 140, 40],
    [226, 54, 36],
    [150, 0, 30],
  ];
  const x = Math.min(1, Math.max(0, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  const c = stops[i].map((v, k) => Math.round(v + (stops[i + 1][k] - v) * f)) as [number, number, number];
  return [...c, Math.round(Math.min(1, t * 1.6) * 200)];
}
const LEGEND = "linear-gradient(90deg, rgba(255,214,102,.5), #ff8c28, #e23624, #96001e)";

function Legend({ lang }: { lang: Lang }) {
  return (
    <div className="flex items-center gap-2 text-[11px] text-[#8e8e93]">
      <span>{T[lang].little}</span>
      <span className="h-2 flex-1 rounded-full" style={{ background: LEGEND }} />
      <span>{T[lang].much}</span>
    </div>
  );
}

const chip = (on: boolean) => `rounded-full px-3 py-1 text-[12px] font-medium ring-1 ring-inset ${on ? "bg-[#1d1d1f] text-white ring-[#1d1d1f]" : "bg-white text-[#3a3a3c] ring-black/[.1]"}`;

export function HeatmapView({ data, lang = "da", onGo }: { data: HeatData; lang?: Lang; /** Resultater: fly the preview to a scan point. */ onGo?: (ss: number, name: string) => void }) {
  const [part, setPart] = useState<"inside" | "aerial">(data.plan ? "inside" : "aerial");
  return (
    <div className="space-y-3">
      {data.plan && data.aerial && (
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={chip(part === "inside")} onClick={() => setPart("inside")}>
            {T[lang].inside}
          </button>
          <button type="button" className={chip(part === "aerial")} onClick={() => setPart("aerial")}>
            {T[lang].aerial}
          </button>
        </div>
      )}
      {part === "inside" && data.plan ? <Inside plan={data.plan} lang={lang} onGo={onGo} /> : data.aerial ? <Aerial aerial={data.aerial} lang={lang} /> : null}
    </div>
  );
}

function Inside({ plan, lang, onGo }: { plan: NonNullable<HeatData["plan"]>; lang: Lang; onGo?: (ss: number, name: string) => void }) {
  const t = T[lang];
  const [metric, setMetric] = useState<Metric>("seconds");
  const [floor, setFloor] = useState<number | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [broken, setBroken] = useState<Record<number, boolean>>({});
  const floors = useMemo(() => [...new Set(plan.spots.map((s) => s.floor))].sort((a, b) => a - b), [plan.spots]);
  const shown = floor != null && floors.includes(floor) ? floor : (floors[0] ?? 0);
  const here = plan.spots.filter((s) => s.floor === shown);
  const value = (s: HeatSpot) => (metric === "seconds" ? s.seconds : s.visits);
  const max = Math.max(1, ...here.map(value));
  const fl = plan.floors[shown];
  const aspect = fl?.aspect ?? 1.6;
  const canvas = useRef<HTMLCanvasElement>(null);
  const key = here.map((s) => `${s.ss}:${value(s)}`).join("|");
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const W = 900;
    const H = Math.round(W / aspect);
    c.width = W;
    c.height = H;
    const g = c.getContext("2d", { willReadFrequently: true });
    if (!g) return;
    g.clearRect(0, 0, W, H);
    g.globalCompositeOperation = "lighter";
    const r = Math.max(30, Math.min(W, H) * 0.07);
    for (const s of here) {
      const x = (s.px / 100) * W;
      const y = (s.py / 100) * H;
      // The square root: quiet spots still show, the busiest don't drown the rest.
      const a = Math.sqrt(value(s) / max);
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, `rgba(0,0,0,${0.85 * a})`);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grad;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    const img = g.getImageData(0, 0, W, H);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = img.data[i + 3] / 255;
      if (!v) continue;
      const [r2, g2, b2, a2] = heat(v);
      img.data[i] = r2;
      img.data[i + 1] = g2;
      img.data[i + 2] = b2;
      img.data[i + 3] = a2;
    }
    g.globalCompositeOperation = "source-over";
    g.putImageData(img, 0, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- drawn again when what's shown changes
  }, [key, aspect, max]);
  const top = [...here].sort((a, b) => value(b) - value(a)).slice(0, 5);
  const chosen = here.find((s) => s.ss === picked);
  const name = (s: HeatSpot) => s.room ?? `${lang === "en" ? "Scan point" : "Scanpunkt"} ${s.ss}`;
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1.5">
          <button type="button" className={chip(metric === "seconds")} onClick={() => setMetric("seconds")}>
            {t.time}
          </button>
          <button type="button" className={chip(metric === "visits")} onClick={() => setMetric("visits")}>
            {t.visits}
          </button>
        </div>
        {floors.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {floors.map((f) => (
              <button key={f} type="button" onClick={() => (setFloor(f), setPicked(null))} className={chip(f === shown)}>
                {plan.floors[f]?.name ?? t.floor(f)}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="relative w-full overflow-hidden rounded-xl bg-[#eef0f2] ring-1 ring-black/[.06]" style={{ aspectRatio: String(aspect) }}>
        {fl?.image && !broken[shown] && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fl.image} alt="" className="absolute inset-0 h-full w-full object-contain opacity-80" onError={() => setBroken((b) => ({ ...b, [shown]: true }))} />
        )}
        <canvas ref={canvas} className="pointer-events-none absolute inset-0 h-full w-full opacity-60 mix-blend-multiply" aria-hidden />
        {/* Every scan point: nobody there = a small dot; the rest a circle, bigger and warmer the more, with its number. */}
        {(plan.points ?? []).filter((p) => p.floor === shown && !here.some((s) => s.ss === p.ss)).map((p) => (
          <span key={`p${p.ss}`} className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/90 ring-1 ring-black/25" style={{ left: `${p.px}%`, top: `${p.py}%` }} />
        ))}
        {[...here].sort((a, b) => value(a) - value(b)).map((s) => {
          const share = Math.sqrt(value(s) / max);
          const d = Math.round(20 + 22 * share);
          const [r, g, b] = heat(0.25 + 0.75 * share);
          const on = s.ss === picked || s.ss === hover;
          return (
            <button
              key={s.ss}
              type="button"
              aria-label={`${name(s)}: ${time(s.seconds, lang)}, ${t.visitsN(s.visits)}`}
              onClick={() => setPicked(s.ss === picked ? null : s.ss)}
              onMouseEnter={() => setHover(s.ss)}
              onMouseLeave={() => setHover(null)}
              className={`absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums text-white shadow-[0_1px_4px_rgba(0,0,0,.35)] transition-transform ${on ? "z-20 scale-125" : "z-10"}`}
              style={{ left: `${s.px}%`, top: `${s.py}%`, width: d, height: d, background: `rgb(${r},${g},${b})`, boxShadow: `0 0 0 2px rgba(255,255,255,.9), 0 0 0 ${on ? 5 : 0}px rgba(${r},${g},${b},.35)` }}
            >
              {short(value(s), metric)}
            </button>
          );
        })}
        {(() => {
          const h = here.find((s) => s.ss === hover);
          if (!h) return null;
          return (
            <div className="pointer-events-none absolute z-30 -translate-x-1/2 whitespace-nowrap rounded-lg bg-[#1d1d1f] px-2.5 py-1.5 text-[11.5px] text-white shadow-lg" style={{ left: `${Math.min(85, Math.max(15, h.px))}%`, top: `calc(${h.py}% + 18px)` }}>
              <b>{name(h)}</b>
              <span className="ml-1.5 text-white/70">
                {time(h.seconds, lang)}, {t.visitsN(h.visits)}
              </span>
            </div>
          );
        })()}
      </div>
      <Legend lang={lang} />
      {chosen && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-black/[.06]">
          <p className="text-[13px]">
            <b>{name(chosen)}</b> <span className="text-[#6e6e73]">{time(chosen.seconds, lang)}, {t.visitsN(chosen.visits)}</span>
          </p>
          {onGo && (
            <button type="button" onClick={() => onGo(chosen.ss, name(chosen))} className="rounded-full bg-[#0071e3]/10 px-3 py-1 text-[12px] font-medium text-[#0071e3]">
              {t.show}
            </button>
          )}
        </div>
      )}
      <ol className="space-y-1">
        {top.map((s, i) => (
          <li key={s.ss} className="flex items-baseline justify-between gap-2 text-[13px]">
            <button type="button" onClick={() => setPicked(s.ss)} className="min-w-0 truncate text-left">
              <span className="mr-1.5 tabular-nums text-[#8e8e93]">{i + 1}.</span>
              {name(s)}
            </button>
            <span className="flex-none tabular-nums text-[#6e6e73]">{metric === "seconds" ? time(s.seconds, lang) : t.visitsN(s.visits)}</span>
          </li>
        ))}
      </ol>
    </>
  );
}

/** A glow on a point: bigger and warmer the more it was opened. */
function glow(share: number): string {
  const [r, g, b] = heat(Math.sqrt(share));
  // A small white dot marks the point itself; the glow around it is the heat.
  return `radial-gradient(circle, #fff 0 3px, rgba(${r},${g},${b},.95) 4px, rgba(${r},${g},${b},.5) 40%, rgba(${r},${g},${b},0) 70%)`;
}

function Aerial({ aerial, lang }: { aerial: NonNullable<HeatData["aerial"]>; lang: Lang }) {
  const t = T[lang];
  const max = Math.max(1, ...aerial.points.map((p) => p.opens));
  const top = aerial.points.slice(0, 5);
  return (
    <>
      {aerial.scene ? (
        <Scene scene={aerial.scene} points={aerial.points} max={max} />
      ) : aerial.map ? (
        <div className="relative w-full overflow-hidden rounded-xl bg-[#eef0f2] ring-1 ring-black/[.06]" style={{ aspectRatio: `${aerial.map.w} / ${aerial.map.h}` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={aerial.map.image} alt="" className="absolute inset-0 h-full w-full object-cover" />
          {aerial.points.map((p) => {
            const share = p.opens / max;
            const size = 22 + 46 * Math.sqrt(share);
            return p.x != null && p.y != null ? (
              <span key={p.name} title={`${p.name}: ${t.opened(p.opens)}`} className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${p.x}%`, top: `${p.y}%`, width: size, height: size, background: glow(share) }} />
            ) : null;
          })}
        </div>
      ) : null}
      <Legend lang={lang} />
      <ol className="space-y-1">
        {top.map((p, i) => (
          <li key={p.name} className="flex items-baseline justify-between gap-2 text-[13px]">
            <span className="min-w-0 truncate">
              <span className="mr-1.5 tabular-nums text-[#8e8e93]">{i + 1}.</span>
              {p.name}
            </span>
            <span className="flex-none tabular-nums text-[#6e6e73]">{t.opened(p.opens)}</span>
          </li>
        ))}
      </ol>
    </>
  );
}


/** The aerial 360° scene at its start view - still (nothing to drag), with a glow on each point that was opened. */
function Scene({ scene, points, max }: { scene: NonNullable<NonNullable<HeatData["aerial"]>["scene"]>; points: NonNullable<HeatData["aerial"]>["points"]; max: number }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let viewer: { destroy: () => void } | null = null;
    let dead = false;
    (async () => {
      if (!window.pannellum) await import("pannellum/build/pannellum.js");
      if (dead || !box.current || !window.pannellum) return;
      viewer = window.pannellum.viewer(box.current, {
        ...(scene.panorama ? { type: "equirectangular", panorama: scene.panorama } : { type: "multires", multiRes: { basePath: scene.tiles!.basePath, path: "/%l/%s%y_%x", extension: "jpg", tileResolution: 512, maxLevel: scene.tiles!.maxLevel, cubeResolution: scene.tiles!.cubeResolution } }),
        autoLoad: true,
        showControls: false,
        compass: false,
        draggable: false,
        mouseZoom: false,
        keyboardZoom: false,
        disableKeyboardCtrl: true,
        yaw: scene.start.yaw,
        pitch: scene.start.pitch,
        hfov: scene.start.hfov,
        hotSpots: points
          .filter((p) => p.yaw != null && p.pitch != null)
          .map((p) => ({
            pitch: p.pitch,
            yaw: p.yaw,
            cssClass: "hm-glow",
            createTooltipFunc: (el: HTMLElement) => {
              const share = p.opens / max;
              const size = 22 + 46 * Math.sqrt(share);
              el.style.width = el.style.height = `${size}px`;
              el.style.marginLeft = el.style.marginTop = `${-size / 2}px`;
              el.style.background = glow(share);
              el.title = p.name;
            },
          })),
      });
    })();
    return () => {
      dead = true;
      viewer?.destroy();
    };
  }, [scene, points, max]);
  return (
    <div className="relative w-full overflow-hidden rounded-xl bg-[#0d1b20] ring-1 ring-black/[.06]" style={{ aspectRatio: "16 / 10" }}>
      <div ref={box} className="absolute inset-0" />
      <style>{`.hm-glow{border-radius:50%;pointer-events:none}`}</style>
    </div>
  );
}
