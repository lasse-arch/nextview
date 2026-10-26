"use client";

import type { TourConfig } from "../tours/types";

/*
 * "Sådan ser en dag ud": the day as a calm timeline - the time, what happens
 * and a "Se stedet" that shows where it happens. Made for visitors who like
 * to know what's coming (e.g. a special efterskole): no timers, nothing
 * moves by itself, and while looking at a place a small bar says which part
 * of the day it is and what comes next.
 */

type Day = NonNullable<TourConfig["day"]>;

export function DaySheet({ day, at, onSee, onClose }: { day: Day; at: number | null; onSee: (i: number) => void; onClose: () => void }) {
  return (
    <div className="dy" onClick={onClose}>
      <div className="dy-sheet" role="dialog" aria-label={day.title} onClick={(e) => e.stopPropagation()}>
        <div className="dy-head">
          <div>
            <b>{day.title}</b>
            {day.lead && <p>{day.lead}</p>}
          </div>
          <button type="button" aria-label="Luk" onClick={onClose}>
            ×
          </button>
        </div>
        <ol>
          {day.steps.map((s, i) => (
            <li key={s.time + s.title} className={i === at ? "dy-at" : ""}>
              <time>{s.time}</time>
              <i aria-hidden />
              <span>
                <b>{s.title}</b>
                {s.text && <small>{s.text}</small>}
              </span>
              {s.href && (
                <button type="button" className="hv-btn hv-secondary" onClick={() => onSee(i)}>
                  {i === at ? "Her nu" : "Se stedet"}
                </button>
              )}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/** While looking at one part of the day: where in the day you are, and what comes next. */
export function DayBar({ day, at, onNext, onOpen, onClose }: { day: Day; at: number; onNext: (i: number) => void; onOpen: () => void; onClose: () => void }) {
  const step = day.steps[at];
  const next = day.steps.findIndex((s, i) => i > at && s.href);
  return (
    <div className="dy-bar">
      <button type="button" className="dy-bar-now" onClick={onOpen}>
        <time>{step.time}</time>
        <span>
          <b>{step.title}</b>
          <small>Se hele dagen</small>
        </span>
      </button>
      {next > 0 && (
        <button type="button" className="dy-bar-next" onClick={() => onNext(next)}>
          <small>Bagefter · {day.steps[next].time}</small>
          {day.steps[next].title} ›
        </button>
      )}
      <button type="button" className="dy-bar-x" aria-label="Luk dagen" onClick={onClose}>
        ×
      </button>
    </div>
  );
}

export const DAY_CSS = `
.dy{position:absolute;inset:0;z-index:35;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.35);animation:hvFade .2s ease}
.dy-sheet{width:min(560px,100%);max-height:84%;display:flex;flex-direction:column;margin:0 12px 12px;border-radius:22px;background:#fff;color:#1d2a30;box-shadow:0 20px 60px rgba(0,0,0,.4);animation:hvUp .3s cubic-bezier(.2,.7,.2,1) both}
.dy-head{display:flex;align-items:flex-start;gap:12px;padding:18px 20px 8px}
.dy-head b{display:block;font-family:var(--font-heading);font-size:22px;color:var(--c-main)}
.dy-head p{margin:4px 0 0;font-size:14px;line-height:1.45;color:#56636a}
.dy-head button{margin-left:auto;flex:none;width:34px;height:34px;border:0;border-radius:50%;background:#f1f2f3;font-size:20px;cursor:pointer}
.dy-sheet ol{margin:0;padding:6px 14px 14px;list-style:none;overflow-y:auto}
.dy-sheet li{position:relative;display:flex;align-items:center;gap:12px;padding:10px 6px;border-radius:14px}
.dy-sheet li.dy-at{background:var(--c-soft)}
.dy-sheet time{flex:none;width:46px;font-weight:800;font-size:15px;font-variant-numeric:tabular-nums;color:var(--c-main)}
.dy-sheet li>i{position:relative;flex:none;width:12px;height:12px;border-radius:50%;background:var(--c-accent);box-shadow:0 0 0 3px #fff}
.dy-sheet li:not(:last-child)>i:after{content:"";position:absolute;left:5px;top:15px;width:2px;height:34px;background:#e6e3de}
.dy-sheet li>span{flex:1;min-width:0}
.dy-sheet li b{display:block;font-size:16px}
.dy-sheet li small{display:block;margin-top:1px;font-size:13.5px;line-height:1.4;color:#56636a}
.dy-sheet .hv-btn{flex:none;padding:9px 14px;font-size:13px}
.dy-bar{position:absolute;left:16px;bottom:16px;z-index:12;display:flex;align-items:stretch;gap:6px;max-width:calc(100% - 32px);padding:6px;border-radius:18px;background:rgba(255,255,255,.97);color:#1d2a30;box-shadow:0 12px 34px rgba(0,0,0,.3);animation:hvUp .35s cubic-bezier(.2,.7,.2,1) both}
.dy-bar button{border:0;background:none;font:inherit;color:inherit;cursor:pointer;text-align:left;border-radius:13px}
.dy-bar-now{display:flex;align-items:center;gap:10px;padding:6px 10px}
.dy-bar-now:hover,.dy-bar-next:hover{background:#f3f4f5}
.dy-bar time{font-weight:800;font-size:15px;font-variant-numeric:tabular-nums;color:var(--c-accent)}
.dy-bar b{display:block;font-size:15px;color:var(--c-main)}
.dy-bar small{display:block;font-size:12px;font-weight:600;color:#6b7a80}
.dy-bar-next{padding:6px 12px;border-left:1px solid #eceeef!important;border-radius:0 13px 13px 0!important;font-weight:800;font-size:14px;color:var(--c-main)!important}
.dy-bar-x{width:34px;font-size:20px;color:#8a969b!important;text-align:center!important}
.hv-day-knap{display:flex;align-items:center;gap:10px;width:calc(100% - 44px);margin:8px 22px 4px;padding:12px 16px;border:0;border-radius:14px;background:var(--c-soft);color:var(--c-main);font:inherit;font-weight:800;font-size:15px;cursor:pointer;text-align:left}
.hv-day-knap small{display:block;font-weight:600;font-size:12px;opacity:.7}
@media (max-width:760px){
  .dy-sheet{margin:0;border-radius:22px 22px 0 0;max-height:88%;padding-bottom:env(safe-area-inset-bottom,0px)}
  .dy-bar{left:10px;right:10px;bottom:calc(10px + env(safe-area-inset-bottom,0px));max-width:none}
  .dy-bar-now{flex:1;min-width:0}
  .dy-bar-next{max-width:46%}
}
`;
