"use client";

import { useEffect, useRef, useState } from "react";

/*
 * Choosing a period for the numbers: ready-made ones on the left (I dag,
 * Sidste 7 dage, Denne måned …) and a calendar to pick any from-to on the
 * right; nothing changes until "Anvend". Days are "YYYY-MM-DD" in Danish
 * time; both ends are included.
 */

export type Period = { preset: PresetKey; from: string; to: string };
export type PresetKey = "idag" | "igaar" | "7" | "30" | "uge" | "maaned" | "aar" | "egen";

const PRESETS: [PresetKey, string][] = [
  ["idag", "I dag"],
  ["igaar", "I går"],
  ["7", "Sidste 7 dage"],
  ["30", "Sidste 30 dage"],
  ["uge", "Denne uge"],
  ["maaned", "Denne måned"],
  ["aar", "I år"],
  ["egen", "Brugerdefineret"],
];
const MONTHS = ["januar", "februar", "marts", "april", "maj", "juni", "juli", "august", "september", "oktober", "november", "december"];

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const at = (s: string) => new Date(`${s}T12:00:00Z`);
const plus = (s: string, n: number) => {
  const d = at(s);
  d.setUTCDate(d.getUTCDate() + n);
  return ymd(d);
};
/** Today in Denmark. */
export function today(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Copenhagen" }).format(new Date());
}

/** A ready-made period's days, counted from today. */
export function presetPeriod(key: Exclude<PresetKey, "egen">, now = today()): Period {
  const d = at(now);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const range: Record<Exclude<PresetKey, "egen">, [string, string]> = {
    idag: [now, now],
    igaar: [plus(now, -1), plus(now, -1)],
    "7": [plus(now, -6), now],
    "30": [plus(now, -29), now],
    uge: [plus(now, -((d.getUTCDay() + 6) % 7)), plus(now, 6 - ((d.getUTCDay() + 6) % 7))],
    maaned: [ymd(new Date(Date.UTC(y, m, 1, 12))), ymd(new Date(Date.UTC(y, m + 1, 0, 12)))],
    aar: [`${y}-01-01`, `${y}-12-31`],
  };
  const [from, to] = range[key];
  return { preset: key, from, to };
}

const short = (s: string) => at(s).toLocaleDateString("da-DK", { day: "numeric", month: "short", timeZone: "UTC" });
/** "25. okt.–31. okt. 2026" (one day: "31. okt. 2026"). */
export function periodText(p: { from: string; to: string }): string {
  const year = p.to.slice(0, 4);
  if (p.from === p.to) return `${short(p.from)} ${year}`;
  return `${short(p.from)}${p.from.slice(0, 4) !== year ? ` ${p.from.slice(0, 4)}` : ""}–${short(p.to)} ${year}`;
}
export const presetName = (k: PresetKey) => PRESETS.find(([x]) => x === k)?.[1] ?? "";

export function DateRangePicker({ value, onChange, disabled }: { value: Period; onChange: (p: Period) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<{ preset: PresetKey; from: string; to: string | null }>(value);
  const [month, setMonth] = useState(() => value.to.slice(0, 7));
  const box = useRef<HTMLDivElement>(null);
  /** Where the window opens on a computer: under the button, kept on the screen (it floats over narrow columns that would cut it off). */
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  function show() {
    const r = box.current?.getBoundingClientRect();
    if (r) setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - 568)), top: Math.min(r.bottom + 8, Math.max(8, window.innerHeight - 470)) });
    setDraft(value);
    setMonth(value.to.slice(0, 7));
    setOpen(true);
  }
  function pickPreset(k: PresetKey) {
    if (k === "egen") return setDraft({ preset: "egen", from: draft.from, to: draft.to });
    const p = presetPeriod(k);
    setDraft(p);
    setMonth(p.to.slice(0, 7));
  }
  function pickDay(day: string) {
    // First tap: the start. Second: the end (or a new start, if it's before the first).
    if (draft.to !== null || day < draft.from) setDraft({ preset: "egen", from: day, to: null });
    else setDraft({ preset: "egen", from: draft.from, to: day });
  }
  const shift = (n: number) => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    setMonth(ymd(d).slice(0, 7));
  };

  // The month as weeks, Monday first.
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1, 12));
  const lead = (first.getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
  const end = draft.to ?? draft.from;
  const years = Array.from({ length: 6 }, (_, i) => Number(today().slice(0, 4)) - 4 + i);
  const now = today();

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : show())}
        className="flex w-full items-center gap-2 rounded-xl bg-white px-3 py-2 text-left shadow-sm ring-1 ring-black/[.08] transition hover:ring-black/20 disabled:opacity-60"
      >
        <svg viewBox="0 0 20 20" className="h-4 w-4 flex-none text-[#0071e3]" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
          <rect x="3" y="4.5" width="14" height="12" rx="2" />
          <path d="M3 8h14M7 3v3M13 3v3" strokeLinecap="round" />
        </svg>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold leading-tight">{presetName(value.preset)}</span>
          <span className="block truncate text-[11.5px] leading-tight text-[#6e6e73]">{periodText(value)}</span>
        </span>
        <svg viewBox="0 0 20 20" className={`h-4 w-4 flex-none text-[#8e8e93] transition ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
          <path d="m5 8 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Vælg periode"
          style={pos ? ({ "--dl": `${pos.left}px`, "--dt": `${pos.top}px` } as React.CSSProperties) : undefined}
          className="fixed inset-x-2 bottom-2 z-[70] overflow-hidden rounded-2xl bg-white shadow-[0_20px_60px_rgba(0,0,0,.25)] ring-1 ring-black/[.08] sm:inset-x-auto sm:bottom-auto sm:left-[var(--dl)] sm:top-[var(--dt)] sm:w-[560px]"
        >
          <div className="flex flex-col sm:flex-row">
            {/* Ready-made periods: a column on a computer, a row to swipe on a phone. */}
            <div className="flex gap-1 overflow-x-auto border-b border-black/[.06] p-2 sm:w-[200px] sm:flex-none sm:flex-col sm:overflow-visible sm:border-b-0 sm:border-r">
              {PRESETS.map(([k, label]) => {
                const p = k === "egen" ? null : presetPeriod(k);
                const on = draft.preset === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => pickPreset(k)}
                    className={`flex flex-none items-center gap-2 rounded-xl px-3 py-2 text-left transition sm:w-full ${on ? "bg-[#f2f2f7]" : "hover:bg-[#f7f7f9]"}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block whitespace-nowrap text-[13.5px] font-semibold">{label}</span>
                      {p && <span className="hidden whitespace-nowrap text-[11.5px] text-[#6e6e73] sm:block">{periodText(p)}</span>}
                    </span>
                    {on && (
                      <svg viewBox="0 0 20 20" className="hidden h-4 w-4 flex-none sm:block" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
                        <path d="M4.5 10.5l3.5 3.5 7.5-8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>

            {/* The calendar. */}
            <div className="flex-1 p-3 sm:p-4">
              <div className="mb-2 flex items-center justify-center gap-2">
                <button type="button" aria-label="Forrige måned" onClick={() => shift(-1)} className="flex h-8 w-8 items-center justify-center rounded-full text-[18px] hover:bg-[#f2f2f7]">
                  ‹
                </button>
                <select aria-label="Måned" value={m - 1} onChange={(e) => setMonth(`${y}-${String(Number(e.target.value) + 1).padStart(2, "0")}`)} className="rounded-lg bg-white px-2 py-1 text-[14px] font-medium ring-1 ring-black/[.1]">
                  {MONTHS.map((name, i) => (
                    <option key={name} value={i}>
                      {name}
                    </option>
                  ))}
                </select>
                <select aria-label="År" value={y} onChange={(e) => setMonth(`${e.target.value}-${String(m).padStart(2, "0")}`)} className="rounded-lg bg-white px-2 py-1 text-[14px] font-medium ring-1 ring-black/[.1]">
                  {years.map((yy) => (
                    <option key={yy} value={yy}>
                      {yy}
                    </option>
                  ))}
                </select>
                <button type="button" aria-label="Næste måned" onClick={() => shift(1)} className="flex h-8 w-8 items-center justify-center rounded-full text-[18px] hover:bg-[#f2f2f7]">
                  ›
                </button>
              </div>
              <div className="grid grid-cols-7 text-center text-[11.5px] font-semibold text-[#8e8e93]">
                {["Ma", "Ti", "On", "To", "Fr", "Lø", "Sø"].map((d) => (
                  <span key={d} className="py-1">
                    {d}
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-y-1">
                {cells.map((day, i) => {
                  if (!day) return <span key={`x${i}`} />;
                  const inside = day >= draft.from && day <= end;
                  const edge = day === draft.from || day === end;
                  const col = i % 7;
                  return (
                    <span
                      key={day}
                      className={`flex justify-center ${inside && !(draft.from === end) ? "bg-[#0071e3]/10" : ""} ${inside && (day === draft.from || col === 0) ? "rounded-l-full" : ""} ${inside && (day === end || col === 6) ? "rounded-r-full" : ""}`}
                    >
                      <button
                        type="button"
                        onClick={() => pickDay(day)}
                        className={`h-9 w-9 rounded-full text-[13.5px] font-semibold tabular-nums transition ${edge ? "bg-[#0071e3] text-white" : day === now ? "ring-1 ring-[#1d1d1f]" : "hover:bg-[#f2f2f7]"} ${day > now && !edge ? "text-[#c7c7cc]" : ""}`}
                      >
                        {Number(day.slice(8))}
                      </button>
                    </span>
                  );
                })}
              </div>
              <p className="mt-2 min-h-[18px] text-center text-[12px] text-[#6e6e73]">{draft.to === null ? "Vælg slutdatoen" : periodText({ from: draft.from, to: draft.to })}</p>
              <div className="mt-2 flex justify-end gap-2 border-t border-black/[.06] pt-3">
                <button type="button" onClick={() => setOpen(false)} className="rounded-full bg-[#f2f2f7] px-4 py-2 text-[14px] font-semibold">
                  Annuller
                </button>
                <button
                  type="button"
                  disabled={draft.to === null}
                  onClick={() => {
                    onChange({ preset: draft.preset, from: draft.from, to: draft.to ?? draft.from });
                    setOpen(false);
                  }}
                  className="rounded-full bg-[#0071e3] px-5 py-2 text-[14px] font-semibold text-white disabled:opacity-40"
                >
                  Anvend
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
