"use client";

import { useState } from "react";
import type { TourInProgress } from "@/lib/online-tours";

/*
 * Online kunder → "Tours i gang": the tours being built, for the sellers -
 * where each stands (i gang, sendt til gennemgang, godkendt), who builds it,
 * by when, when it was last saved - and "Se touren", the latest saved version
 * to look at (nothing can be changed there). No money.
 */

const STATUS: Record<TourInProgress["status"], [string, string]> = {
  "i-gang": ["I gang", "bg-amber-50 text-amber-800 ring-amber-600/20"],
  gennemgang: ["Sendt til gennemgang", "bg-sky-50 text-sky-800 ring-sky-600/20"],
  godkendt: ["Godkendt af kunden", "bg-emerald-50 text-emerald-800 ring-emerald-600/20"],
};

const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("da-DK", { day: "numeric", month: "short" });
const when = (iso: string) => new Date(iso).toLocaleString("da-DK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Copenhagen" });

export function ToursInProgress({ tours, today }: { tours: TourInProgress[]; today: string }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<TourInProgress["status"] | null>(null);
  const shown = tours.filter((t) => (!status || t.status === status) && (!q.trim() || `${t.name} ${t.customer ?? ""} ${t.builder ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Chip on={!status} onClick={() => setStatus(null)} label="Alle" n={tours.length} />
          {(Object.keys(STATUS) as TourInProgress["status"][]).map((k) => (
            <Chip key={k} on={status === k} onClick={() => setStatus(status === k ? null : k)} label={STATUS[k][0]} n={tours.filter((t) => t.status === k).length} />
          ))}
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Søg på kunde eller tour…" className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm sm:w-64" />
      </div>
      {shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-400">Ingen tours i gang matcher.</p>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {shown.map((t) => {
            const late = t.deadline && t.deadline < today && t.status === "i-gang";
            return (
              <li key={t.slug} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/tour-thumb?tour=${encodeURIComponent(t.slug)}&w=160`} alt="" loading="lazy" className="h-12 w-20 flex-none rounded-lg bg-slate-100 object-cover" onError={(e) => (e.currentTarget.style.visibility = "hidden")} />
                <div className="min-w-0 flex-1 basis-[calc(100%-6.5rem)] sm:basis-auto">
                  <p className="truncate text-sm font-semibold text-slate-900">{t.customer ?? t.name}</p>
                  <p className="truncate text-xs text-slate-500">
                    {t.customer && t.customer !== t.name ? `${t.name}, ` : ""}
                    {t.builder ? `bygges af ${t.builder}` : "ingen tildelt endnu"}
                    {t.deadline && <span className={late ? "font-semibold text-red-600" : ""}>{`, klar ${day(t.deadline)}`}</span>}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Sidst gemt {when(t.savedAt)}
                    {t.savedBy ? ` af ${t.savedBy}` : ""}
                    {t.working ? " (der arbejdes på flere ændringer)" : ""}
                  </p>
                </div>
                {/* On a phone the status and the button go on their own line under the words. */}
                <div className="flex items-center justify-end gap-2 max-sm:w-full">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS[t.status][1]}`}>{STATUS[t.status][0]}</span>
                  <a href={`/arpo/se-tour/${encodeURIComponent(t.slug)}`} target="_blank" rel="noopener" className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700">
                    Se touren ↗
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-slate-400">&quot;Se touren&quot; viser den senest gemte version - kun til at kigge, og besøget tæller ikke med i kundens tal. Send den ikke til kunden: den er ikke færdig.</p>
    </div>
  );
}

function Chip({ on, onClick, label, n }: { on: boolean; onClick: () => void; label: string; n: number }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-inset transition ${on ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"}`}>
      {label} <span className={on ? "text-white/70" : "text-slate-400"}>{n}</span>
    </button>
  );
}
