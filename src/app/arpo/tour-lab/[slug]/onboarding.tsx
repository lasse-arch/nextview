"use client";

import { useEffect, useRef } from "react";
import { useT } from "../tours/i18n-react";

/**
 * "Sådan bruger du touren": a short help the moment the visitor steps inside
 * (Træd indenfor) - drag to look around, tap to walk, the menu to jump - so
 * the tour never feels dead or confusing. Shown once per visitor (switched
 * on under Funktioner); it goes by itself after a while or with Forstået.
 */
export function Onboarding({ hasMenu, onGuide, onDone }: { hasMenu: boolean; onGuide?: () => void; onDone: () => void }) {
  const tr = useT();
  // Goes by itself after a while - one timer, however often the tour around it draws again.
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    const t = setTimeout(() => done.current(), 12_000);
    return () => clearTimeout(t);
  }, []);
  const tips: [string, string][] = [
    ['<path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11m0-1.5a1.5 1.5 0 0 1 3 0V11m0-.5a1.5 1.5 0 0 1 3 0v4a6 6 0 0 1-6 6h-.6a6 6 0 0 1-4.6-2.2L4.6 15a1.5 1.5 0 0 1 2.3-1.9L9 15"/><path d="M3 5h3M3 5l1.5-1.5M3 5l1.5 1.5M21 5h-3m3 0-1.5-1.5M21 5l-1.5 1.5"/>', tr("Træk i billedet for at se dig omkring")],
    ['<circle cx="12" cy="16" r="5"/><ellipse cx="12" cy="16" rx="8" ry="3" opacity=".5"/><path d="M12 3v6M9.5 6.5 12 9l2.5-2.5"/>', tr("Tryk på de hvide cirkler for at gå hen til dem")],
    ...(hasMenu ? [['<path d="M4 6h16M4 12h16M4 18h10"/>', tr("Åbn menuen for at hoppe direkte til et sted")] as [string, string]] : []),
  ];
  return (
    <div className="ob" onClick={onDone}>
      <div className="ob-kort" onClick={(e) => e.stopPropagation()}>
        <h3>{tr("Sådan går du rundt")}</h3>
        <ul>
          {tips.map(([icon, text], i) => (
            <li key={text} style={{ animationDelay: `${0.15 + i * 0.12}s` }}>
              <svg viewBox="0 0 24 24" aria-hidden className={i === 0 ? "ob-traek" : ""} dangerouslySetInnerHTML={{ __html: icon }} />
              {text}
            </li>
          ))}
        </ul>
        <div className="ob-knapper">
          {onGuide && (
            <button type="button" className="hv-btn hv-secondary" onClick={() => (onDone(), onGuide())}>
              ▶ {tr("Vis mig rundt")}
            </button>
          )}
          <button type="button" className="hv-btn hv-primary" onClick={onDone}>
            {tr("Forstået")}
          </button>
        </div>
      </div>
    </div>
  );
}

export const ONBOARDING_CSS = `
.ob{position:absolute;inset:0;z-index:13;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(8,14,16,.28);animation:hvFade .35s ease}
.ob-kort{width:min(380px,100%);padding:20px 22px 18px;border-radius:20px;background:rgba(255,255,255,.97);color:#1d2a30;box-shadow:0 24px 60px rgba(0,0,0,.35);animation:hvUp .45s cubic-bezier(.2,.7,.2,1) both}
.ob-kort h3{margin:0 0 12px;font-family:var(--font-heading);font-size:22px;font-weight:800;color:var(--c-main)}
.ob-kort ul{list-style:none;margin:0 0 16px;padding:0;display:flex;flex-direction:column;gap:12px}
.ob-kort li{display:flex;align-items:center;gap:12px;font-size:15px;line-height:1.35;font-weight:600;animation:hvUp .45s cubic-bezier(.2,.7,.2,1) both}
.ob-kort svg{flex:none;width:34px;height:34px;padding:6px;border-radius:12px;background:color-mix(in srgb,var(--c-accent) 14%,#fff);fill:none;stroke:var(--c-accent);stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.ob-traek{animation:obTraek 2.2s ease-in-out infinite}
@keyframes obTraek{0%,100%{transform:translateX(-3px)}50%{transform:translateX(3px)}}
.ob-knapper{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
.ob-knapper .hv-btn{padding:10px 16px;font-size:14px}
`;
