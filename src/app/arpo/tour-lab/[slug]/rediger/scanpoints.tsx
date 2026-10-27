"use client";

import { useMemo, useRef, useState } from "react";
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
  const [failedPlan, setFailedPlan] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  /* Marking many at once: hold the mouse down and drag over the dots - or drag a box on an empty spot. */
  const [marked, setMarked] = useState<Set<number>>(new Set());
  const [box, setBox] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const painting = useRef<{ start: number; moved: boolean } | null>(null);
  const planEl = useRef<HTMLDivElement>(null);
  const pct = (e: React.PointerEvent) => {
    const r = planEl.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 };
  };

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
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const pad = 1.5;
  const [minX, maxX, minY, maxY] = [Math.min(...xs) - pad, Math.max(...xs) + pad, Math.min(...ys) - pad, Math.max(...ys) + pad];
  const w = maxX - minX;
  const h = maxY - minY;
  const hidden = new Set([...config.hiddenSweeps, ...mpskinsHidden]);
  const plan = map.floors[floor];
  // Only the part of the plan where the scan points are (a plan can cover a whole site, the scans a corner of it) - with a margin.
  const placed = points.filter((p) => p.px != null && p.py != null);
  const crop = placed.length
    ? {
        l: Math.max(0, Math.min(...placed.map((p) => p.px!)) - 5),
        r: Math.min(100, Math.max(...placed.map((p) => p.px!)) + 5),
        t: Math.max(0, Math.min(...placed.map((p) => p.py!)) - 5),
        b: Math.min(100, Math.max(...placed.map((p) => p.py!)) + 5),
      }
    : { l: 0, r: 100, t: 0, b: 100 };
  const cw = Math.max(5, crop.r - crop.l);
  const ch = Math.max(5, crop.b - crop.t);
  /** Dots grow a little with zoom, but less than the plan, so crowded spots open up. */
  const dot = Math.round(20 * Math.sqrt(zoom));
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

  return (
    <>
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
            {(["−", "+"] as const).map((t) => (
              <button key={t} type="button" onClick={() => setZoom((z) => Math.min(6, Math.max(1, z * (t === "+" ? 1.5 : 1 / 1.5))))} className="h-7 w-7 rounded-full bg-[#f2f2f7] text-[15px] font-semibold hover:bg-[#e9e9eb]">
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="-mx-1 max-h-[560px] overflow-auto rounded-xl bg-[#f5f5f7] ring-1 ring-black/[.04]">
          {plan?.image && plan.aspect ? (
            // Matterport's own top-down photo of the floor, with every scan point where it really is - cut to where the points are.
            <div className="relative overflow-hidden" style={{ width: `${zoom * 100}%`, aspectRatio: String((cw / ch) * plan.aspect) }}>
            <div
              ref={planEl}
              className="absolute touch-none select-none"
              style={{ width: `${10000 / cw}%`, height: `${10000 / ch}%`, left: `${(-crop.l * 100) / cw}%`, top: `${(-crop.t * 100) / ch}%` }}
              onPointerDown={(e) => {
                if (e.target !== e.currentTarget && !(e.target instanceof HTMLImageElement)) return;
                const at = pct(e);
                setBox({ x0: at.x, y0: at.y, x1: at.x, y1: at.y });
                if (!e.shiftKey) setMarked(new Set());
              }}
              onPointerMove={(e) => {
                if (box && e.buttons === 1) {
                  const at = pct(e);
                  setBox({ ...box, x1: at.x, y1: at.y });
                }
              }}
              onPointerUp={() => {
                if (box) {
                  const [l, r, t, b] = [Math.min(box.x0, box.x1), Math.max(box.x0, box.x1), Math.min(box.y0, box.y1), Math.max(box.y0, box.y1)];
                  if (r - l > 0.5 || b - t > 0.5)
                    setMarked((m) => new Set([...m, ...points.filter((p) => p.px != null && p.py != null && p.px >= l && p.px <= r && p.py >= t && p.py <= b).map((p) => p.ss)]));
                  setBox(null);
                }
                const paint = painting.current;
                painting.current = null;
                // A click (no drag) on a dot: go there.
                if (paint && !paint.moved) {
                  setMarked(new Set());
                  go(paint.start);
                }
              }}
              onPointerLeave={() => setBox(null)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={plan.image}
                alt=""
                onError={() => setFailedPlan(plan.image)}
                className={`absolute inset-0 h-full w-full select-none object-contain ${failedPlan === plan.image ? "invisible" : ""}`}
                draggable={false}
              />
              {failedPlan === plan.image && (
                <p className="absolute inset-x-0 bottom-2 text-center text-[12px] text-[#8e8e93]">Plantegningen kunne ikke hentes fra Matterport - genindlæs siden.</p>
              )}
              {points.map((p) =>
                p.px == null || p.py == null ? null : (
                  <button
                    key={p.sid}
                    type="button"
                    title={`Punkt ${p.ss}`}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      painting.current = { start: p.ss, moved: false };
                      setMarked((m) => (e.shiftKey ? new Set([...m, p.ss]) : new Set([p.ss])));
                    }}
                    onPointerEnter={(e) => {
                      if (!painting.current || e.buttons !== 1) return;
                      painting.current.moved = true;
                      setMarked((m) => new Set([...m, p.ss]));
                    }}
                    className={`absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full font-bold tabular-nums shadow-[0_1px_4px_rgba(0,0,0,.35)] transition hover:z-10 hover:scale-125 ${marked.has(p.ss) && marked.size > 1 ? "z-10 ring-[3px] ring-[#0071e3] ring-offset-1" : ""} ${selected === p.ss ? "z-10 scale-125 ring-2 ring-[#1d1d1f]" : ""} ${uses.get(p.ss)?.has("start") ? "outline outline-2 outline-offset-2 outline-[#0071e3]" : ""}`}
                    style={{
                      left: `${p.px}%`,
                      top: `${p.py}%`,
                      width: dot,
                      height: dot,
                      fontSize: dot * 0.45,
                      background: hidden.has(p.sid) ? "rgba(255,255,255,.85)" : colorOf(p.ss),
                      color: hidden.has(p.sid) ? "#8e8e93" : "#fff",
                      border: hidden.has(p.sid) ? "1.5px dashed #8e8e93" : "1.5px solid #fff",
                    }}
                  >
                    {p.ss}
                  </button>
                )
              )}
              {box && <div className="pointer-events-none absolute border-2 border-[#0071e3] bg-[#0071e3]/10" style={{ left: `${Math.min(box.x0, box.x1)}%`, top: `${Math.min(box.y0, box.y1)}%`, width: `${Math.abs(box.x1 - box.x0)}%`, height: `${Math.abs(box.y1 - box.y0)}%` }} />}
            </div>
            </div>
          ) : (
          <svg viewBox={`${minX} ${-maxY} ${w} ${h}`} style={{ width: `${zoom * 100}%`, display: "block" }} className="aspect-auto">
            {points.map((p) => {
              const isHidden = hidden.has(p.sid);
              const isStart = uses.get(p.ss)?.has("start");
              const r = Math.max(w, h) / 48;
              return (
                <g key={p.sid} onClick={() => go(p.ss)} className="cursor-pointer">
                  {isStart && <circle cx={p.x} cy={-p.y} r={r * 1.7} fill="none" stroke="#0071e3" strokeWidth={r * 0.35} />}
                  <circle cx={p.x} cy={-p.y} r={r} fill={isHidden ? "#fff" : colorOf(p.ss)} stroke={selected === p.ss ? "#1d1d1f" : isHidden ? "#c7c7cc" : "#fff"} strokeWidth={r * 0.25} strokeDasharray={isHidden ? `${r * 0.4} ${r * 0.3}` : undefined} />
                  <text x={p.x} y={-p.y + r * 0.35} textAnchor="middle" fontSize={r * 0.95} fontWeight={700} fill={isHidden ? "#8e8e93" : "#fff"} className="pointer-events-none select-none">
                    {p.ss}
                  </text>
                </g>
              );
            })}
          </svg>
          )}
        </div>
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
          <p className="text-[11px] text-[#8e8e93]">Klik på et punkt for at gå derhen. Hold musen nede og træk hen over punkter - eller træk en firkant - for at markere mange og skjule/vise dem på én gang (Shift lægger til).</p>
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
              disabled={selUses?.has("start")}
              className="rounded-xl bg-white py-2 text-[14px] font-medium text-[#0071e3] ring-1 ring-black/[.06] hover:bg-[#0071e3]/5 disabled:opacity-40"
              onClick={async () => {
                const r = await preview.view();
                edit((d) => void (d.start = r.href && ssOfHref(r.href) === sel.ss ? r.href : placeHref(d, sel.ss)));
              }}
            >
              Start her
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
          <p className="text-[11px] leading-snug text-[#8e8e93]">&quot;Start her&quot; og &quot;Til menuen&quot; bruger den retning, forhåndsvisningen kigger - drej først, så det ser rigtigt ud. Stedkortets tekst skrives under Stedkort.</p>
        </Group>
      ) : (
        <p className="px-1 text-[12px] text-[#8e8e93]">Klik på et punkt for at gå derhen i forhåndsvisningen.</p>
      )}
    </>
  );
}
