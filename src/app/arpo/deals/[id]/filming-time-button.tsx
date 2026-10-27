"use client";

import { useState, useTransition } from "react";
import { setFilmingActual } from "@/lib/actions/deals";

/**
 * "Filmtid": the time actually spent filming (incl. setting up). Must be
 * filled in before the deal can go Live - it's the customer's cost in hours
 * next to the tour's editing time (see the tour editor's "Tid og pris").
 */
export function FilmingTimeButton({ dealId, minutes, plannedMinutes }: { dealId: string; minutes: number | null; plannedMinutes: number | null }) {
  const [open, setOpen] = useState(false);
  const [hours, setHours] = useState(minutes != null ? String(minutes / 60).replace(".", ",") : plannedMinutes ? String(plannedMinutes / 60).replace(".", ",") : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const label = minutes != null ? `Filmtid: ${String(Math.round((minutes / 60) * 10) / 10).replace(".", ",")} t` : "Filmtid mangler";
  return (
    <div className="relative inline-block shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`rounded-lg px-4 py-2 text-[13px] font-semibold shadow-sm transition-colors ${minutes != null ? "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50" : "border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"}`}
        title="Den tid, filmingen faktisk tog - skal udfyldes før dealen kan sættes Live"
      >
        {label}
      </button>
      {open && (
        <form
          className="fixed inset-x-4 top-20 z-30 rounded-lg border border-slate-200 bg-white p-4 shadow-lg sm:absolute sm:inset-x-auto sm:left-0 sm:top-full sm:mt-2 sm:w-72"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            start(async () => {
              const r = await setFilmingActual(dealId, Number(hours.replace(",", ".")));
              if (!r.ok) return setError(r.error);
              setOpen(false);
            });
          }}
        >
          <label className="block text-xs font-semibold uppercase text-slate-500">Timer brugt på filming</label>
          <input autoFocus inputMode="decimal" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Fx 2,5" value={hours} onChange={(e) => setHours(e.target.value)} />
          <p className="mt-1 text-xs text-slate-500">Med opsætning og transport. Skal udfyldes, før dealen kan sættes Live.</p>
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
          <button type="submit" disabled={pending || !hours.trim()} className="mt-3 w-full rounded-lg bg-slate-900 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {pending ? "Gemmer…" : "Gem"}
          </button>
        </form>
      )}
    </div>
  );
}
