"use client";

import { useEffect, useRef, useState } from "react";
import { fetchNextStayUnits } from "@/lib/actions/tour-sites";
import type { SiteUnit, TourConfig } from "../../tours/types";
import { quadSolve } from "../staging";
import { Field, Group, input, Toggle, UploadButton } from "./ui";

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

export function SitePlanEditor({ config, edit, slug }: { config: TourConfig; edit: Edit; slug: string }) {
  const M = config.map!;
  const plan = config.sitePlan;
  const overlay = plan?.overlay;

  if (!plan)
    return (
      <Group title="Pladskort over luftfotoet">
        <p className="text-[14px] leading-snug">Læg pladskortet gennemsigtigt oven på luftfotoet - gæsten slår det til og fra, vælger datoer og ser de ledige pladser lyse grønt.</p>
        <UploadButton
          accept="image/*"
          label="Upload pladskortet"
          onDone={(url) => edit((d) => void (d.sitePlan = { image: url, label: "Se på pladskortet", overlay: { corners: START, opacity: 0.55 } }))}
          className="block w-full cursor-pointer rounded-xl bg-[#0071e3] py-2.5 text-center text-[15px] font-medium text-white"
        />
      </Group>
    );

  return (
    <Group title="Pladskort over luftfotoet">
      <Toggle
        on={Boolean(overlay)}
        onChange={(on) => edit((d) => void (d.sitePlan!.overlay = on ? (d.sitePlan!.overlay ?? { corners: START, opacity: 0.55 }) : undefined))}
        title="Vis pladskortet over luftfotoet"
        hint="Gæsten får en kontakt, Pladskort, på luftfotoet. Virker bedst med et dronefoto taget lige oppefra."
      />
      {overlay && (
        <>
          <p className={small}>Træk de fire hjørner, så pladskortet ligger præcis oven på luftfotoet - ret ind efter fx servicebygningen og vejene.</p>
          <CornerPlacer M={M} image={plan.image} corners={overlay.corners} opacity={overlay.opacity ?? 0.55} onChange={(corners) => edit((d) => void (d.sitePlan!.overlay!.corners = corners))} />
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
function CornerPlacer({ M, image, corners, opacity, onChange }: { M: NonNullable<TourConfig["map"]>; image: string; corners: Corners; opacity: number; onChange: (c: Corners) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const w = useWidth(box);
  const h = (w * M.h) / M.w;
  const c = w ? quadSolve(1000, 1000, corners.map(([x, y]) => ({ x: (x / 100) * w, y: (y / 100) * h }))) : null;
  const matrix = c ? `matrix3d(${c[0]},${c[3]},0,${c[6]},${c[1]},${c[4]},0,${c[7]},0,0,1,0,${c[2]},${c[5]},0,1)` : undefined;
  return (
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
      const { w, h } = await naturalSize(plan.image);
      const units: SiteUnit[] = r.units.map((u) => ({ id: u.id, name: u.name, x: Math.round((u.x / w) * 1000) / 10, y: Math.round((u.y / h) * 1000) / 10, kind: /plads/i.test(u.category) ? "plads" : "hytte" }));
      edit((d) => {
        d.sitePlan!.nextStay = { ...d.sitePlan!.nextStay, tenantId };
        d.sitePlan!.units = units;
      });
      const outside = units.filter((u) => u.x < 0 || u.x > 100 || u.y < 0 || u.y > 100).length;
      setNote({ text: `${units.length} pladser og hytter hentet.${outside ? ` ${outside} ligger uden for pladskortet - pladskortet er nok ikke samme billede som Next-Stays; træk dem på plads.` : " Tjek, at prikkerne sidder rigtigt."}` });
    } catch (err) {
      setNote({ text: err instanceof Error ? err.message : String(err), error: true });
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
