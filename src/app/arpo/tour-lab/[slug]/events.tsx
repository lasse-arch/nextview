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

/** The coming dates, fetched once for the tour (null while loading or when there are none). */
export function useTourEvents(T: TourConfig): TourEvent[] | null {
  const [events, setEvents] = useState<TourEvent[] | null>(null);
  const wanted = Boolean(T.events?.source && (T.events.welcome || T.events.menu || T.placeCards?.some((c) => c.events)));
  useEffect(() => {
    if (!wanted) return;
    let dead = false;
    fetch(apiUrl(`/api/tour-dates/${encodeURIComponent(T.slug)}`))
      .then((r) => r.json())
      .then((d: { events?: TourEvent[] }) => !dead && setEvents(d.events?.length ? d.events : null))
      .catch(() => {});
    return () => {
      dead = true;
    };
  }, [wanted, T.slug, T.events?.source]);
  return events;
}

export function EventsBlock({ T, events, onSignUp, className = "" }: { T: TourConfig; events: TourEvent[]; onSignUp: (label: string, href: string) => void; className?: string }) {
  const tr = useT();
  const ev = T.events!;
  const label = ev.button ? tr(ev.button) : tr("Tilmeld");
  return (
    <div className={`ev ${className}`}>
      <b className="ev-titel">{ev.title ? tr(ev.title) : tr("Næste rundvisninger")}</b>
      <ul>
        {events.map((e) => (
          <li key={e.title}>
            <i aria-hidden />
            {e.title}
          </li>
        ))}
      </ul>
      <TourLink href={ev.source} label={label} className="hv-btn hv-primary ev-knap" onClick={() => onSignUp(label, ev.source)}>
        {label}
      </TourLink>
    </div>
  );
}

export const EVENTS_CSS = `
.ev{margin:12px 0 4px;padding:12px 14px;border-radius:12px;background:color-mix(in srgb,var(--c-accent) 9%,transparent);text-align:left}
.ev-titel{display:block;font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--c-main)}
.ev ul{margin:6px 0 10px;padding:0;list-style:none}
.ev li{display:flex;align-items:center;gap:8px;padding:3px 0;font-size:14px;font-weight:600;color:#1d2a30}
.ev li i{flex:none;width:7px;height:7px;border-radius:50%;background:var(--c-accent)}
.ev .ev-knap{display:inline-flex;margin:0;padding:8px 18px;font-size:14px}
.hv-light .ev li,.pc .ev li{color:#1d2a30}
.ev-menu{margin:14px 18px 6px}
@media (max-width:760px){.ev{padding:10px 12px}.ev li{font-size:13px}}
`;
