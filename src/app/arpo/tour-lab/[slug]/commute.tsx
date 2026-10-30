"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "../tours/i18n-react";
import { apiUrl } from "../tours/api";
import type { TourConfig } from "../tours/types";

/*
 * "Vej til skolen": the visitor types their address or postcode and sees how
 * far it is, and how long by car, bike and on foot - and a button to the
 * journey by bus and train in Google Maps (until the tour can ask Rejseplanen
 * itself). Nothing they type is kept; Arpo only passes the search on.
 */

type Suggestion = { text: string; lat: number; lon: number };
type Journey = { km: number; car: number | null; bike: number | null; walk: number | null };

const time = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} t ${min % 60 ? `${min % 60} min` : ""}`.trim());

export function CommuteSheet({ T, onClose, onEvent }: { T: TourConfig; onClose: () => void; onEvent: (name: string, params?: Record<string, string | number>) => void }) {
  const tr = useT();
  const C = T.commute!;
  const [q, setQ] = useState("");
  const [list, setList] = useState<Suggestion[]>([]);
  const [from, setFrom] = useState<Suggestion | null>(null);
  const [result, setResult] = useState<Journey | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const asked = useRef(0);

  // Suggestions while typing (a little after the last key).
  useEffect(() => {
    if (from && q === from.text) return;
    const text = q.trim();
    const n = ++asked.current;
    const timer = window.setTimeout(() => {
      if (text.length < 2) return setList([]);
      fetch(apiUrl(`/api/tour-commute/${T.slug}?${new URLSearchParams({ q: text, to: `${C.lat},${C.lon}` })}`))
        .then((r) => (r.ok ? r.json() : { suggestions: [] }))
        .then((j: { suggestions?: Suggestion[] }) => n === asked.current && setList(j.suggestions ?? []))
        .catch(() => {});
    }, 280);
    return () => window.clearTimeout(timer);
  }, [q, from, T.slug, C.lat, C.lon]);

  async function pick(s: Suggestion) {
    setMapOpen(false);
    setFrom(s);
    setQ(s.text);
    setList([]);
    setBusy(true);
    setError(null);
    setResult(null);
    const r = await fetch(apiUrl(`/api/tour-commute/${T.slug}?${new URLSearchParams({ lat: String(s.lat), lon: String(s.lon), to: `${C.lat},${C.lon}` })}`)).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setError(tr("Kunne ikke finde vejen lige nu - prøv igen."));
    const j = (await r.json()) as Journey;
    setResult(j);
    onEvent("commute", { km: j.km });
  }

  const [mapOpen, setMapOpen] = useState(false);
  // Google's own embeddable map with the journey by public transport (dirflg=r) - no key, nothing about the visitor kept by us.
  // (Its embed address directly - the short maps?output=embed one redirects through a page that refuses to be framed.)
  const n = (v: number) => Number(v.toFixed(5));
  const embed = from ? `https://www.google.com/maps/embed?origin=mfe&pb=!1m10!4m9!3e3!4m3!3m2!1d${n(from.lat)}!2d${n(from.lon)}!4m3!3m2!1d${n(C.lat)}!2d${n(C.lon)}!3m1!1sda!5m1!1sda` : null;
  const maps = from
    ? `https://www.google.com/maps/dir/?${new URLSearchParams({ api: "1", origin: `${from.lat},${from.lon}`, destination: `${C.lat},${C.lon}`, travelmode: "transit" })}`
    : null;
  // Only the ways that make sense: no bike ride over 45 minutes, no walk over an hour - and none the tour leaves out.
  const tiles: [string, string, number | null][] = result
    ? ([
        ["🚗", tr("I bil"), C.hide?.car ? null : result.car],
        ["🚲", tr("På cykel"), C.hide?.bike || (result.bike ?? 0) > 45 ? null : result.bike],
        ["🚶", tr("Til fods"), C.hide?.walk || (result.walk ?? 0) > 60 ? null : result.walk],
      ] as [string, string, number | null][])
    : [];

  return (
    <div className="vt-bg" onClick={onClose}>
      <div className="vt-ark" role="dialog" aria-modal="true" aria-label={C.title || tr("Hvor langt har du til os?")} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="vt-x" aria-label={tr("Luk")} onClick={onClose}>
          ×
        </button>
        <div className="vt-kick">{C.title || tr("Hvor langt har du til os?")}</div>
        <h2>{tr("Find din vej til")} {C.place}</h2>
        <div className="vt-felt">
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setFrom(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && list[0] && void pick(list[0])}
            placeholder={tr("Din adresse eller dit postnummer")}
            aria-label={tr("Din adresse eller dit postnummer")}
            autoComplete="street-address"
          />
          {list.length > 0 && (
            <ul className="vt-liste">
              {list.slice(0, 5).map((s) => (
                <li key={`${s.text}${s.lat}`}>
                  <button type="button" onClick={() => void pick(s)}>
                    {s.text}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {busy && <p className="vt-note">{tr("Finder vejen …")}</p>}
        {error && <p className="vt-note vt-fejl">{error}</p>}
        {result && (
          <>
            <p className="vt-note">
              {tr("Fra")} {from?.text.split(",")[0]} · {result.km.toLocaleString("da-DK")} km
            </p>
            <div className="vt-tal">
              {tiles.map(([icon, label, min]) =>
                min != null ? (
                  <div key={label}>
                    <span>{icon}</span>
                    <b>{time(min)}</b>
                    <small>{label}</small>
                  </div>
                ) : null
              )}
            </div>
          </>
        )}
        {maps && !C.hide?.transit && (
          <div className="vt-bus">
            {C.meet && <div className="vt-bus-h">{tr("Vi mødes kl.")} {C.meet}</div>}
            <p>{tr("Se hvilken bus eller hvilket tog du skal tage - Google Maps finder den bedste rejse.")}</p>
            {mapOpen && embed ? (
              // The journey right here, in Google Maps' own map (the embeddable one - the normal page can't be shown inside another).
              <iframe className="vt-kort" src={embed} title={tr("Se rejsen med bus og tog")} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
            ) : (
              <button type="button" className="vt-knap" onClick={() => (setMapOpen(true), onEvent("commute_transit"))}>
                🚌 {tr("Se rejsen med bus og tog")}
              </button>
            )}
            <a href={maps} target="_blank" rel="noopener noreferrer" className="vt-ny" onClick={() => onEvent("commute_transit_tab")}>
              {tr("Åbn i Google Maps")} ↗
            </a>
          </div>
        )}
        <p className="vt-lille">{tr("Tiderne er cirka. Din adresse gemmes ikke.")}</p>
      </div>
    </div>
  );
}

export const COMMUTE_CSS = `
.vt-bg{position:absolute;inset:0;z-index:40;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.35);animation:hvFade .25s ease}
.vt-ark{position:relative;width:min(420px,calc(100% - 24px));margin:12px;max-height:calc(100% - 24px);overflow-y:auto;background:#fff;border-radius:22px;padding:18px 18px 14px;box-shadow:0 12px 40px rgba(0,0,0,.3);color:var(--c-main);font-family:inherit}
@media (min-width:761px){
  .vt-bg{align-items:center}
  .vt-ark{width:min(540px,calc(100% - 48px));padding:26px 28px 20px;border-radius:24px}
  .vt-ark h2{font-size:26px;margin-bottom:16px}
  .vt-felt input{font-size:17px;padding:14px 16px}
  .vt-tal b{font-size:19px}
  .vt-ark .vt-knap{font-size:16px;padding:13px}
}
.vt-x{position:absolute;right:12px;top:12px;width:32px;height:32px;border:0;border-radius:50%;background:#f2f2f2;font-size:19px;cursor:pointer;color:#1d2a30}
.vt-kick{font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--c-accent);margin-right:40px}
.vt-ark h2{margin:4px 40px 12px 0;font-size:21px;line-height:1.15;font-weight:900}
.vt-felt{position:relative}
.vt-felt input{box-sizing:border-box;width:100%;border:0;border-radius:12px;background:#f2f2f2;padding:12px 13px;font:inherit;font-size:16px;color:#1d2a30;outline:none}
.vt-felt input:focus{box-shadow:0 0 0 2px var(--c-accent)}
/* The suggestions: a calm list right under the field, inside the card (it grows with them - nothing to scroll). */
.vt-liste{margin:6px 0 0;padding:4px;list-style:none;background:#fff;border-radius:14px;border:1px solid rgba(0,0,0,.08);box-shadow:0 8px 24px rgba(0,0,0,.08);animation:hvFade .15s ease}
.vt-liste li+li{border-top:1px solid rgba(0,0,0,.05)}
.vt-liste button{display:flex;align-items:center;gap:10px;width:100%;text-align:left;border:0;background:none;padding:11px 10px;border-radius:10px;font:inherit;font-size:15px;color:#1d2a30;cursor:pointer}
.vt-liste button::before{content:"";flex:none;width:8px;height:8px;border-radius:50%;background:var(--c-accent);opacity:.7}
.vt-liste button:hover,.vt-liste button:focus-visible{background:#f4f4f2;outline:none}
.vt-note{margin:12px 2px 0;font-size:13px;color:#6b7a80}
.vt-fejl{color:#c0392b}
.vt-tal{display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:8px;margin-top:8px}
.vt-tal div{background:#f6f6f4;border-radius:12px;padding:10px 8px;text-align:center;display:flex;flex-direction:column;align-items:center}
.vt-tal span{font-size:18px}.vt-tal b{font-size:16px;font-weight:900;margin-top:2px;color:#1d2a30}.vt-tal small{font-size:11.5px;color:#6b7a80}
.vt-bus{margin-top:12px;border-radius:14px;background:color-mix(in srgb,var(--c-accent) 8%,#fff);border:1px solid color-mix(in srgb,var(--c-accent) 25%,#fff);padding:12px 13px}
.vt-bus-h{font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--c-accent)}
.vt-bus p{margin:4px 0 10px;font-size:14px;line-height:1.4;color:#33474d}
.vt-knap{display:block;text-align:center;border-radius:999px;background:var(--c-accent);color:#fff;font-weight:800;padding:11px;font-size:15px;text-decoration:none}
.vt-kort{display:block;width:100%;height:340px;border:0;border-radius:12px;background:#eee}
.vt-ny{display:block;margin-top:8px;text-align:center;font-size:12.5px;font-weight:700;color:var(--c-main);text-decoration:none;opacity:.75}
.vt-ark button.vt-knap{width:100%;border:0;cursor:pointer;font:inherit;font-weight:800}
.vt-lille{margin:10px 2px 0;text-align:center;font-size:11.5px;color:#8a979c}
@media (max-height:500px) and (min-width:500px){.vt-ark,.vt-tur-knap{zoom:var(--ui-zoom,.72)}}
/* Its own button on the tour (when chosen) - under the menu button, or bottom left/right. */
.vt-tur-knap{position:absolute;z-index:7;display:flex;align-items:center;gap:7px;border:0;border-radius:999px;padding:9px 15px;background:#fff;color:var(--c-main);font:inherit;font-weight:800;font-size:13.5px;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.22)}
.vt-tur-knap-under-menu{top:calc(68px + env(safe-area-inset-top,0px));right:16px}
.hv:has(.hv-live-chip) .vt-tur-knap-under-menu{top:calc(124px + env(safe-area-inset-top,0px))}
.vt-tur-knap-bottom-left{bottom:calc(18px + env(safe-area-inset-bottom,0px));left:16px}
.vt-tur-knap-bottom-right{bottom:calc(18px + env(safe-area-inset-bottom,0px));right:16px}
.hv-menu-aaben .vt-tur-knap,.hv-med-kort .vt-tur-knap,.hv:has(.hv-story-play) .vt-tur-knap{opacity:0;pointer-events:none}
.hv-st-on-d .vt-tur-knap-bottom-left,.hv-st-on-d .vt-tur-knap-bottom-right{bottom:calc(var(--st-h,148px) + 10px)}
@media (max-width:760px){
  .vt-tur-knap{font-size:13px;padding:8px 13px}
  .vt-tur-knap-under-menu{top:calc(60px + env(safe-area-inset-top,0px));right:10px}
  .hv:has(.hv-live-chip) .vt-tur-knap-under-menu{top:calc(108px + env(safe-area-inset-top,0px))}
  .hv-st-on-m .vt-tur-knap-bottom-left,.hv-st-on-m .vt-tur-knap-bottom-right{bottom:calc(var(--st-h,150px) + 8px)}
  .vt-tur-knap-bottom-left{left:12px}.vt-tur-knap-bottom-right{right:12px}
}
`;
