"use client";

import { useEffect, useState } from "react";
import { useLang, useT } from "../tours/i18n-react";
import { iEllerPaa } from "../tours/i18n";
import { apiUrl } from "../tours/api";

/*
 * "Vejret i Hals": a small chip on the drone scene with the weather right now
 * (DMI). A tap opens a card with today (sunrise, sunset, wind) and the
 * months - pick one and see what it's typically like there (temperature, the
 * warmest day, sunshine, rain): for visitors planning when to come.
 */

type Now = { temp: number; wind: number; sky: "sol" | "klart" | "let-skyet" | "skyet" | "regn"; sunrise: string | null; sunset: string | null };
type Month = { temp: number; warmest: number; sun: number; rain: number; wind: number };
type Data = { place: string; now: Now | null; months: Month[] | null };

const SKY: Record<Now["sky"], { label: string; icon: string }> = {
  sol: { label: "Sol", icon: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>' },
  klart: { label: "Klart", icon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>' },
  "let-skyet": { label: "Let skyet", icon: '<path d="M8.5 5.2a3.6 3.6 0 0 1 5.8 1.6"/><path d="M5 9.2l1-.6M8.5 2.8v1.4M3.6 5.6l1.2.6"/><path d="M7.5 19h9.3a3.7 3.7 0 0 0 .3-7.4 5 5 0 0 0-9.6 1.1A3.2 3.2 0 0 0 7.5 19z"/>' },
  skyet: { label: "Skyet", icon: '<path d="M6.8 18.5h10.4a4 4 0 0 0 .4-8 5.6 5.6 0 0 0-10.8 1.3 3.4 3.4 0 0 0 0 6.7z"/>' },
  regn: { label: "Regn", icon: '<path d="M6.8 15h10.4a4 4 0 0 0 .4-8 5.6 5.6 0 0 0-10.8 1.3 3.4 3.4 0 0 0 0 6.7z"/><path d="M8.5 18l-1 2.5M12.5 18l-1 2.5M16.5 18l-1 2.5"/>' },
};
const MONTHS = ["januar", "februar", "marts", "april", "maj", "juni", "juli", "august", "september", "oktober", "november", "december"];

const Icon = ({ d, className }: { d: string; className?: string }) => <svg viewBox="0 0 24 24" aria-hidden className={className} dangerouslySetInnerHTML={{ __html: d }} />;

export function WeatherChip({ slug, at, onOpen }: { slug: string; /** The place as the tour has it now - the editor's preview may not be saved yet. */ at: { lat: number; lon: number; place: string }; onOpen?: () => void }) {
  const tr = useT();
  const lang = useLang();
  const [data, setData] = useState<Data | null>(null);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => new Date().getMonth());

  useEffect(() => {
    let alive = true;
    fetch(apiUrl(`/api/tour-weather/${slug}?${new URLSearchParams({ lat: String(at.lat), lon: String(at.lon), place: at.place })}`))
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Data | null) => alive && d && (d.now || d.months) && setData(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [slug, at.lat, at.lon, at.place]);

  if (!data) return null;
  const { now, months, place } = data;
  // "Vejret i Hals", "Vejret på Hals Strand Camping" - the engine picks the word in Danish; other languages say it their way.
  const weatherIn = lang === "da" ? `Vejret ${iEllerPaa(place)} ${place}` : `${tr("Vejret i")} ${place}`;
  const m = months?.[month];
  const top = months ? Math.max(...months.map((x) => x.temp), 1) : 1;
  const low = months ? Math.min(...months.map((x) => x.temp), 0) : 0;

  return (
    <>
      <button
        type="button"
        className="vj-chip"
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
          if (!open) onOpen?.();
        }}
      >
        {now ? (
          <>
            <Icon d={SKY[now.sky].icon} />
            <b>{now.temp}°</b>
            <span>{place}</span>
          </>
        ) : (
          <>
            <Icon d={SKY["let-skyet"].icon} />
            <span>{weatherIn}</span>
          </>
        )}
      </button>

      {open && (
        <div className="vj-kort" role="dialog" aria-label={weatherIn}>
          <button type="button" className="vj-luk" aria-label={tr("Luk")} onClick={() => setOpen(false)}>
            ×
          </button>
          <div className="vj-t">{weatherIn}</div>

          {now && (
            <div className="vj-nu">
              <Icon d={SKY[now.sky].icon} className="vj-stor" />
              <div>
                <div className="vj-grad">{now.temp}°</div>
                <div className="vj-lille">{tr(SKY[now.sky].label)} · {tr("vind")} {now.wind} m/s</div>
              </div>
              {(now.sunrise || now.sunset) && (
                <div className="vj-sol">
                  {now.sunrise && <div>{tr("Solopgang")} <b>{now.sunrise}</b></div>}
                  {now.sunset && <div>{tr("Solnedgang")} <b>{now.sunset}</b></div>}
                </div>
              )}
            </div>
          )}

          {months && m && (
            <>
              <div className="vj-st">{tr("Vælg en måned")}</div>
              <div className="vj-maaneder" role="radiogroup" aria-label={tr("Måned")}>
                {months.map((x, i) => {
                  const h = 14 + ((x.temp - low) / Math.max(top - low, 1)) * 50;
                  return (
                    <button
                      key={i}
                      type="button"
                      role="radio"
                      aria-checked={i === month}
                      aria-label={`${tr(MONTHS[i])}: ${Math.round(x.temp)}°`}
                      title={`${tr(MONTHS[i])}: ${Math.round(x.temp)}°`}
                      className={i === month ? "valgt" : ""}
                      onClick={() => setMonth(i)}
                    >
                      <i style={{ height: `${h}px` }} />
                      <span>{tr(MONTHS[i]).slice(0, 3)}</span>
                    </button>
                  );
                })}
              </div>
              <div className="vj-maaned">
                <div className="vj-mt">{tr("Typisk i")} {tr(MONTHS[month])}</div>
                <dl>
                  <div><dt>{tr("Temperatur")}</dt><dd>{Math.round(m.temp)}°</dd><small>{tr("varmeste dag ca.")} {m.warmest}°</small></div>
                  <div><dt>{tr("Sol")}</dt><dd>{m.sun} t</dd><small>{tr("ca.")} {Math.round(m.sun / 30)} {tr("timer om dagen")}</small></div>
                  <div><dt>{tr("Regn")}</dt><dd>{m.rain} mm</dd><small>{tr("i hele måneden")}</small></div>
                  <div><dt>{tr("Vind")}</dt><dd>{m.wind} m/s</dd><small>{m.wind <= 4 ? tr("roligt") : m.wind <= 6 ? tr("en frisk brise") : tr("blæsende")}</small></div>
                </dl>
              </div>
              <p className="vj-kilde">{tr("Gennemsnit af de sidste 10 år. Kilde: DMI")}</p>
            </>
          )}
        </div>
      )}
    </>
  );
}

export const WEATHER_CSS = `
.vj-chip{position:absolute;right:16px;bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:6;display:flex;align-items:center;gap:7px;height:40px;padding:0 14px 0 11px;border:0;border-radius:999px;background:rgba(255,255,255,.94);color:#1d2a30;font:inherit;font-size:14px;box-shadow:0 6px 20px rgba(0,0,0,.25);cursor:pointer;backdrop-filter:blur(8px)}
.vj-chip svg{width:22px;height:22px;fill:none;stroke:#e8a317;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.vj-chip b{font-size:16px;font-weight:800}
.vj-chip span{color:#5c6b72;font-weight:600}
.vj-kort{position:absolute;right:16px;bottom:calc(66px + env(safe-area-inset-bottom,0px));z-index:7;width:340px;max-height:calc(100% - 100px);overflow:auto;background:#fff;color:#1d2a30;border-radius:18px;padding:16px 16px 12px;box-shadow:0 16px 40px rgba(0,0,0,.3);animation:vjInd .25s ease}
@keyframes vjInd{from{opacity:0;translate:0 10px}}
.vj-luk{position:absolute;top:8px;right:10px;width:30px;height:30px;border:0;border-radius:50%;background:#f1f3f4;color:#5c6b72;font-size:20px;line-height:1;cursor:pointer}
.vj-t{font-size:12.5px;font-weight:800;color:#5c6b72;text-transform:uppercase;letter-spacing:.04em}
.vj-nu{display:flex;align-items:center;gap:10px;margin:10px 0 4px}
.vj-stor{width:44px;height:44px;fill:none;stroke:#e8a317;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round;flex:none}
.vj-grad{font-size:30px;font-weight:800;line-height:1}
.vj-lille{font-size:13px;color:#5c6b72;margin-top:3px}
.vj-sol{margin-left:auto;text-align:right;font-size:12px;color:#5c6b72;line-height:1.6}
.vj-sol b{color:#1d2a30}
.vj-st{font-size:13px;font-weight:700;margin:14px 0 6px}
.vj-maaneder{display:grid;grid-template-columns:repeat(12,1fr);gap:3px;align-items:end;height:86px}
.vj-maaneder button{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:4px;height:100%;border:0;background:none;padding:0;cursor:pointer;font:inherit}
.vj-maaneder i{display:block;width:100%;max-width:18px;border-radius:4px 4px 0 0;background:#d9e2e6;transition:background .2s}
.vj-maaneder button:hover i{background:#b9c8ce}
.vj-maaneder .valgt i{background:#e8a317}
.vj-maaneder span{font-size:10px;color:#8a979d;text-transform:capitalize}
.vj-maaneder .valgt span{color:#1d2a30;font-weight:800}
.vj-maaned{margin-top:10px;background:#f5f7f8;border-radius:14px;padding:10px 12px}
.vj-mt{font-size:14px;font-weight:800;margin-bottom:6px}
.vj-maaned dl{display:grid;grid-template-columns:1fr 1fr;gap:8px 12px;margin:0}
.vj-maaned dt{font-size:11.5px;color:#5c6b72}
.vj-maaned dd{margin:0;font-size:18px;font-weight:800}
.vj-maaned small{font-size:11px;color:#8a979d}
.vj-kilde{font-size:10.5px;color:#8a979d;margin:8px 2px 0}
.hv-punkt .vj-chip,.hv-punkt .vj-kort,.hv-welcome .vj-chip,.hv-menu-aaben .vj-chip,.hv-menu-aaben .vj-kort{opacity:0;pointer-events:none}
@media (max-width:760px){
  .vj-chip{right:10px;bottom:calc(var(--filtre-h, 50px) + 18px + env(safe-area-inset-bottom,0px));height:36px;font-size:13px}
  .hv-filter-ud-m .vj-chip{bottom:calc(10px + env(safe-area-inset-bottom,0px))}
  .vj-kort{left:0;right:0;bottom:0;width:auto;max-height:82%;border-radius:20px 20px 0 0;padding-bottom:calc(14px + env(safe-area-inset-bottom,0px));z-index:30}
}
@media (min-width:761px){.hv-filter-ud-d .vj-chip{bottom:16px}}
`;
