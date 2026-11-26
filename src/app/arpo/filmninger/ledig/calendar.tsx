"use client";

import { useMemo, useState, useTransition } from "react";
import { saveMyAvailability } from "@/lib/actions/availability";

type Span = { fromMin: number; toMin: number; note: string | null };
const DAYS = ["Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn"];
const MONTHS = ["jan.", "feb.", "mar.", "apr.", "maj", "jun.", "jul.", "aug.", "sep.", "okt.", "nov.", "dec."];
const add = (s: string, n: number) => new Date(Date.parse(`${s}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const clock = (m: number) => `${Math.floor(m / 60)}${m % 60 ? `.${String(m % 60).padStart(2, "0")}` : ""}`;
const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};
function weekNo(s: string) {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
  const first = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d.getTime() - first.getTime()) / 86_400_000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
}

/**
 * The filmer's 14 weeks: tap days (or a weekday's heading for all of them), then say when you can - all day, morning,
 * afternoon, your own hours, or not. Days you're booked show the filming.
 */
export function AvailabilityCalendar({ start, today, last, saved: initial, booked }: { start: string; today: string; last: string; saved: Record<string, Span>; booked: Record<string, string[]> }) {
  const [saved, setSaved] = useState(initial);
  const [picked, setPicked] = useState<string[]>([]);
  const [from, setFrom] = useState("08:00");
  const [to, setTo] = useState("16:00");
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const [pending, startTransition] = useTransition();
  const weeks = useMemo(() => {
    const out: string[][] = [];
    for (let d = start; d <= last; d = add(d, 7)) out.push(Array.from({ length: 7 }, (_, i) => add(d, i)));
    return out;
  }, [start, last]);
  const open = (d: string) => d >= today && d <= last;
  const toggle = (d: string) => open(d) && setPicked((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d]));
  const pickWeekday = (i: number) => {
    const all = weeks.map((w) => w[i]).filter(open);
    setPicked((p) => (all.every((d) => p.includes(d)) ? p.filter((d) => !all.includes(d)) : [...new Set([...p, ...all])]));
  };
  const freeDays = Object.keys(saved).filter((d) => d >= today).length;

  function apply(span: { fromMin: number; toMin: number } | null) {
    if (!picked.length) return setNote({ text: "Tryk først på de dage, det gælder.", error: true });
    const dates = picked;
    startTransition(async () => {
      const r = await saveMyAvailability({ dates, fromMin: span?.fromMin ?? null, toMin: span?.toMin ?? null });
      if (!r.ok) return setNote({ text: r.error, error: true });
      setSaved((s) => {
        const n = { ...s };
        for (const d of dates) {
          if (span) n[d] = { ...span, note: null };
          else delete n[d];
        }
        return n;
      });
      setPicked([]);
      setNote({ text: span ? `${r.saved} ${r.saved === 1 ? "dag" : "dage"} sat som ledig ${clock(span.fromMin)}-${clock(span.toMin)}.` : `${r.saved} ${r.saved === 1 ? "dag" : "dage"} sat som ikke ledig.` });
    });
  }

  const btn = "rounded-full px-3.5 py-2 text-[13.5px] font-medium disabled:opacity-50";
  return (
    <div>
      <p className="mb-4 text-[14px] leading-relaxed text-[#6e6e73]">
        Sæt de dage, du kan filme de næste 3 måneder. Vi booker dig kun på dage, hvor du er ledig, og du får en kalenderinvitation, når du er sat på en opgave. Lige nu er du ledig {freeDays} {freeDays === 1 ? "dag" : "dage"}.
      </p>

      <div className="sticky top-2 z-10 mb-4 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-black/[.06]">
        <div className="mb-2 text-[13px] text-[#6e6e73]">{picked.length ? `${picked.length} ${picked.length === 1 ? "dag valgt" : "dage valgt"} - hvornår kan du?` : "Tryk på dagene (eller på Man, Tir … for alle de dage)."}</div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={pending} onClick={() => apply({ fromMin: 480, toMin: 1020 })} className={`${btn} bg-[#34c759] text-white`}>
            Hele dagen (8-17)
          </button>
          <button type="button" disabled={pending} onClick={() => apply({ fromMin: 480, toMin: 720 })} className={`${btn} bg-[#e8f8ec] text-[#1b7a35]`}>
            Formiddag (8-12)
          </button>
          <button type="button" disabled={pending} onClick={() => apply({ fromMin: 720, toMin: 1020 })} className={`${btn} bg-[#e8f8ec] text-[#1b7a35]`}>
            Eftermiddag (12-17)
          </button>
          <span className="flex items-center gap-1 rounded-full bg-[#f2f2f7] py-1 pl-3 pr-1 text-[13px]">
            <input type="time" value={from} onChange={(e) => setFrom(e.target.value)} className="bg-transparent" aria-label="Fra" />
            -
            <input type="time" value={to} onChange={(e) => setTo(e.target.value)} className="bg-transparent" aria-label="Til" />
            <button type="button" disabled={pending} onClick={() => apply({ fromMin: toMin(from), toMin: toMin(to) })} className={`${btn} bg-white py-1 text-[#0071e3]`}>
              Sæt
            </button>
          </span>
          <button type="button" disabled={pending} onClick={() => apply(null)} className={`${btn} bg-[#f2f2f7] text-[#ff3b30]`}>
            Ikke ledig
          </button>
          {picked.length > 0 && (
            <button type="button" onClick={() => setPicked([])} className={`${btn} text-[#6e6e73]`}>
              Ryd valg
            </button>
          )}
        </div>
        {note && <p className={`mt-2 text-[13px] ${note.error ? "text-[#ff3b30]" : "text-[#1b7a35]"}`}>{note.text}</p>}
      </div>

      <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-black/[.06]">
        <div className="grid grid-cols-[52px_repeat(7,1fr)] border-b border-black/[.06] bg-[#f9f9fb]">
          <span />
          {DAYS.map((d, i) => (
            <button key={d} type="button" onClick={() => pickWeekday(i)} className="py-2 text-center text-[12px] font-semibold text-[#6e6e73] hover:text-[#0071e3]" title={`Vælg alle ${d.toLowerCase()}dage`}>
              {d}
            </button>
          ))}
        </div>
        {weeks.map((w) => (
          <div key={w[0]} className="grid grid-cols-[52px_repeat(7,1fr)] border-b border-black/[.04] last:border-0">
            <span className="flex items-center justify-center text-[11px] text-[#8e8e93]">uge {weekNo(w[0])}</span>
            {w.map((d) => {
              const s = saved[d];
              const b = booked[d];
              const sel = picked.includes(d);
              const n = Number(d.slice(8));
              return (
                <button
                  key={d}
                  type="button"
                  disabled={!open(d)}
                  onClick={() => toggle(d)}
                  className={`relative m-0.5 flex min-h-[64px] flex-col items-start rounded-lg p-1.5 text-left transition ${!open(d) ? "opacity-35" : "hover:ring-1 hover:ring-[#0071e3]/40"} ${s ? "bg-[#e8f8ec]" : "bg-transparent"} ${sel ? "ring-2 ring-[#0071e3]" : ""}`}
                >
                  <span className={`text-[12px] font-semibold ${d === today ? "text-[#0071e3]" : "text-[#1d1d1f]"}`}>
                    {n}
                    {n === 1 || d === w[0] ? <span className="ml-0.5 font-normal text-[#8e8e93]">{MONTHS[Number(d.slice(5, 7)) - 1]}</span> : null}
                  </span>
                  {s && <span className="mt-0.5 text-[11px] font-medium text-[#1b7a35]">{`${clock(s.fromMin)}-${clock(s.toMin)}`}</span>}
                  {b?.map((x) => (
                    <span key={x} className="mt-0.5 w-full truncate rounded bg-[#0071e3] px-1 text-[10.5px] font-medium text-white" title={x}>
                      🎬 {x}
                    </span>
                  ))}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
