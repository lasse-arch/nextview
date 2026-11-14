"use client";

import { useEffect, useState } from "react";
import { apiUrl } from "../tours/api";
import { useLang, useT } from "../tours/i18n-react";
import type { TourConfig } from "../tours/types";
import { TourLink } from "./links";

/*
 * "Holdplan" (TourConfig.classes): the gym's coming week of classes from
 * Flexybox - a sheet opened by any link "#hold" (a day at a time: time, class,
 * instructor, room, cancelled, how full where the gym shows it, and Book), and
 * the next classes on place cards with `classes` (e.g. in the class room).
 */

export type TourClass = { id: string; name: string; start: string; end: string; instructor?: string; room?: string; cancelled?: true; free?: number; waitingList?: true };
export type TourClasses = { list: TourClass[]; today: string; tomorrow: string };

/** The classes, fetched once for the tour (null while loading or when there are none). */
export function useTourClasses(T: TourConfig): TourClasses | null {
  const [data, setData] = useState<TourClasses | null>(null);
  const source = T.classes?.source;
  useEffect(() => {
    if (!source) return;
    let dead = false;
    fetch(apiUrl(`/api/tour-classes/${encodeURIComponent(T.slug)}`))
      .then((r) => r.json())
      .then((d: { classes?: TourClass[] }) => {
        if (dead || !d.classes?.length) return;
        // Today and tomorrow on the gym's own calendar (its times carry their offset - the date is the part before "T").
        const day = (ms: number) => new Date(ms).toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" });
        const now = Date.now();
        setData({ list: d.classes, today: day(now), tomorrow: day(now + 86_400_000) });
      })
      .catch(() => {});
    return () => {
      dead = true;
    };
  }, [source, T.slug, T.classes?.department, T.classes?.room]);
  return data;
}

const hhmm = (iso: string) => iso.slice(11, 16).replace(":", ".");
const dateOf = (iso: string) => iso.slice(0, 10);

function useDayName() {
  const tr = useT();
  const lang = useLang();
  const loc = lang === "da" ? "da-DK" : lang;
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  return (date: string, d: TourClasses, short = false) => {
    if (date === d.today) return tr("I dag");
    if (date === d.tomorrow) return tr("I morgen");
    const at = new Date(`${date}T12:00:00`);
    // Short: "Man 16." - long: "Mandag den 16. november" (as the language writes it).
    return short ? `${cap(at.toLocaleDateString(loc, { weekday: "short" }).replace(/\.$/, ""))} ${at.getDate()}.` : cap(at.toLocaleDateString(loc, { weekday: "long", day: "numeric", month: "long" }));
  };
}

function Status({ c }: { c: TourClass }) {
  const tr = useT();
  if (c.cancelled) return <span className="kl-status kl-aflyst">{tr("Aflyst")}</span>;
  if (c.free === undefined) return null;
  if (c.free === 0) return <span className="kl-status kl-fuldt">{c.waitingList ? tr("Fuldt · venteliste") : tr("Fuldt")}</span>;
  return <span className="kl-status kl-ledig">{c.free === 1 ? tr("1 ledig plads") : tr("{n} ledige pladser", { n: String(c.free) })}</span>;
}

function Row({ T, c, onBook }: { T: TourConfig; c: TourClass; onBook: (label: string, href: string) => void }) {
  const tr = useT();
  const k = T.classes!;
  const label = k.button ? tr(k.button) : tr("Book");
  const href = k.bookHref || k.source;
  return (
    <li className={c.cancelled ? "kl-er-aflyst" : ""}>
      <span className="kl-tid">
        {hhmm(c.start)}
        <small>{hhmm(c.end)}</small>
      </span>
      <span className="kl-hold">
        <b>{c.name}</b>
        <span>{[c.instructor, c.room].filter(Boolean).join(" · ")}</span>
        <Status c={c} />
      </span>
      {!c.cancelled && (
        <TourLink href={href} label={`${label}: ${c.name}`} className="kl-book" onClick={() => onBook(`${label}: ${c.name}`, href)}>
          {label}
        </TourLink>
      )}
    </li>
  );
}

/** The whole week, a day at a time. */
export function ClassesSheet({ T, data, onClose, onBook }: { T: TourConfig; data: TourClasses | null; onClose: () => void; onBook: (label: string, href: string) => void }) {
  const tr = useT();
  const dayName = useDayName();
  const days = data ? [...new Set(data.list.map((c) => dateOf(c.start)))] : [];
  const [picked, setPicked] = useState<string | null>(null);
  const day = picked && days.includes(picked) ? picked : days[0];
  const title = T.classes?.title ? tr(T.classes.title) : tr("Holdplan");
  return (
    <div className="kl-bg" onClick={onClose}>
      <div className="kl-ark" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="kl-x" aria-label={tr("Luk")} onClick={onClose}>
          ×
        </button>
        <h2 className="kl-titel">{title}</h2>
        {!data ? (
          <p className="kl-tom">{tr("Holdplanen kan ikke hentes lige nu.")}</p>
        ) : (
          <>
            <div className="kl-dage" role="tablist">
              {days.map((d) => (
                <button key={d} type="button" role="tab" aria-selected={d === day} className={d === day ? "valgt" : ""} onClick={() => setPicked(d)}>
                  {dayName(d, data, true)}
                </button>
              ))}
            </div>
            <h3 className="kl-dag">{day ? dayName(day, data) : ""}</h3>
            <ul className="kl-liste">
              {data.list
                .filter((c) => dateOf(c.start) === day)
                .map((c) => (
                  <Row key={c.id} T={T} c={c} onBook={onBook} />
                ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

/** On a place card: the next classes (today, or the next day with classes) - in the card's room when it has one - and "Se hele holdplanen". */
export function ClassesNext({ T, data, room, onBook }: { T: TourConfig; data: TourClasses; room?: string; onBook: (label: string, href: string) => void }) {
  const tr = useT();
  const dayName = useDayName();
  const want = room?.trim().toLowerCase();
  const list = data.list.filter((c) => !c.cancelled && (!want || c.room?.toLowerCase().includes(want)));
  if (!list.length) return null;
  const day = dateOf(list[0].start);
  const next = list.filter((c) => dateOf(c.start) === day).slice(0, 3);
  return (
    <div className="kl-naeste">
      <b className="kl-naeste-titel">
        {tr("Næste hold")} · {dayName(day, data)}
      </b>
      <ul className="kl-liste">
        {next.map((c) => (
          <Row key={c.id} T={T} c={c} onBook={onBook} />
        ))}
      </ul>
      <button type="button" className="kl-alle" onClick={() => window.dispatchEvent(new Event("hv-hold"))}>
        {tr("Se hele holdplanen")} →
      </button>
    </div>
  );
}

export const CLASSES_CSS = `
.kl-bg{position:absolute;inset:0;z-index:40;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.4);animation:hvFade .25s ease}
.kl-ark{position:relative;display:flex;flex-direction:column;width:min(560px,calc(100% - 32px));max-height:calc(100% - 48px);box-sizing:border-box;padding:22px 22px 12px;border-radius:24px;background:#fff;color:#1d2a30;box-shadow:0 20px 60px rgba(0,0,0,.35);animation:hvUp .35s cubic-bezier(.2,.7,.2,1) both}
.kl-x{position:absolute;top:12px;right:12px;width:34px;height:34px;border:0;border-radius:50%;background:#f0f1f2;color:#1d2a30;font-size:20px;line-height:1;cursor:pointer}
.kl-titel{margin:0 44px 12px 0;font-size:24px;font-weight:900;color:var(--c-main);font-family:var(--font-heading,inherit)}
.kl-dage{flex:none;display:flex;align-items:center;gap:6px;overflow-x:auto;overflow-y:hidden;padding:3px 2px 6px;scrollbar-width:none}
/* Only the list scrolls - the title, the days and the day's heading keep their height however many classes there are. */
.kl-titel,.kl-dag,.kl-x{flex:none}
.kl-ark .kl-liste{flex:1 1 auto;min-height:0}
.kl-dage::-webkit-scrollbar{display:none}
.kl-dage button{flex:none;display:inline-flex;align-items:center;box-sizing:border-box;height:auto;min-height:34px;line-height:1.2;white-space:nowrap;border:0;border-radius:999px;padding:7px 14px;background:var(--c-soft,#f2f3f4);color:#1d2a30;font:inherit;font-size:13.5px;font-weight:700;cursor:pointer}
.kl-dage button.valgt{background:var(--c-main);color:#fff}
.kl-dag{margin:12px 0 2px;font-size:13px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#5d7177}
.kl-ark .kl-liste{overflow-y:auto;overscroll-behavior:contain;margin:0 -22px;padding:0 22px 8px}
.kl-liste{list-style:none;margin:0;padding:0}
.kl-liste li{display:flex;align-items:center;gap:12px;padding:11px 0;border-top:1px solid rgba(0,0,0,.07)}
.kl-liste li:first-child{border-top:0}
.kl-tid{flex:none;width:46px;display:flex;flex-direction:column;font-size:15px;font-weight:800;color:var(--c-main);font-variant-numeric:tabular-nums}
.kl-tid small{font-size:11.5px;font-weight:600;color:#7a8a90}
.kl-hold{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
.kl-hold b{font-size:15px;color:#1d2a30}
.kl-hold>span{font-size:12.5px;color:#5d7177}
.kl-status{align-self:flex-start;margin-top:3px;padding:2px 8px;border-radius:999px;font-size:11.5px;font-weight:800}
.kl-ledig{background:#e7f6ec;color:#1a7f37}
.kl-fuldt{background:#fff4e5;color:#9a5b00}
.kl-aflyst{background:#fdecec;color:#b3261e}
.kl-er-aflyst .kl-hold b,.kl-er-aflyst .kl-tid{text-decoration:line-through;opacity:.6}
.kl-book{flex:none;border-radius:999px;padding:8px 16px;background:var(--c-accent);color:var(--c-on-accent,#fff);font-size:13.5px;font-weight:800;text-decoration:none}
.kl-tom{margin:8px 0 16px;color:#5d7177}
.kl-naeste{margin:12px 0 4px;padding:10px 14px 8px;border-radius:12px;background:color-mix(in srgb,var(--c-accent) 9%,transparent);text-align:left}
.kl-naeste-titel{display:block;font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--c-main)}
.kl-naeste .kl-liste li{padding:8px 0;border-color:rgba(0,0,0,.06)}
.kl-naeste .kl-book{padding:6px 12px;font-size:12.5px}
.kl-alle{border:0;background:none;padding:6px 0 2px;font:inherit;font-size:13.5px;font-weight:800;color:var(--c-main);cursor:pointer}
@media (max-width:760px){
  .kl-bg{align-items:flex-end}
  .kl-ark{width:100%;max-height:88%;border-radius:22px 22px 0 0;padding:18px 16px calc(10px + env(safe-area-inset-bottom,0px))}
  .kl-ark .kl-liste{margin:0 -16px;padding:0 16px 8px}
  .kl-titel{font-size:21px}
}
`;
