"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { tourLooksFor } from "@/lib/actions/tour-insights";
import type { LookSpot } from "@/lib/tour-looks";
import type { ScanMap } from "@/lib/matterport-graph";
import { placeHref } from "../../tours/places";
import type { TourConfig } from "../../tours/types";
import { Choice, Group, type PreviewApi } from "./ui";

/*
 * Resultater → "Heatmap": where the visitors spend their time in the tour,
 * on Matterport's own floor plan - a warm glow on each scan point, stronger
 * the longer people stood there (or the more visits it had). Built from the
 * tour's own "room_look" measurement (seconds per scan point, the last 60
 * days); one picture per floor. A tap on a spot names it and can take the
 * preview there.
 */

type Metric = "seconds" | "visits";

const time = (s: number) => (s < 60 ? `${s} sek` : s < 3600 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1).replace(".", ",")} t`);

/** One warm hue from nothing to much (light amber → deep red) - read as "more" without a legend lesson. */
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

export function HeatmapPanel({ slug, config, map, preview }: { slug: string; config: TourConfig; map: ScanMap | null; preview?: PreviewApi }) {
  const [spots, setSpots] = useState<LookSpot[] | null>(null);
  const [metric, setMetric] = useState<Metric>("seconds");
  const [floor, setFloor] = useState<number | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [planBroken, setPlanBroken] = useState<Record<number, boolean>>({});
  useEffect(() => {
    let live = true;
    tourLooksFor(slug)
      .then((r) => live && setSpots(r))
      .catch(() => live && setSpots([]));
    return () => {
      live = false;
    };
  }, [slug]);

  // Each measured spot on its floor's plan (a scan point the plan doesn't place is left out).
  const placed = useMemo(() => {
    if (!spots || !map) return [];
    const at = new Map(map.points.map((p) => [p.ss, p]));
    return spots
      .map((s) => ({ s, p: at.get(s.ss) }))
      .filter((x): x is { s: LookSpot; p: NonNullable<typeof x.p> } => x.p?.px != null && x.p.py != null);
  }, [spots, map]);
  const floors = useMemo(() => [...new Set(placed.map((x) => x.p.floor))].sort((a, b) => a - b), [placed]);
  const shownFloor = floor != null && floors.includes(floor) ? floor : (floors[0] ?? 0);
  const here = placed.filter((x) => x.p.floor === shownFloor);
  const value = (s: LookSpot) => (metric === "seconds" ? s.seconds : s.visits);
  const max = Math.max(1, ...here.map((x) => value(x.s)));
  const plan = map?.floors[shownFloor];
  const aspect = plan?.aspect ?? 1.6;

  // The glow, drawn on a canvas: each spot adds its warmth (so close spots add up), then coloured.
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvas.current;
    if (!c || !here.length) return;
    const W = 800;
    const H = Math.round(W / aspect);
    c.width = W;
    c.height = H;
    const g = c.getContext("2d", { willReadFrequently: true });
    if (!g) return;
    g.clearRect(0, 0, W, H);
    g.globalCompositeOperation = "lighter";
    const r = Math.max(28, Math.min(W, H) * 0.07);
    for (const { s, p } of here) {
      const x = (p.px! / 100) * W;
      const y = (p.py! / 100) * H;
      const a = Math.sqrt(value(s) / max); // the square root: quiet spots still show, the busiest don't drown the rest
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
      const t = img.data[i + 3] / 255;
      if (!t) continue;
      const [cr, cg, cb, ca] = heat(t);
      img.data[i] = cr;
      img.data[i + 1] = cg;
      img.data[i + 2] = cb;
      img.data[i + 3] = ca;
    }
    g.globalCompositeOperation = "source-over";
    g.putImageData(img, 0, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- drawn again when what's shown changes
  }, [here.map((x) => `${x.s.ss}:${value(x.s)}`).join("|"), aspect, max]);

  const top = [...here].sort((a, b) => value(b.s) - value(a.s)).slice(0, 5);
  const chosen = here.find((x) => x.s.ss === picked);

  return (
    <Group title="Heatmap - hvor folk opholder sig">
      <p className="text-[13px] leading-snug text-[#6e6e73]">Plantegningen med de steder, hvor de besøgende står længst (eller kommer oftest). Jo varmere, jo mere. De seneste 60 dage - tryk på et sted for at se det.</p>
      {spots == null ? (
        <p className="text-[13px] text-[#8e8e93]">Henter…</p>
      ) : !map ? (
        <p className="text-[13px] text-[#8e8e93]">Touren har ingen plantegning fra Matterport endnu.</p>
      ) : !placed.length ? (
        <p className="text-[13px] text-[#8e8e93]">Ingen målinger endnu. Det kommer, når besøgende har gået rundt i touren.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Choice<Metric>
              value={metric}
              options={[
                ["seconds", "Tid"],
                ["visits", "Besøg"],
              ]}
              onChange={setMetric}
            />
            {floors.length > 1 && (
              <div className="flex flex-wrap gap-1.5">
                {floors.map((f) => (
                  <button key={f} type="button" onClick={() => (setFloor(f), setPicked(null))} className={`rounded-full px-3 py-1 text-[12px] font-medium ring-1 ring-inset ${f === shownFloor ? "bg-[#1d1d1f] text-white ring-[#1d1d1f]" : "bg-white text-[#3a3a3c] ring-black/[.1]"}`}>
                    {map.floors[f]?.name ?? `Etage ${f + 1}`}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="relative w-full overflow-hidden rounded-xl bg-[#eef0f2] ring-1 ring-black/[.06]" style={{ aspectRatio: String(aspect) }}>
            {plan?.image && !planBroken[shownFloor] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={plan.image} alt="" className="absolute inset-0 h-full w-full object-contain opacity-80" onError={() => setPlanBroken((b) => ({ ...b, [shownFloor]: true }))} />
            )}
            <canvas ref={canvas} className="pointer-events-none absolute inset-0 h-full w-full mix-blend-multiply" aria-hidden />
            {/* The spots to tap (invisible, a bit bigger than the glow's heart). */}
            {here.map(({ s, p }) => (
              <button
                key={s.ss}
                type="button"
                aria-label={`${s.room ?? `Scanpunkt ${s.ss}`}: ${time(s.seconds)}, ${s.visits} besøg`}
                title={`${s.room ?? `Scanpunkt ${s.ss}`}: ${time(s.seconds)}, ${s.visits} besøg`}
                onClick={() => setPicked(s.ss === picked ? null : s.ss)}
                className={`absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full ${s.ss === picked ? "ring-2 ring-white ring-offset-1 ring-offset-black/40" : ""}`}
                style={{ left: `${p.px}%`, top: `${p.py}%` }}
              />
            ))}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-[#8e8e93]">
            <span>Lidt</span>
            <span className="h-2 flex-1 rounded-full" style={{ background: "linear-gradient(90deg, rgba(255,214,102,.5), #ff8c28, #e23624, #96001e)" }} />
            <span>Meget</span>
          </div>
          {chosen && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-black/[.06]">
              <p className="text-[13px]">
                <b>{chosen.s.room ?? `Scanpunkt ${chosen.s.ss}`}</b> <span className="text-[#6e6e73]">{time(chosen.s.seconds)}, {chosen.s.visits} besøg</span>
              </p>
              {preview && (
                <button type="button" onClick={() => preview.go(chosen.s.room ?? `Scanpunkt ${chosen.s.ss}`, placeHref(config, chosen.s.ss))} className="rounded-full bg-[#0071e3]/10 px-3 py-1 text-[12px] font-medium text-[#0071e3]">
                  Vis stedet
                </button>
              )}
            </div>
          )}
          <ol className="space-y-1">
            {top.map(({ s }, i) => (
              <li key={s.ss} className="flex items-baseline justify-between gap-2 text-[13px]">
                <button type="button" onClick={() => setPicked(s.ss)} className="min-w-0 truncate text-left">
                  <span className="mr-1.5 tabular-nums text-[#8e8e93]">{i + 1}.</span>
                  {s.room ?? `Scanpunkt ${s.ss}`}
                </button>
                <span className="flex-none tabular-nums text-[#6e6e73]">{metric === "seconds" ? time(s.seconds) : `${s.visits} besøg`}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </Group>
  );
}
