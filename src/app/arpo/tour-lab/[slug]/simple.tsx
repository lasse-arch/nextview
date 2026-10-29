"use client";

import { useT } from "../tours/i18n-react";
import { isInTourHref, isPlaceHref } from "../tours/places";
import type { TourConfig, WelcomeGo } from "../tours/types";

/*
 * The "Helt enkel" design: for visitors who need it calm and plain (e.g. a
 * special efterskole). The welcome is a few big buttons, one below the other
 * - no tiles, badges or small print. The menu is one button that opens one
 * list of big buttons: no side panels, no sub-menus, nothing that opens on
 * top of something else.
 */

export function SimpleWelcome({ T, onChoose }: { T: TourConfig; onChoose: (go: WelcomeGo | "skip", label: string) => void }) {
  const w = T.welcome!;
  return (
    <div className="sp-wel" role="dialog" aria-modal="true" aria-label={w.title}>
      <div className="sp-wel-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={T.logo} alt={T.brand} className="sp-wel-logo" />
        <h1>{w.title}</h1>
        {w.lead && <p>{w.lead}</p>}
        <div className="sp-list">
          {w.tiles.map((t, i) => (
            <button key={t.title} type="button" className={`sp-btn ${i === 0 ? "sp-main" : ""}`} onClick={() => onChoose(t.go, t.title)}>
              {t.title}
            </button>
          ))}
          <button type="button" className="sp-btn sp-quiet" onClick={() => onChoose("skip", w.skip)}>
            {w.skip}
          </button>
        </div>
      </div>
    </div>
  );
}

export function SimpleMenu({
  T,
  open,
  setOpen,
  room,
  hasGuide,
  onGuide,
  onDay,
  onGo,
}: {
  T: TourConfig;
  open: boolean;
  setOpen: (open: boolean) => void;
  room: string | null;
  hasGuide: boolean;
  onGuide: () => void;
  onDay: () => void;
  /** A place in the tour or a link out (the engine's menuGo). */
  onGo: (name: string, group: string, href: string) => void;
}) {
  const tr = useT();
  const go = (name: string, group: string, href: string) => {
    setOpen(false);
    onGo(name, group, href);
  };
  const item = (name: string, group: string, href: string) => {
    const here = isPlaceHref(href) && room === name;
    return (
      <button key={group + name} type="button" className={`sp-btn ${here ? "sp-here" : ""} ${isInTourHref(href) ? "" : "sp-out"}`} onClick={() => go(name, group, href)}>
        {name}
        {here && <small>{tr("Du er her")}</small>}
        {!isInTourHref(href) && <span aria-hidden>↗</span>}
      </button>
    );
  };
  return (
    <>
      {!open && (
        <button type="button" className="sp-menuknap" onClick={() => setOpen(true)}>
          Menu
        </button>
      )}
      {open && (
        <div className="sp-menu" role="dialog" aria-modal="true" aria-label={tr("Menu")}>
          <div className="sp-menu-top">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={T.logo} alt={T.brand} />
            <button type="button" className="sp-luk" onClick={() => setOpen(false)}>
              Luk
            </button>
          </div>
          <div className="sp-list sp-menu-list">
            {hasGuide && (
              <button type="button" className="sp-btn sp-main" onClick={() => (setOpen(false), onGuide())}>
                Start rundturen
              </button>
            )}
            {T.day && (
              <button type="button" className="sp-btn" onClick={() => (setOpen(false), onDay())}>
                {T.day.title}
              </button>
            )}
            {T.menu.filter((m) => !("items" in m) || m.items.length > 0).map((m) =>
              "href" in m ? (
                item(m.title, "", m.href)
              ) : (
                <div key={m.title} className="sp-group">
                  <div className="sp-group-title">{m.title}</div>
                  {m.items.map(([name, href]) => item(name, m.title, href))}
                </div>
              )
            )}
          </div>
        </div>
      )}
    </>
  );
}

export const SIMPLE_CSS = `
.sp-wel{position:absolute;inset:0;z-index:40;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(10,14,16,.55);animation:hvFade .3s ease}
.sp-wel-card{width:min(440px,100%);max-height:100%;overflow-y:auto;padding:28px 24px 22px;border-radius:26px;background:#fff;color:#1d2a30;text-align:center;box-shadow:0 24px 70px rgba(0,0,0,.4);animation:hvUp .4s cubic-bezier(.2,.7,.2,1) both}
.sp-wel-logo{height:64px;width:auto;max-width:70%;object-fit:contain;margin:0 auto 14px}
.sp-wel h1{margin:0 0 8px;font-family:var(--font-heading);font-size:28px;line-height:1.15;font-weight:800;color:var(--c-main)}
.sp-wel p{margin:0 0 20px;font-size:17px;line-height:1.5;color:#3d4a50}
.sp-list{display:flex;flex-direction:column;gap:10px}
.sp-btn{position:relative;display:flex;align-items:center;justify-content:center;gap:8px;min-height:58px;padding:14px 20px;border:2px solid #e3e6e8;border-radius:18px;background:#fff;color:var(--c-main);font:inherit;font-weight:800;font-size:18px;cursor:pointer;text-align:center}
.sp-btn:active{transform:scale(.98)}
.sp-main{border-color:var(--c-accent);background:var(--c-accent);color:#fff}
.sp-quiet{min-height:48px;border-color:transparent;background:none;color:#56636a;font-weight:700;font-size:16px}
.sp-out span{font-size:15px;opacity:.6}
.sp-here{border-color:var(--c-main)}
.sp-here small{position:absolute;right:16px;font-size:12px;font-weight:700;color:#7a8589}
.sp-menuknap{position:absolute;top:calc(14px + env(safe-area-inset-top,0px));right:14px;z-index:9;min-width:96px;height:52px;padding:0 24px;border:0;border-radius:999px;background:var(--c-main);color:#fff;font:inherit;font-weight:800;font-size:18px;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.3)}
.sp-menu{position:absolute;inset:0;z-index:30;display:flex;flex-direction:column;background:#fff;color:#1d2a30;animation:hvFade .2s ease}
.sp-menu-top{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-bottom:1px solid #eef0f1}
.sp-menu-top img{height:44px;width:auto;max-width:55%;object-fit:contain}
.sp-luk{height:52px;padding:0 24px;border:0;border-radius:999px;background:#eef1f2;color:var(--c-main);font:inherit;font-weight:800;font-size:18px;cursor:pointer}
.sp-menu-list{flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;touch-action:pan-y;width:min(520px,100%);margin:0 auto;padding:18px 16px calc(24px + env(safe-area-inset-bottom,0px))}
.sp-group{display:flex;flex-direction:column;gap:10px;margin-top:10px}
.sp-group-title{margin:4px 4px -2px;font-size:14px;font-weight:800;color:#7a8589}
.hv:has(.sp-menu) .hv-logo{display:none}
@media (max-width:760px){
  .sp-menuknap{top:calc(12px + env(safe-area-inset-top,0px));right:10px}
  .sp-wel h1{font-size:25px}
  .sp-wel p{font-size:16px}
}
`;
