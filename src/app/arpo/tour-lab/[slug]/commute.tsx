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

  const maps = from
    ? `https://www.google.com/maps/dir/?${new URLSearchParams({ api: "1", origin: `${from.lat},${from.lon}`, destination: `${C.lat},${C.lon}`, travelmode: "transit" })}`
    : null;
  const tiles: [string, string, number | null][] = result
    ? [
        ["🚗", tr("I bil"), result.car],
        ["🚲", tr("På cykel"), result.bike],
        ["🚶", tr("Til fods"), result.walk],
      ]
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
              {list.map((s) => (
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
        {maps && (
          <div className="vt-bus">
            {C.meet && <div className="vt-bus-h">{tr("Vi mødes kl.")} {C.meet}</div>}
            <p>{tr("Se hvilken bus eller hvilket tog du skal tage - Google Maps finder den bedste rejse.")}</p>
            <a href={maps} target="_blank" rel="noopener noreferrer" className="vt-knap" onClick={() => onEvent("commute_transit")}>
              🚌 {tr("Se rejsen med bus og tog")}
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
@media (min-width:761px){.vt-bg{align-items:center}}
.vt-x{position:absolute;right:12px;top:12px;width:32px;height:32px;border:0;border-radius:50%;background:#f2f2f2;font-size:19px;cursor:pointer;color:#1d2a30}
.vt-kick{font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--c-accent);margin-right:40px}
.vt-ark h2{margin:4px 40px 12px 0;font-size:21px;line-height:1.15;font-weight:900}
.vt-felt{position:relative}
.vt-felt input{box-sizing:border-box;width:100%;border:0;border-radius:12px;background:#f2f2f2;padding:12px 13px;font:inherit;font-size:16px;color:#1d2a30;outline:none}
.vt-felt input:focus{box-shadow:0 0 0 2px var(--c-accent)}
.vt-liste{position:absolute;left:0;right:0;top:calc(100% + 4px);z-index:2;margin:0;padding:4px;list-style:none;background:#fff;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.2)}
.vt-liste button{display:block;width:100%;text-align:left;border:0;background:none;padding:9px 10px;border-radius:8px;font:inherit;font-size:14.5px;color:#1d2a30;cursor:pointer}
.vt-liste button:hover{background:#f2f2f2}
.vt-note{margin:12px 2px 0;font-size:13px;color:#6b7a80}
.vt-fejl{color:#c0392b}
.vt-tal{display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:8px;margin-top:8px}
.vt-tal div{background:#f6f6f4;border-radius:12px;padding:10px 8px;text-align:center;display:flex;flex-direction:column;align-items:center}
.vt-tal span{font-size:18px}.vt-tal b{font-size:16px;font-weight:900;margin-top:2px;color:#1d2a30}.vt-tal small{font-size:11.5px;color:#6b7a80}
.vt-bus{margin-top:12px;border-radius:14px;background:color-mix(in srgb,var(--c-accent) 8%,#fff);border:1px solid color-mix(in srgb,var(--c-accent) 25%,#fff);padding:12px 13px}
.vt-bus-h{font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--c-accent)}
.vt-bus p{margin:4px 0 10px;font-size:14px;line-height:1.4;color:#33474d}
.vt-knap{display:block;text-align:center;border-radius:999px;background:var(--c-accent);color:#fff;font-weight:800;padding:11px;font-size:15px;text-decoration:none}
.vt-lille{margin:10px 2px 0;text-align:center;font-size:11.5px;color:#8a979c}
@media (max-height:500px) and (min-width:500px){.vt-ark{zoom:var(--ui-zoom,.72)}}
`;
