"use client";

import { useState } from "react";
import type { TourConfig } from "../tours/types";
import { useT } from "../tours/i18n-react";
import { isInTourHref } from "../tours/places";
import { TourLink } from "./links";

/*
 * "Flydende dock": the menu as a small glass pill at the bottom, in the
 * middle - only as wide as its buttons, never the whole screen. The menu's
 * groups (up to four, the rest under "Mere"), "Vis mig rundt" and the main
 * button; a group opens a glass card just above the pill with its places,
 * the room one stands in marked. On a phone: Menu, Vis mig rundt and the main
 * button - the card holds every group.
 */

type Group = { title: string; items: [string, string][] };

const MAX_GROUPS = 4;

const ICON = {
  menu: <path d="M4 7h16M4 12h16M4 17h10" />,
  play: <path d="M8 5v14l11-7z" fill="currentColor" stroke="none" />,
};

export function FloatDock({
  T,
  room,
  hasGuide,
  onGuide,
  onGo,
  onCta,
}: {
  T: TourConfig;
  room: string | null;
  hasGuide: boolean;
  onGuide: () => void;
  onGo: (name: string, group: string, href: string) => void;
  onCta: (label: string, href: string) => void;
}) {
  const tr = useT();
  /** The open card: a group's title, "__alle" (the phone's Menu - every group) or "__mere" (the groups past the fourth). */
  const [open, setOpen] = useState<string | null>(null);
  const entries = T.menu.filter((m) => !("items" in m) || m.items.length > 0);
  // For the card: a group as it is - places straight in the menu (no group) together, under no heading of their own.
  const cardOf = (list: typeof entries): Group[] =>
    list.reduce<Group[]>((out, m) => {
      if ("items" in m) out.push({ title: m.title, items: m.items });
      else if (out.length && out[out.length - 1].title === "") out[out.length - 1].items.push([m.title, m.href]);
      else out.push({ title: "", items: [[m.title, m.href]] });
      return out;
    }, []);
  const groups = cardOf(entries);
  const shown = entries.length > MAX_GROUPS ? entries.slice(0, MAX_GROUPS - 1) : entries;
  const more = entries.length > MAX_GROUPS ? cardOf(entries.slice(MAX_GROUPS - 1)) : [];
  const primary = T.cta.find((c) => c.primary) ?? T.cta[0];
  const toggle = (key: string) => setOpen((o) => (o === key ? null : key));
  const cardGroups = open === "__alle" ? groups : open === "__mere" ? more : groups.filter((g) => g.title && g.title === open);
  const go = (name: string, group: string, href: string) => {
    setOpen(null);
    onGo(name, group, href);
  };

  return (
    <>
      {open && cardGroups.length > 0 && (
        <div className="fd-card" role="dialog" aria-label={open.startsWith("__") ? tr("Menu") : open}>
          <button type="button" className="fd-x" aria-label={tr("Luk")} onClick={() => setOpen(null)}>
            ×
          </button>
          {cardGroups.map((g, i) => (
            <div key={`${g.title}-${i}`} className="fd-gruppe">
              {g.title ? <span className="fd-kicker">{g.title}</span> : <span className="fd-kicker">{i === 0 ? tr("Menu") : ""}</span>}
              <div className="fd-items">
                {g.items.map(([name, href]) => (
                  <button key={name} type="button" className={room === name ? "fd-her" : ""} aria-current={room === name ? "location" : undefined} onClick={() => go(name, g.title, href)}>
                    {name}
                    {!isInTourHref(href) && <span aria-hidden> ↗</span>}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <nav className="fd-dock" aria-label={tr("Menu")}>
        {/* Phone: one Menu button with every group in the card. */}
        <button type="button" className={`fd-mobil ${open === "__alle" ? "aaben" : ""}`} aria-expanded={open === "__alle"} onClick={() => toggle("__alle")}>
          <svg viewBox="0 0 24 24" aria-hidden>
            {ICON.menu}
          </svg>
          {tr("Menu")}
        </button>
        {shown.map((m, i) =>
          "items" in m ? (
            <button key={m.title} type="button" className={`fd-pc ${open === m.title ? "aaben" : ""}`} aria-expanded={open === m.title} onClick={() => toggle(m.title)}>
              {i === 0 && (
                <svg viewBox="0 0 24 24" aria-hidden>
                  {ICON.menu}
                </svg>
              )}
              {m.title}
            </button>
          ) : (
            <button key={m.title} type="button" className="fd-pc" onClick={() => go(m.title, "", m.href)}>
              {m.title}
            </button>
          )
        )}
        {more.length > 0 && (
          <button type="button" className={`fd-pc ${open === "__mere" ? "aaben" : ""}`} aria-expanded={open === "__mere"} onClick={() => toggle("__mere")}>
            {tr("Mere")}
          </button>
        )}
        {hasGuide && (
          <button
            type="button"
            className="fd-rundt"
            aria-label={tr("Vis mig rundt")}
            onClick={() => {
              setOpen(null);
              onGuide();
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden>
              {ICON.play}
            </svg>
            <span>{tr("Vis mig rundt")}</span>
          </button>
        )}
        {primary && (
          <TourLink className="fd-primary" href={primary.href} label={primary.label} onClick={() => onCta(primary.label, primary.href)}>
            {primary.label}
          </TourLink>
        )}
      </nav>
    </>
  );
}

export const FLOAT_DOCK_CSS = `
.fd-dock{position:absolute;left:50%;bottom:calc(20px + env(safe-area-inset-bottom,0px));translate:-50% 0;z-index:9;display:flex;align-items:center;gap:4px;max-width:calc(100% - 24px);padding:6px;border-radius:999px;background:rgba(255,255,255,.88);backdrop-filter:blur(18px) saturate(1.3);-webkit-backdrop-filter:blur(18px) saturate(1.3);box-shadow:0 10px 30px rgba(0,0,0,.22);animation:hvUp .45s cubic-bezier(.2,.7,.2,1) both}
.fd-dock>*{display:flex;align-items:center;gap:6px;flex:none;border:0;border-radius:999px;padding:10px 14px;background:transparent;color:#15201d;font:inherit;font-weight:600;font-size:13.5px;white-space:nowrap;text-decoration:none;cursor:pointer;transition:background .15s,color .15s}
.fd-dock>* svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round}
.fd-dock>*:hover{background:rgba(0,0,0,.06)}
.fd-dock>.aaben{background:#15201d;color:#fff}
.fd-dock>.fd-primary{background:var(--c-accent);color:var(--c-on-accent,#fff);font-weight:800;padding:10px 18px}
.fd-dock>.fd-primary:hover{background:var(--c-accent-dark,var(--c-accent))}
.fd-dock>.fd-mobil{display:none}
.fd-card{position:absolute;left:50%;bottom:calc(84px + env(safe-area-inset-bottom,0px));translate:-50% 0;z-index:9;width:min(560px,calc(100% - 24px));max-height:min(56vh,460px);overflow-y:auto;box-sizing:border-box;padding:14px;border-radius:22px;background:rgba(20,28,26,.74);backdrop-filter:blur(18px) saturate(1.2);-webkit-backdrop-filter:blur(18px) saturate(1.2);color:#fff;display:flex;flex-direction:column;gap:12px;box-shadow:0 14px 40px rgba(0,0,0,.3);animation:hvUp .3s cubic-bezier(.2,.7,.2,1) both}
.fd-x{position:absolute;top:8px;right:8px;width:30px;height:30px;border:0;border-radius:50%;background:rgba(255,255,255,.14);color:#fff;font-size:18px;line-height:1;cursor:pointer}
.fd-gruppe{display:flex;flex-direction:column;gap:8px}
.fd-kicker{font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;opacity:.72;padding-right:36px}
.fd-items{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.fd-items button{border:0;border-radius:14px;padding:10px 12px;background:rgba(255,255,255,.14);color:#fff;font:inherit;font-weight:600;font-size:13px;text-align:left;cursor:pointer;line-height:1.25}
.fd-items button:hover{background:rgba(255,255,255,.24)}
.fd-items button.fd-her{background:rgba(255,255,255,.95);color:#15201d;font-weight:700}
/* Out of the way of what else sits at the bottom: above the stories, and the corner buttons above the dock. */
.hv-st-on-d .fd-dock{bottom:calc(var(--st-h,148px) + 10px)}
.hv-st-on-d .fd-card{bottom:calc(var(--st-h,148px) + 76px)}
.hv-menu-flyd .hv-luften,.hv-menu-flyd .vt-tur-knap-bottom-left,.hv-menu-flyd .vt-tur-knap-bottom-right{bottom:calc(84px + env(safe-area-inset-bottom,0px))}
.hv-menu-flyd.rt-d-bottom-left .rt-knap,.hv-menu-flyd.rt-d-bottom-right .rt-knap{bottom:calc(84px + env(safe-area-inset-bottom,0px))}
.hv-menu-aaben .fd-dock,.hv-menu-aaben .fd-card,.hv-guiding .fd-dock,.hv-guiding .fd-card{opacity:0;pointer-events:none}
@media (max-width:760px){
  .fd-dock{bottom:calc(12px + env(safe-area-inset-bottom,0px))}
  .fd-dock>.fd-pc{display:none}
  .fd-dock>.fd-mobil{display:flex}
  .fd-dock>*{padding:10px 13px;font-size:13px}
  .fd-rundt span{display:none}
  .fd-card{bottom:calc(74px + env(safe-area-inset-bottom,0px));max-height:62vh}
  .fd-items{grid-template-columns:repeat(2,minmax(0,1fr))}
  .hv-st-on-m .fd-dock{bottom:calc(var(--st-h,150px) + 8px)}
  .hv-st-on-m .fd-card{bottom:calc(var(--st-h,150px) + 70px)}
  .hv-menu-flyd.hv-i-tour .rt-knap,.hv-menu-flyd .hv-luften{bottom:calc(74px + env(safe-area-inset-bottom,0px))}
}
`;
