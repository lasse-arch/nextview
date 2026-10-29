"use client";

import { useT } from "../tours/i18n-react";
import { imageOfHref, isInTourHref, isPlaceHref } from "../tours/places";
import type { BentoTile, TourConfig } from "../tours/types";

/*
 * "Fliser" (the bento menu, as on Fitness United's explore tour): the MENU
 * button opens a full-screen menu - the logo, big tiles in a grid (some wide
 * or tall, one in the accent colour for the main action), then every place
 * as a pill ("Alle områder", the one you stand in marked) and the contact
 * details. Tiles are set in the editor; without any, they are made from the
 * main action and the menu.
 */

/** The tiles to show: the tour's own, or made from its main action and menu. */
export function bentoTiles(T: TourConfig): BentoTile[] {
  if (T.bento?.tiles.length) return T.bento.tiles;
  const tiles: BentoTile[] = [];
  const cta = T.cta.find((c) => c.primary) ?? T.cta[0];
  if (cta) tiles.push({ title: cta.label, href: cta.href, size: "tall", style: "accent" });
  for (const m of T.menu) {
    if (tiles.length >= 8) break;
    if ("items" in m) {
      if (m.items.length) tiles.push({ title: m.title, kicker: m.items.length > 1 ? `${m.items.length} steder` : undefined, href: m.items[0][1] });
    } else tiles.push({ title: m.title, href: m.href });
  }
  // A little rhythm: every third ordinary tile is wide.
  return tiles.map((t, i) => (i > 0 && !t.size && i % 3 === 1 ? { ...t, size: "wide" } : t));
}

export function BentoMenu({
  T,
  open,
  setOpen,
  room,
  guides,
  onGuide,
  onGo,
}: {
  T: TourConfig;
  open: boolean;
  setOpen: (open: boolean) => void;
  room: string | null;
  /** The guided tours (the main one has id null) - a pill each. */
  guides: { id: string | null; title: string }[];
  onGuide: (id: string | null) => void;
  /** A place in the tour or a link out (the engine's menuGo). */
  onGo: (name: string, group: string, href: string) => void;
}) {
  const tr = useT();
  const go = (name: string, group: string, href: string) => {
    setOpen(false);
    onGo(name, group, href);
  };
  const places = T.menu.flatMap((m) => ("items" in m ? m.items.map(([n, h]) => ({ name: n, href: h, group: m.title })) : [{ name: m.title, href: m.href, group: "" }])).filter((p) => isPlaceHref(p.href) || imageOfHref(p.href) != null);
  const c = T.contact;
  return (
    <>
      <button type="button" className="bm-knap" onClick={() => setOpen(!open)} aria-expanded={open}>
        <svg viewBox="0 0 22 22" aria-hidden>
          <rect width="9" height="13" rx="1.5" />
          <rect x="11" width="11" height="6" rx="1.5" />
          <rect x="11" y="8" width="11" height="5" rx="1.5" />
          <rect y="15" width="9" height="7" rx="1.5" />
          <rect x="11" y="15" width="11" height="7" rx="1.5" />
        </svg>
        {tr("Menu").toUpperCase()}
      </button>
      <div className={`bm ${open ? "vis" : ""}`} role="dialog" aria-modal="true" aria-label={tr("Menu")} aria-hidden={!open}>
        <div className="bm-head">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={T.logo} alt={T.brand} className={T.logoOnLight ? "bm-lys" : "bm-hvid"} />
          <button type="button" className="bm-x" aria-label={tr("Luk")} onClick={() => setOpen(false)}>
            ×
          </button>
        </div>
        <div className="bm-grid">
          {bentoTiles(T).map((t, i) => (
            <button key={i} type="button" className={`bm-tile ${t.size ? `bm-${t.size}` : ""} bm-${t.style ?? "light"}`} onClick={() => go(t.title, "fliser", t.href)}>
              {t.tag && <em>{t.tag}</em>}
              <i aria-hidden>{isInTourHref(t.href) ? "+" : "↗"}</i>
              {t.kicker && <small>{t.kicker}</small>}
              <b>
                {t.title.split("\n").map((line, j) => (
                  <span key={j}>{line}</span>
                ))}
              </b>
            </button>
          ))}
        </div>
        <div className="bm-sub">
          {(guides.length > 0 || places.length > 0) && <h4>{tr("Alle områder")}</h4>}
          <div className="bm-pills">
            {guides.map((g) => (
              <button key={g.id ?? ""} type="button" className="bm-pill bm-guide" onClick={() => (setOpen(false), onGuide(g.id))}>
                ▶ {g.id == null ? tr("Vis mig rundt") : g.title}
              </button>
            ))}
            {places.map((p) => (
              <button key={p.group + p.name} type="button" className={`bm-pill ${room === p.name ? "here" : ""}`} onClick={() => go(p.name, p.group, p.href)}>
                {p.name}
              </button>
            ))}
          </div>
          {c && (c.address || c.email || c.phone) && (
            <>
              <h4>{tr("Kontakt")}</h4>
              <div className="bm-contact">
                {c.address && (
                  <a href={c.mapUrl ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.address)}`} target="_blank" rel="noopener noreferrer">
                    {c.address}
                  </a>
                )}
                {c.phone && <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`}>{c.phone}</a>}
                {c.email && <a href={`mailto:${c.email}`}>{c.email}</a>}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

export const BENTO_CSS = `
.bm-knap{position:absolute;top:calc(12px + env(safe-area-inset-top,0px));right:16px;z-index:9;display:flex;align-items:center;gap:10px;padding:10px 15px;border:1px solid rgba(255,255,255,.16);border-radius:12px;background:rgba(24,34,36,.85);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);color:#fff;font:500 14px var(--font-heading);letter-spacing:.12em;cursor:pointer}
.bm-knap svg{width:18px;height:18px;fill:#fff}
.bm{position:absolute;inset:0;z-index:30;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;background:rgba(24,34,36,.97);color:#1b2526;opacity:0;pointer-events:none;transition:opacity .3s ease}
.bm.vis{opacity:1;pointer-events:auto}
.bm-head{display:flex;align-items:center;justify-content:space-between;max-width:880px;margin:0 auto;padding:calc(20px + env(safe-area-inset-top,0px)) 22px 20px}
.bm-head img{height:32px;width:auto;max-width:60%;object-fit:contain}
.bm-head img.bm-hvid{filter:brightness(0) invert(1)}
.bm-head img.bm-lys{height:44px;padding:6px 10px;border-radius:10px;background:#fff}
.bm-x{width:44px;height:44px;border:1px solid rgba(255,255,255,.18);border-radius:12px;background:none;color:#fff;font-size:24px;line-height:1;cursor:pointer}
.bm-grid{display:grid;grid-template-columns:repeat(4,1fr);grid-auto-rows:minmax(150px,19vh);grid-auto-flow:dense;gap:18px;max-width:880px;margin:6px auto 0;padding:0 22px}
.bm-tile{container-type:inline-size;position:relative;display:flex;flex-direction:column;justify-content:flex-end;overflow:hidden;padding:18px;border:0;border-radius:18px;background:#eeeeea;color:#1b2526;text-align:left;font-family:var(--font-heading);cursor:pointer;transition:transform .25s,box-shadow .25s}
.bm-tile:hover{transform:translateY(-4px);box-shadow:0 18px 40px rgba(0,0,0,.35)}
.bm-tile small{display:block;margin-bottom:4px;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;opacity:.75}
.bm-tile b{display:block;font-size:clamp(14px,11cqw,26px);line-height:1.05;font-weight:300;text-transform:uppercase;letter-spacing:.01em;overflow-wrap:break-word}
.bm-tile b span{display:block}
.bm-tile i{position:absolute;top:14px;right:14px;width:22px;height:22px;border-radius:50%;background:#1b2526;color:#eeeeea;font-style:normal;font-size:15px;line-height:22px;text-align:center}
.bm-tile em{position:absolute;top:14px;left:14px;padding:3px 9px;border-radius:999px;background:var(--c-accent);color:#fff;font-style:normal;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
.bm-accent{background:var(--c-accent);color:#fff}.bm-accent i{background:#fff;color:var(--c-accent)}
.bm-dark{background:#0d141e;color:#fff;border:1px solid rgba(255,255,255,.12)}.bm-dark i{background:var(--c-accent);color:#fff}
.bm-tall{grid-row:span 2}.bm-wide{grid-column:span 2}
.bm-sub{max-width:880px;margin:30px auto 0;padding:0 22px calc(40px + env(safe-area-inset-bottom,0px));color:#fff}
.bm-sub h4{margin:0 0 12px;font-size:12px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;opacity:.6}
.bm-pills{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:28px}
.bm-pill{padding:9px 15px;border:1px solid rgba(255,255,255,.2);border-radius:999px;background:none;color:#fff;font-family:inherit;font-size:13px;font-weight:500;letter-spacing:.03em;cursor:pointer;transition:background .2s,border-color .2s}
.bm-pill:hover,.bm-pill.here,.bm-pill.bm-guide{background:var(--c-accent);border-color:var(--c-accent)}
.bm-contact{display:flex;flex-wrap:wrap;gap:12px 24px;font-size:14px}
.bm-contact a{color:#fff;text-decoration:none;border-bottom:1px solid rgba(255,255,255,.3)}
.hv:has(.bm.vis) .hv-logo,.hv:has(.bm.vis) .bm-knap{display:none}
@media (max-width:760px){
  .bm-grid{grid-template-columns:repeat(2,1fr);grid-auto-rows:140px;gap:12px;padding:0 14px}
  .bm-tile{padding:14px}
  .bm-sub{padding-left:14px;padding-right:14px}
  .bm-head{padding-left:16px;padding-right:16px}
}
`;
