"use client";

import { useMemo, useState } from "react";
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
  const [selected, setSelected] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);

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
                  {f}
                </button>
              ))}
            </div>
          )}
          <span className="text-[12px] text-[#8e8e93]">{points.length} punkter</span>
          <div className="ml-auto flex gap-1">
            {(["−", "+"] as const).map((t) => (
              <button key={t} type="button" onClick={() => setZoom((z) => Math.min(4, Math.max(1, z * (t === "+" ? 1.5 : 1 / 1.5))))} className="h-7 w-7 rounded-full bg-[#f2f2f7] text-[15px] font-semibold hover:bg-[#e9e9eb]">
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="-mx-1 max-h-[440px] overflow-auto rounded-xl bg-[#f5f5f7] ring-1 ring-black/[.04]">
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
        </div>
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
