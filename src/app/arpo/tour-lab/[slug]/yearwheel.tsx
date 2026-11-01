"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { YearWheel as Wheel } from "../tours/types";
import { useT } from "../tours/i18n-react";
import { safeHref } from "../tours/safe";

/*
 * "Et år på …": the school year as a wheel. It turns by itself month by month
 * (like the film schools use), the month's events come in as cards - and the
 * visitor can tap a month to go there, or a card to open its picture or
 * link. Plain HTML/SVG: nothing to download but the cards' pictures, which
 * load as their month comes up. Used full screen ("#aarshjul") and on a
 * screen in the tour (virtual staging), where `compact` makes it a fixed
 * 16:9 picture.
 */

const NAMES: Record<string, string[]> = {
  da: ["januar", "februar", "marts", "april", "maj", "juni", "juli", "august", "september", "oktober", "november", "december"],
};
function monthNames(lang: string): string[] {
  if (NAMES[lang]) return NAMES[lang];
  try {
    return Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat(lang, { month: "long" }).format(new Date(2026, i, 15)));
  } catch {
    return NAMES.da;
  }
}

export function YearWheelView({
  wheel,
  lang = "da",
  compact = false,
  onLink,
  onClose,
}: {
  wheel: Wheel;
  lang?: string;
  /** On a screen in the tour: a fixed 16:9 picture, no close button. */
  compact?: boolean;
  onLink: (label: string, href: string) => void;
  onClose?: () => void;
}) {
  const tr = useT();
  const names = monthNames(lang);
  const start = Math.min(12, Math.max(1, wheel.startMonth ?? 8));
  // The year in order from the start month: the twelve months, each with its events.
  const year = useMemo(
    () => Array.from({ length: 12 }, (_, i) => ((start - 1 + i) % 12) + 1).map((m) => ({ month: m, events: wheel.months.find((x) => x.month === m)?.events ?? [] })),
    [start, wheel.months]
  );
  // The steps it plays: the opening, every month with something in it, and the end (when there's a call to action).
  const steps = useMemo(() => ["intro", ...year.filter((y) => y.events.length).map((y) => y.month), ...(wheel.cta ? ["cta"] : [])] as (number | "intro" | "cta")[], [year, wheel.cta]);
  const [at, setAt] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [big, setBig] = useState<{ image: string; title: string } | null>(null);
  const step = steps[Math.min(at, steps.length - 1)];
  const month = typeof step === "number" ? step : step === "cta" ? year[11].month : start;
  const seconds = Math.min(15, Math.max(2, wheel.seconds ?? 4));

  // Plays by itself; a tap anywhere pauses it, and it goes on again after a while without one.
  useEffect(() => {
    if (!playing || steps.length < 2) return;
    const t = window.setTimeout(() => setAt((a) => (a + 1) % steps.length), (step === "intro" ? 3 : seconds) * 1000);
    return () => window.clearTimeout(t);
  }, [playing, at, steps.length, seconds, step]);
  const idle = useRef(0);
  const touch = () => {
    setPlaying(false);
    window.clearTimeout(idle.current);
    idle.current = window.setTimeout(() => setPlaying(true), 20_000);
  };
  useEffect(() => () => window.clearTimeout(idle.current), []);

  // The wheel turns so the month is at the top - always the short way round.
  const index = year.findIndex((y) => y.month === month);
  const [turn, setTurn] = useState({ index, rot: -index * 30 });
  if (turn.index !== index) {
    const delta = ((((-index * 30 - turn.rot) % 360) + 540) % 360) - 180;
    setTurn({ index, rot: turn.rot + delta });
  }
  const rot = turn.index === index ? turn.rot : turn.rot + (((((-index * 30 - turn.rot) % 360) + 540) % 360) - 180);

  const events = typeof step === "number" ? (year.find((y) => y.month === step)?.events ?? []) : [];
  const go = (href: string | undefined, label: string) => {
    const h = safeHref(href);
    if (h) onLink(label, h);
  };

  const R = 150;
  const seg = (i: number) => {
    const a0 = ((i * 30 - 15 - 90) * Math.PI) / 180;
    const a1 = ((i * 30 + 15 - 90) * Math.PI) / 180;
    const r0 = 98;
    const p = (r: number, a: number) => `${200 + r * Math.cos(a)} ${200 + r * Math.sin(a)}`;
    return `M ${p(R, a0)} A ${R} ${R} 0 0 1 ${p(R, a1)} L ${p(r0, a1)} A ${r0} ${r0} 0 0 0 ${p(r0, a0)} Z`;
  };

  return (
    <div className={`yw ${compact ? "yw-compact" : ""}`} onPointerDown={touch}>
      {!compact && onClose && (
        <button type="button" className="yw-luk" aria-label={tr("Luk")} onClick={onClose}>
          ×
        </button>
      )}
      {step === "intro" ? (
        <div className="yw-intro" style={wheel.image ? { backgroundImage: `linear-gradient(90deg, rgba(0,0,0,.55), rgba(0,0,0,.05)), url("${encodeURI(wheel.image)}")` } : undefined}>
          <h2>{wheel.title}</h2>
          <button type="button" className="yw-start" onClick={() => setAt(1)}>
            {tr("Se året")} →
          </button>
        </div>
      ) : step === "cta" && wheel.cta ? (
        <div className="yw-cta">
          <h2>{wheel.cta.title}</h2>
          <button type="button" onClick={() => go(wheel.cta!.href, wheel.cta!.label)}>
            {wheel.cta.label}
          </button>
          <button type="button" className="yw-igen" onClick={() => setAt(1)}>
            ↺ {tr("Se året igen")}
          </button>
        </div>
      ) : (
        <div className="yw-main">
          <div className="yw-hjul">
            <svg viewBox="0 0 400 400" role="group" aria-label={tr("Årshjul")}>
              <g style={{ transform: `rotate(${rot}deg)`, transformOrigin: "200px 200px", transition: "transform .9s cubic-bezier(.3,.7,.2,1)" }}>
                {year.map((y, i) => (
                  <g
                    key={y.month}
                    className={`yw-seg ${y.month === month ? "on" : ""} ${y.events.length ? "har" : ""}`}
                    onClick={() => {
                      touch();
                      const s = steps.indexOf(y.month);
                      if (s >= 0) setAt(s);
                    }}
                  >
                    <path d={seg(i)} />
                    <text x={200} y={200 - 124} transform={`rotate(${i * 30} 200 200)${upsideDown(i * 30 + rot) ? " rotate(180 200 76)" : ""}`} textAnchor="middle" dominantBaseline="middle">
                      {names[y.month - 1].slice(0, 3)}
                    </text>
                  </g>
                ))}
              </g>
              <circle cx="200" cy="200" r="92" className="yw-midte" />
              <text x="200" y="200" textAnchor="middle" dominantBaseline="middle" className="yw-maaned">
                {names[month - 1]}
              </text>
              <path d="M 192 36 L 208 36 L 200 48 Z" className="yw-pil" />
            </svg>
            {wheel.subtitle && <p className="yw-sub">{wheel.subtitle}</p>}
          </div>
          <div className="yw-kort" key={String(step)}>
            {events.map((e, i) => (
              <button
                type="button"
                key={e.title + i}
                className="yw-event"
                style={{ animationDelay: `${i * 0.15}s` }}
                onClick={() => {
                  touch();
                  if (e.href) go(e.href, e.title);
                  else if (e.image) setBig({ image: e.image, title: e.title });
                }}
              >
                {e.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={e.image} alt="" loading="lazy" decoding="async" />
                )}
                <b>{e.title}</b>
                {e.text && <span>{e.text}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="yw-prik" aria-hidden>
        {steps.map((s, i) => (
          <i key={String(s)} className={i === at ? "on" : ""} />
        ))}
      </div>
      {big && (
        <button type="button" className="yw-stor" onClick={() => setBig(null)} aria-label={tr("Luk")}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={big.image} alt={big.title} />
          <b>{big.title}</b>
        </button>
      )}
    </div>
  );
}

/** "#aarshjul": the year wheel full screen over the tour. */
/** A month name on the lower half of the wheel is turned, so it never reads upside down. */
function upsideDown(deg: number): boolean {
  const a = ((deg % 360) + 360) % 360;
  return a > 90 && a < 270;
}

export function YearWheelPanel({ wheel, lang, onLink, onClose }: { wheel: Wheel; lang?: string; onLink: (label: string, href: string) => void; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="yw-panel" role="dialog" aria-modal="true" aria-label={wheel.title}>
      <YearWheelView wheel={wheel} lang={lang} onLink={onLink} onClose={onClose} />
    </div>
  );
}

export const YEARWHEEL_CSS = `
.yw-panel{position:absolute;inset:0;z-index:40;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(0,0,0,.45);animation:hvIn .3s ease both}
.yw{position:relative;width:min(1100px,100%);aspect-ratio:16/9;max-height:100%;border-radius:20px;overflow:hidden;background:color-mix(in srgb,var(--c-accent) 7%,#fff);color:var(--c-main);font-family:inherit;user-select:none}
.yw-compact{width:1600px;height:900px;aspect-ratio:auto;border-radius:0;max-height:none}
.yw-luk{position:absolute;top:14px;right:14px;z-index:3;width:38px;height:38px;border:0;border-radius:50%;background:rgba(255,255,255,.9);font-size:22px;cursor:pointer}
.yw-intro{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:flex-end;gap:18px;padding:6%;background:var(--c-main) center/cover no-repeat;color:#fff}
.yw-intro h2,.yw-cta h2{margin:0;font-family:var(--font-heading);font-size:clamp(28px,5.4vw,64px);font-weight:800;line-height:1.02;max-width:12em;white-space:pre-line}
.yw-start{align-self:flex-start;border:0;border-radius:999px;padding:12px 22px;background:#fff;color:var(--c-main);font:inherit;font-weight:800;font-size:16px;cursor:pointer}
.yw-cta{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:6%;text-align:center;background:var(--c-accent);color:#fff}
.yw-cta button{border:0;border-radius:999px;padding:13px 24px;background:#fff;color:var(--c-accent);font:inherit;font-weight:800;font-size:17px;cursor:pointer}
.yw-cta .yw-igen{background:none;color:#fff;font-weight:700;font-size:14px;opacity:.85}
.yw-main{position:absolute;inset:0;display:grid;grid-template-columns:44% 1fr;align-items:center;gap:3%;padding:3% 4%}
.yw-hjul svg{width:100%;height:auto;display:block}
.yw-seg path{fill:color-mix(in srgb,var(--c-accent) 14%,#fff);stroke:#fff;stroke-width:3;cursor:pointer;transition:fill .4s}
.yw-seg.har path{fill:color-mix(in srgb,var(--c-accent) 28%,#fff)}
.yw-seg.on path{fill:var(--c-accent)}
.yw-seg text{font-size:13px;font-weight:700;fill:color-mix(in srgb,var(--c-main) 70%,transparent);pointer-events:none}
.yw-seg.on text{fill:#fff}
.yw-midte{fill:#fff;filter:drop-shadow(0 6px 18px rgba(0,0,0,.12))}
.yw-maaned{font-family:var(--font-heading);font-size:34px;font-weight:800;fill:var(--c-main)}
.yw-sub{margin:10px 0 0;text-align:center;font-size:15px;font-weight:700;color:var(--c-accent)}
.yw-compact .yw-sub{font-size:34px}
.yw-pil{fill:var(--c-accent)}
.yw-kort{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;align-content:center}
.yw-event{display:flex;flex-direction:column;gap:4px;padding:8px 8px 12px;border:0;border-radius:14px;background:#fff;text-align:left;font:inherit;color:inherit;box-shadow:0 8px 24px rgba(0,0,0,.1);cursor:pointer;animation:ywInd .55s cubic-bezier(.2,.7,.2,1) both}
.yw-event img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:9px;margin-bottom:4px;background:#eee}
.yw-event b{font-size:16px;font-weight:800;padding:0 4px}
.yw-event span{font-size:13px;line-height:1.35;color:#55636a;padding:0 4px}
@keyframes ywInd{from{opacity:0;transform:translateY(14px) scale(.97)}to{opacity:1;transform:none}}
.yw-prik{position:absolute;left:0;right:0;bottom:12px;display:flex;justify-content:center;gap:6px;pointer-events:none}
.yw-prik i{width:6px;height:6px;border-radius:50%;background:color-mix(in srgb,var(--c-main) 25%,transparent)}
.yw-prik i.on{background:var(--c-accent);width:18px;border-radius:6px}
.yw-stor{position:absolute;inset:0;z-index:4;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;border:0;background:rgba(0,0,0,.82);color:#fff;font:inherit;cursor:zoom-out}
.yw-stor img{max-width:90%;max-height:80%;border-radius:12px}
.yw-compact .yw-maaned{font-size:36px}
@media (max-width:760px){
  .yw-panel{padding:0;align-items:stretch}
  .yw:not(.yw-compact){aspect-ratio:auto;height:100%;border-radius:0}
  .yw:not(.yw-compact) .yw-main{grid-template-columns:1fr;grid-template-rows:auto 1fr;align-items:start;padding:56px 18px 34px;overflow-y:auto}
  .yw:not(.yw-compact) .yw-hjul{width:min(78vw,340px);margin:0 auto}
  .yw:not(.yw-compact) .yw-kort{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
}
`;
