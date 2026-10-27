"use client";

import { useT } from "../tours/i18n-react";
import { useEffect, useRef, useState } from "react";
import type { GuideTurn, TourConfig } from "../tours/types";
import { startPlaces } from "../tours/places";

export type GuideStop = { href: string; title: string; text: string; audio?: string; turn?: GuideTurn };

/** The guided tour's stops, with a drone point's name and text filled in where a stop borrows them - or one per menu place when it's made from the menu. */
export function guideStops(T: TourConfig): GuideStop[] {
  if (T.guide?.fromMenu) {
    const pick = T.guide.menuPlaces;
    return startPlaces(T)
      .filter((p) => !pick || pick.includes(p.key))
      .map((p) => ({ href: p.href, title: p.name, text: p.group ?? "", turn: T.guide?.menuTurns?.[p.key] }));
  }
  return (T.guide?.stops ?? []).flatMap((s) => {
    if (!("point" in s)) return [s];
    const p = T.points.find((x) => x.id === s.point);
    // A point without a room is shown on the drone scene / map itself.
    return p ? [{ href: p.tour ?? `#punkt:${p.id}`, title: p.name, text: p.text }] : [];
  });
}

/**
 * "Vis mig rundt": the caption card and progress bars while the tour flies
 * from stop to stop by itself. Each stop shows for `seconds`, then the next
 * one comes; the visitor can pause, step or stop whenever they like.
 */
export function GuidePlayer({
  stops,
  index,
  seconds,
  manual = false,
  held = false,
  walkHint = false,
  onResume,
  end,
  onGo,
  onClose,
  onEvent,
  stopLabel,
}: {
  /** The stop button's words (default "Gå selv rundt"). */
  stopLabel?: string;
  stops: GuideStop[];
  index: number;
  seconds: number;
  /** No timer - the visitor presses Næste (a calm voice tour). */
  manual?: boolean;
  /** The visitor took over (walked on or looked around) - the guide waits until they press Fortsæt or Næste. */
  held?: boolean;
  /** In the 3D tour: tell the visitor (on the first stops) that they may look around and walk themselves. */
  walkHint?: boolean;
  onResume?: () => void;
  /** Shown on the last stop - the next step for the visitor (e.g. book a visit). */
  end?: React.ReactNode;
  onGo: (index: number) => void;
  onClose: (completed: boolean) => void;
  onEvent: (name: string, params: Record<string, string | number>) => void;
}) {
  const tr = useT();
  const [paused, setPaused] = useState(false);
  const stop = stops[index];
  const hasVoice = stops.some((s) => s.audio);
  const audio = useRef<HTMLAudioElement | null>(null);
  const [muted, setMuted] = useState(() => {
    try {
      return localStorage.getItem("tour-guide-muted") === "1";
    } catch {
      return false;
    }
  });
  // The stop's voice: plays when the stop comes (the visitor started the tour, so sound is allowed).
  useEffect(() => {
    audio.current?.pause();
    if (!stop.audio || muted) return;
    const a = new Audio(stop.audio);
    audio.current = a;
    // Without "Man trykker selv videre", the next stop comes when the voice is done.
    if (!manual) a.onended = () => step(index + 1, "auto");
    a.play().catch(() => {});
    onEvent("guide_audio", { stop: index + 1, title: stop.title });
    return () => a.pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, muted]);
  const timed = !manual && !stop.audio;

  function step(to: number, how: string) {
    if (to >= stops.length) return onClose(true);
    if (to < 0) return;
    onEvent("guide_step", { how, stop: to + 1, title: stops[to].title });
    setPaused(false);
    onGo(to);
  }

  return (
    <div className="gd">
      <div className="gd-bars">
        {stops.map((s, i) => (
          <span key={s.title + i} className={i < index ? "done" : ""}>
            {i === index && timed && (
              <i key={index} style={{ animationDuration: `${seconds}s`, animationPlayState: paused || held ? "paused" : "running" }} onAnimationEnd={() => step(index + 1, "auto")} />
            )}
            {i === index && !timed && <i key={index} className="gd-here" />}
          </span>
        ))}
      </div>
      <div className="gd-card" key={index}>
        <div className="gd-count">
          {index + 1} / {stops.length}
        </div>
        <h3>{stop.title}</h3>
        {stop.text && <p>{stop.text}</p>}
        {held && timed && <div className="gd-next">{tr("På pause - du kigger selv rundt")}</div>}
        {walkHint && !held && index < 2 && (
          <div className="gd-selv">
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11m0-1.5a1.5 1.5 0 0 1 3 0V11m0-.5a1.5 1.5 0 0 1 3 0v4a6 6 0 0 1-6 6h-.6a6 6 0 0 1-4.6-2.2L4.6 15a1.5 1.5 0 0 1 2.3-1.9L9 15" />
              <path d="M3 5h3M3 5l1.5-1.5M3 5l1.5 1.5M21 5h-3m3 0-1.5-1.5M21 5l-1.5 1.5" />
            </svg>
            {tr("Træk i billedet for at se dig omkring, og tryk for at gå - guiden venter på dig.")}
          </div>
        )}
        {index < stops.length - 1 ? <div className="gd-next">{tr("Næste: {sted}", { sted: stops[index + 1].title })}</div> : end && <div className="gd-end">{end}</div>}
        <div className="gd-ctrl">
          <button type="button" aria-label={tr("Forrige")} disabled={index === 0} onClick={() => step(index - 1, "back")}>
            ‹
          </button>
          {timed ? (
            <>
              <button
                type="button"
                className="gd-play"
                onClick={() => {
                  if (held) return onResume?.();
                  setPaused((p) => !p);
                }}
              >
                {paused || held ? "▶ Fortsæt" : "❚❚ Pause"}
              </button>
              <button type="button" aria-label={tr("Næste")} onClick={() => step(index + 1, "next")}>
                ›
              </button>
            </>
          ) : (
            <>
              <button type="button" className="gd-play" onClick={() => step(index + 1, "next")}>
                {index === stops.length - 1 ? tr("Afslut") : tr("Næste ›")}
              </button>
              {stop.audio && !muted && (
                <button
                  type="button"
                  aria-label={tr("Hør igen")}
                  title={tr("Hør igen")}
                  onClick={() => {
                    if (!audio.current) return;
                    audio.current.currentTime = 0;
                    audio.current.play().catch(() => {});
                    onEvent("guide_replay", { stop: index + 1 });
                  }}
                >
                  ↺
                </button>
              )}
            </>
          )}
          {hasVoice && (
            <button
              type="button"
              className="gd-sound"
              aria-label={muted ? tr("Slå lyd til") : tr("Slå lyd fra")}
              onClick={() => {
                const next = !muted;
                setMuted(next);
                onEvent("guide_sound", { on: next ? 0 : 1 });
                try {
                  localStorage.setItem("tour-guide-muted", next ? "1" : "0");
                } catch {}
              }}
            >
              {muted ? "🔇" : "🔊"}
            </button>
          )}
          <button type="button" className="gd-stop" onClick={() => onClose(false)}>
            {stopLabel ?? tr("Gå selv rundt")}
          </button>
        </div>
      </div>
    </div>
  );
}

export const GUIDE_CSS = `
.gd-bars .gd-here{animation:none!important;width:100%;opacity:.55}
.gd-sound{width:36px;border:0;border-radius:50%;background:rgba(0,0,0,.06);font-size:16px;cursor:pointer}
.gd{position:absolute;inset:0;z-index:11;pointer-events:none}
.gd>*{pointer-events:auto}
.gd-bars{position:absolute;top:calc(10px + env(safe-area-inset-top,0px));left:50%;translate:-50% 0;width:min(560px,calc(100% - 200px));display:flex;gap:4px}
.gd-bars span{flex:1;height:3px;border-radius:2px;background:rgba(255,255,255,.4);overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.3)}
.gd-bars span.done{background:#fff}
.gd-bars i{display:block;height:100%;background:#fff;transform-origin:left;animation:hvStoryGuide linear forwards}
@keyframes hvStoryGuide{from{transform:scaleX(0)}to{transform:scaleX(1)}}
.gd-card{position:absolute;left:24px;bottom:24px;width:min(400px,calc(100% - 48px));padding:18px 20px 14px;border-radius:18px;background:rgba(255,255,255,.96);color:#1d2a30;box-shadow:0 16px 44px rgba(0,0,0,.32);animation:hvUp .45s cubic-bezier(.2,.7,.2,1) both}
.gd-count{font-size:11px;font-weight:800;letter-spacing:.14em;color:var(--c-accent)}
.gd-card h3{margin:4px 0 6px;font-family:var(--font-heading);font-size:24px;line-height:1.1;font-weight:800;color:var(--c-main)}
.gd-card p{margin:0 0 14px;font-size:15px;line-height:1.5;color:#3d4a50}
.gd-next{margin:-6px 0 12px;font-size:12.5px;font-weight:700;color:#7a8589}
.gd-end{margin:-4px 0 12px}
.gd-selv{display:flex;align-items:center;gap:8px;margin:-4px 0 12px;font-size:12.5px;line-height:1.35;font-weight:600;color:#56636a}
.gd-selv svg{flex:none;width:22px;height:22px;fill:none;stroke:var(--c-accent);stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;animation:gdSelv 2.4s ease-in-out infinite}
@keyframes gdSelv{0%,100%{transform:translateX(-3px)}50%{transform:translateX(3px)}}
.gd-end .hv-btn{display:inline-flex;padding:10px 16px;font-size:14px}
.gd-ctrl{display:flex;align-items:center;gap:6px}
.gd-ctrl button{height:36px;min-width:36px;border:0;border-radius:999px;background:#eef1f2;color:var(--c-main);font:inherit;font-weight:800;font-size:15px;cursor:pointer;padding:0 12px}
.gd-ctrl button:disabled{opacity:.35;cursor:default}
.gd-ctrl .gd-play{background:var(--c-main);color:#fff;font-size:13px}
.gd-ctrl .gd-stop{margin-left:auto;background:none;font-size:13px;font-weight:700;color:#56636a;padding:0 4px}
.hv-guide-knap{display:flex;align-items:center;gap:10px;width:calc(100% - 44px);margin:14px 22px 4px;padding:12px 16px;border:0;border-radius:14px;background:var(--c-accent);color:#fff;font:inherit;font-weight:800;font-size:15px;cursor:pointer;text-align:left}
.hv-guide-knap small{display:block;font-weight:600;font-size:12px;opacity:.85}
.hv-wel-guide{display:inline-flex;align-items:center;gap:8px;align-self:flex-start;margin-top:14px;border:0;border-radius:999px;background:var(--c-main);color:#fff;padding:11px 18px;font:inherit;font-weight:800;font-size:14px;cursor:pointer}
.hv-guiding .hv-room,.hv-guiding .hv-stories,.hv-guiding .hv-luften,.hv-guiding .dz-dock,.hv-guiding .dz-here,.hv-guiding .hv-intro,.hv-guiding .hv-filtre{display:none}
@media (max-width:760px){
  .hv-guiding .hv-logo{display:none}
  .gd-bars{width:calc(100% - 120px);left:12px;translate:none}
  .gd-card{left:10px;right:10px;width:auto;bottom:calc(10px + env(safe-area-inset-bottom,0px));padding:14px 16px 12px}
  .gd-card h3{font-size:20px}
  .gd-card p{font-size:14px;margin-bottom:10px}
}
`;
