"use client";

import { useEffect, useState } from "react";
import { apiUrl } from "../tours/api";
import { useT } from "../tours/i18n-react";
import type { TourConfig } from "../tours/types";
import { TourLink } from "./links";

/*
 * "Næste rundvisninger" (TourConfig.events): the coming dates of the tour's
 * sign-up form, and a button to sign up - on the welcome, in the menu and/or
 * on place cards, wherever the tour has chosen.
 */

export type TourEvent = { title: string; date: string | null };

/** The coming dates, fetched once for the tour: undefined while loading, null when there are none (or they can't be read). */
export function useTourEvents(T: TourConfig): TourEvent[] | null | undefined {
  const [events, setEvents] = useState<TourEvent[] | null | undefined>(undefined);
  const wanted = Boolean(T.events?.source && (T.events.welcome || T.events.menu || T.placeCards?.some((c) => c.events)));
  useEffect(() => {
    if (!wanted) return;
    let dead = false;
    fetch(apiUrl(`/api/tour-dates/${encodeURIComponent(T.slug)}`))
      .then((r) => r.json())
      .then((d: { events?: TourEvent[] }) => !dead && setEvents(d.events?.length ? d.events : null))
      .catch(() => !dead && setEvents(null));
    return () => {
      dead = true;
    };
  }, [wanted, T.slug, T.events?.source]);
  return events;
}

const DAYS = ["søn", "man", "tir", "ons", "tor", "fre", "lør"];
const MONTHS = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

/**
 * The dates as small calendar leaves on one row (weekday, the day big, the
 * month) with "Tilmeld →" beside the heading - calm next to the tiles. A date
 * that couldn't be read as a day keeps its own words.
 */
export function EventsBlock({ T, events, onSignUp, className = "" }: { T: TourConfig; events: TourEvent[]; onSignUp: (label: string, href: string) => void; className?: string }) {
  const tr = useT();
  const ev = T.events!;
  const label = ev.button ? tr(ev.button) : tr("Tilmeld");
  return (
    <div className={`ev ${className}`}>
      <div className="ev-top">
        <b className="ev-titel">{ev.title ? tr(ev.title) : tr("Næste rundvisninger")}</b>
        <TourLink href={ev.source} label={label} className="ev-knap" onClick={() => onSignUp(label, ev.source)}>
          {label} →
        </TourLink>
      </div>
      <ul>
        {events.map((e) => {
          const d = e.date ? new Date(`${e.date}T12:00:00Z`) : null;
          return d ? (
            <li key={e.title} title={e.title} aria-label={e.title}>
              <small>{tr(DAYS[d.getUTCDay()])}</small>
              <b>{d.getUTCDate()}</b>
              <small>{tr(MONTHS[d.getUTCMonth()])}</small>
            </li>
          ) : (
            <li key={e.title} className="ev-tekst">
              {e.title}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The dates' place, kept free while they load - so the welcome doesn't grow when they come. */
export function EventsSpace() {
  return (
    <div className="ev ev-venter" aria-hidden>
      <div className="ev-top">
        <i />
      </div>
      <ul>
        {[0, 1, 2].map((i) => (
          <li key={i} />
        ))}
      </ul>
    </div>
  );
}

export const EVENTS_CSS = `
.ev-venter .ev-top i{display:block;width:140px;height:11px;margin:3px 0;border-radius:6px;background:rgba(0,0,0,.07)}
.ev-venter li{height:62px;min-width:54px;background:rgba(0,0,0,.04);box-shadow:none!important;animation:evPuls 1.4s ease-in-out infinite}
@keyframes evPuls{50%{opacity:.5}}
.ev{margin:14px 0 4px;text-align:left}
.ev-top{display:flex;align-items:baseline;justify-content:space-between;gap:10px}
.ev-titel{display:block;font-size:11.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--c-main);opacity:.75}
.ev .ev-knap{flex:none;font-size:13.5px;font-weight:800;color:var(--c-accent);text-decoration:none;white-space:nowrap}
.ev .ev-knap:hover{text-decoration:underline}
.ev ul{display:flex;gap:8px;margin:6px -3px 0;padding:3px;list-style:none;overflow-x:auto;scrollbar-width:none}
.ev ul::-webkit-scrollbar{display:none}
.ev li{flex:none;display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:54px;padding:6px 8px 7px;border-radius:12px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.07);color:#1d2a30;line-height:1.1}
.ev li small{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#6b7a80}
.ev li b{font-size:19px;font-weight:800;color:var(--c-main);margin:1px 0}
.ev li.ev-tekst{flex-direction:row;font-size:13px;font-weight:600;padding:8px 12px}
.ev li:first-child{box-shadow:0 0 0 2px var(--c-accent)}
.ev-menu{margin:14px 18px 6px}
@media (max-width:760px){.ev li{min-width:48px;padding:5px 7px 6px}.ev li b{font-size:17px}.ev-venter li{height:56px}}
`;
