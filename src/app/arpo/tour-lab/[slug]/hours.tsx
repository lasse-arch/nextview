"use client";

import { useEffect, useState } from "react";
import { useT } from "../tours/i18n-react";
import type { TourConfig } from "../tours/types";

/*
 * Åbningstider in the contact box (TourConfig.contact.hours): the rows as the
 * customer writes them ("Mandag - søndag", "05.00 - 23.00"), and - when the
 * rows can be read as days and times - "Åbent nu, lukker 23.00" / "Lukket,
 * åbner 05.00", worked out on the place's own clock (Copenhagen).
 */

type Hours = NonNullable<NonNullable<TourConfig["contact"]>["hours"]>;

const DAY_NAMES: [RegExp, number][] = [
  [/^man/, 1], [/^tir/, 2], [/^ons/, 3], [/^tor/, 4], [/^fre/, 5], [/^l(ø|o)r/, 6], [/^s(ø|o)n/, 0],
  [/^mon/, 1], [/^tue/, 2], [/^wed/, 3], [/^thu/, 4], [/^fri/, 5], [/^sat/, 6], [/^sun/, 0],
];
const dayOf = (w: string) => DAY_NAMES.find(([re]) => re.test(w))?.[1];

/** The weekdays (0 = Sunday) a row's days text covers - null when it can't be read (e.g. "Helligdage"). */
export function daysOf(text: string): number[] | null {
  const t = text.toLowerCase().trim();
  if (/alle dage|hver dag|dagligt|every day|daily/.test(t)) return [0, 1, 2, 3, 4, 5, 6];
  if (/^hverdage|^weekdays/.test(t)) return [1, 2, 3, 4, 5];
  if (/^weekend/.test(t)) return [6, 0];
  const range = /^([a-zæøå]+)\.?\s*(?:-|–|til|to)\s*([a-zæøå]+)/.exec(t);
  if (range) {
    const a = dayOf(range[1]);
    const b = dayOf(range[2]);
    if (a == null || b == null) return null;
    const out: number[] = [];
    for (let d = a; ; d = (d + 1) % 7) {
      out.push(d);
      if (d === b || out.length > 7) break;
    }
    return out;
  }
  const list = t.split(/\s*(?:,|og|and|&)\s*/).map((w) => dayOf(w));
  return list.length && list.every((d) => d != null) ? (list as number[]) : null;
}

/** A row's time as minutes from midnight - [open, close] - or "closed"; null when it can't be read. */
export function timesOf(text: string): [number, number] | "closed" | null {
  const t = text.toLowerCase();
  if (/lukket|closed/.test(t)) return "closed";
  if (/døgnet rundt|24\/7|24 timer|24 hours/.test(t)) return [0, 24 * 60];
  const m = /(\d{1,2})(?:[:.](\d{2}))?\s*(?:-|–|til|to)\s*(\d{1,2})(?:[:.](\d{2}))?/.exec(t);
  if (!m) return null;
  const a = Number(m[1]) * 60 + Number(m[2] ?? 0);
  const b = Number(m[3]) * 60 + Number(m[4] ?? 0);
  return a <= 24 * 60 && b <= 24 * 60 ? [a, b === 0 ? 24 * 60 : b] : null;
}

const clock = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, "0")}.${String(min % 60).padStart(2, "0")}`;

/** "Åbent nu, lukker 23.00" or "Lukket, åbner 05.00" (today) - null when the rows don't say. */
function statusNow(hours: Hours, weekday: number, minutes: number): { open: boolean; at?: string } | null {
  let known = false;
  let today: [number, number] | "closed" | null = null;
  for (const h of hours) {
    const days = daysOf(h.days);
    const time = timesOf(h.time);
    if (!days || !time) continue;
    known = true;
    if (days.includes(weekday)) today = time;
  }
  if (!known) return null;
  if (!today || today === "closed") return { open: false };
  const [a, b] = today;
  if (minutes >= a && minutes < b) return { open: true, at: b >= 24 * 60 ? undefined : clock(b) };
  return minutes < a ? { open: false, at: clock(a) } : { open: false };
}

export function OpeningHours({ hours, note }: { hours: Hours; note?: string }) {
  const tr = useT();
  const [now, setNow] = useState<{ open: boolean; at?: string } | null>(null);
  useEffect(() => {
    const tick = () => {
      // The place's own clock, wherever the visitor is.
      const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Copenhagen", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
      const get = (k: string) => parts.find((p) => p.type === k)?.value ?? "";
      const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
      setNow(statusNow(hours, weekday, Number(get("hour")) * 60 + Number(get("minute"))));
    };
    tick();
    const t = window.setInterval(tick, 60_000);
    return () => window.clearInterval(t);
  }, [hours]);
  return (
    <div className="hv-aabent">
      <div className="hv-aabent-top">
        <svg className="hv-ci" viewBox="0 0 24 24" aria-hidden>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5V12l3 2" />
        </svg>
        <span>{tr("Åbningstider")}</span>
        {now && (
          <em className={now.open ? "aaben" : "lukket"}>
            {now.open ? (now.at ? tr("Åbent nu, lukker {tid}", { tid: now.at }) : tr("Åbent nu")) : now.at ? tr("Lukket, åbner {tid}", { tid: now.at }) : tr("Lukket nu")}
          </em>
        )}
      </div>
      <dl>
        {hours.map((h, i) => (
          <div key={i}>
            <dt>{tr(h.days)}</dt>
            <dd>{tr(h.time)}</dd>
          </div>
        ))}
      </dl>
      {note && <p className="hv-aabent-note">{tr(note)}</p>}
    </div>
  );
}

export const HOURS_CSS = `
.hv-aabent{display:flex;flex-direction:column;gap:6px;margin-top:2px;padding-top:10px;border-top:1px solid rgba(0,0,0,.07)}
.hv-aabent-top{display:flex;align-items:center;flex-wrap:wrap;gap:8px;color:var(--c-main);font-size:14px;font-weight:600}
.hv-aabent-top em{margin-left:auto;padding:3px 9px;border-radius:999px;font-style:normal;font-size:11.5px;font-weight:800;white-space:nowrap}
.hv-aabent-top em.aaben{background:#e3f5e8;color:#17703a}
.hv-aabent-top em.aaben::before{content:"";display:inline-block;width:6px;height:6px;margin-right:6px;border-radius:50%;background:#22a04f;vertical-align:1px}
.hv-aabent-top em.lukket{background:rgba(0,0,0,.06);color:#5d7177}
.hv-aabent dl{margin:0 0 0 26px;display:flex;flex-direction:column;gap:3px}
.hv-aabent dl div{display:flex;flex-wrap:wrap;justify-content:space-between;column-gap:12px;row-gap:0;font-size:13.5px}
/* The days never break inside ("Mandag - søndag" on one line) - short of room, the time moves under them, to the right. */
.hv-aabent dt{color:#4b5d63;white-space:nowrap}
.hv-aabent dd{margin:0;font-weight:700;color:var(--c-main);font-variant-numeric:tabular-nums;white-space:nowrap;margin-left:auto}
.hv-aabent-note{margin:2px 0 0 26px;font-size:12px;line-height:1.4;color:#6b7a80}
`;
