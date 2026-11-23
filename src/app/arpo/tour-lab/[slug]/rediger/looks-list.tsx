"use client";

import { useEffect, useState } from "react";
import type { HeatData } from "@/lib/tour-heat";
import type { ReportLook } from "./customer-report";

/*
 * "Hvor de kigger længst rundt": each place with a picture - the place's own
 * photo, else a cut of the floor plan around the scan point with a dot on it -
 * and a tap opens it big. Danish or English.
 */

type Plan = NonNullable<HeatData["plan"]>;
const T = {
  da: { sec: "sek", visits: "besøg", close: "Luk", where: "Her står man på plantegningen" },
  en: { sec: "sec", visits: "visits", close: "Close", where: "Where it is on the floor plan" },
};

export function LooksList({ looks, plan, lang = "da" }: { looks: ReportLook[]; plan: Plan | null; lang?: "da" | "en" }) {
  const t = T[lang];
  const [open, setOpen] = useState<ReportLook | null>(null);
  const duration = (s: number) => (s < 60 ? `${s} ${t.sec}` : `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} ${t.sec}` : ""}`);
  const at = (l: ReportLook) => (l.ss != null ? plan?.points?.find((p) => p.ss === l.ss) ?? plan?.spots.find((p) => p.ss === l.ss) : undefined);
  const max = looks[0]?.seconds || 1;

  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open]);

  return (
    <>
      <ul className="space-y-2.5">
        {looks.map((l) => {
          const p = at(l);
          const floor = p ? plan?.floors[p.floor] : undefined;
          return (
            <li key={`${l.room}${l.ss ?? ""}`}>
              <button type="button" onClick={() => setOpen(l)} className="flex w-full items-center gap-3 rounded-xl p-1 text-left transition hover:bg-[#f5f5f7]">
                <Thumb image={l.image} plan={p && floor?.image ? { image: floor.image, aspect: floor.aspect ?? 1.6, px: p.px, py: p.py } : null} className="h-14 w-20" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2 text-[14px]">
                    <span className="truncate font-medium">{l.room}</span>
                    <span className="flex-none tabular-nums text-[#6e6e73]">{duration(l.seconds)}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-[#f2f2f7]">
                    <div className="h-full rounded-full" style={{ width: `${((l.seconds / max) * 100).toFixed(1)}%`, background: "var(--report-accent, #0071e3)" }} />
                  </div>
                  <div className="mt-0.5 text-[11.5px] text-[#8e8e93]">
                    {l.visits} {t.visits}
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      {open &&
        (() => {
          const p = at(open);
          const floor = p ? plan?.floors[p.floor] : undefined;
          return (
            <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4" onClick={() => setOpen(null)} role="dialog" aria-modal="true">
              <div className="max-h-full w-full max-w-3xl overflow-auto rounded-2xl bg-white p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[17px] font-semibold">{open.room}</div>
                    <div className="text-[13px] text-[#6e6e73]">
                      {duration(open.seconds)}, {open.visits} {t.visits}
                    </div>
                  </div>
                  <button type="button" onClick={() => setOpen(null)} className="rounded-full bg-[#f2f2f7] px-3 py-1 text-[13px] font-medium">
                    {t.close}
                  </button>
                </div>
                {open.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={open.image} alt="" className="max-h-[60vh] w-full rounded-xl object-cover" />
                )}
                {p && floor?.image && (
                  <div className={open.image ? "mt-3" : ""}>
                    {open.image && <div className="mb-1.5 text-[12px] text-[#8e8e93]">{t.where}</div>}
                    <div className="relative w-full overflow-hidden rounded-xl bg-[#eef0f2]" style={{ aspectRatio: String(floor.aspect ?? 1.6) }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={floor.image} alt="" className="absolute inset-0 h-full w-full object-contain" />
                      <span className="absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--report-accent,#0071e3)] ring-4 ring-white/80" style={{ left: `${p.px}%`, top: `${p.py}%` }} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })()}
    </>
  );
}

/** The place's photo - or the floor plan, zoomed in on the spot, with a dot. */
function Thumb({ image, plan, className }: { image: string | null; plan: { image: string; aspect: number; px: number; py: number } | null; className: string }) {
  if (image)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={image} alt="" loading="lazy" className={`${className} flex-none rounded-lg object-cover ring-1 ring-black/[.06]`} />
    );
  if (plan) {
    // The plan 4 times as big as the box, moved so the spot is in the middle.
    const zoom = 4;
    return (
      <span className={`${className} relative flex-none overflow-hidden rounded-lg bg-[#eef0f2] ring-1 ring-black/[.06]`}>
        <span
          className="absolute"
          style={{
            width: `${zoom * 100}%`,
            aspectRatio: String(plan.aspect),
            left: `${(50 - (plan.px * zoom)).toFixed(2)}%`,
            top: "50%",
            transform: `translateY(-${plan.py.toFixed(2)}%)`,
            backgroundImage: `url(${plan.image})`,
            backgroundSize: "contain",
            backgroundRepeat: "no-repeat",
          }}
        />
        <span className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--report-accent,#0071e3)] ring-2 ring-white" />
      </span>
    );
  }
  return <span className={`${className} flex-none rounded-lg bg-[#f2f2f7]`} />;
}
