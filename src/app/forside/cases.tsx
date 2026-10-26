"use client";

import { useEffect, useState } from "react";
import type { Case } from "./data";

/** The case cards - a click opens the tour right here, full screen. */
export function CaseGrid({ cases }: { cases: Case[] }) {
  const [open, setOpen] = useState<Case | null>(null);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    document.addEventListener("keydown", esc);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", esc);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {cases.map((c) => (
          <button key={c.slug} type="button" onClick={() => setOpen(c)} className="group flex flex-col self-start text-left">
            <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-[#1f3a5f]">
              {c.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.image} alt="" loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_30%_20%,#4a6b8a,#1f3a5f_60%,#0f1d33)]">
                  <span className="text-4xl font-extrabold tracking-tight text-white/90">{c.title}</span>
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
              <span className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[#1f3a5f]">{c.category}</span>
              <span className="absolute bottom-4 left-4 flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold text-[#1f3a5f] shadow-lg transition group-hover:translate-x-1">
                <span aria-hidden>▶</span> Gå rundt
              </span>
            </div>
            <h3 className="mt-4 text-lg font-bold text-[#0f1d33]">{c.title}</h3>
            <p className="mt-1 text-[15px] leading-relaxed text-slate-600">{c.text}</p>
          </button>
        ))}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[#0b1626]" role="dialog" aria-label={open.title}>
          <div className="flex items-center gap-3 px-4 py-3 text-white">
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold">{open.title}</p>
              <p className="text-xs text-white/60">{open.category}</p>
            </div>
            <a href={open.tour} target="_blank" rel="noopener" className="hidden rounded-full border border-white/25 px-4 py-2 text-sm font-semibold sm:block">
              Åbn i nyt vindue ↗
            </a>
            <button type="button" onClick={() => setOpen(null)} className="rounded-full bg-white px-4 py-2 text-sm font-bold text-[#0f1d33]">
              Luk
            </button>
          </div>
          <iframe src={open.tour} title={open.title} className="w-full flex-1 border-0" allow="fullscreen; xr-spatial-tracking; gyroscope; accelerometer" allowFullScreen />
        </div>
      )}
    </>
  );
}
