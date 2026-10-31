"use client";

import { useEffect, useState } from "react";
import { useT } from "../tours/i18n-react";

/*
 * "Her er menuen": right after one steps into the tour, a short arrow and a
 * pulsing ring point out where the menu is - whatever menu the tour has and
 * wherever it sits (the Menu button, the dock, the room picker…). It goes by
 * itself after a few seconds or at the first touch, and is shown once per
 * visit (every time in the editor's preview, to try it).
 */

/** The things that open the menu, in every menu design. */
const TRIGGERS = [".hv-menuknap", ".bm-knap", ".sp-menuknap", ".dz-dock", ".pk-mini"];

type Spot = { x: number; y: number; w: number; h: number };

/** The menu's button as it is on screen now - only when it can really be seen (not hidden, faded or covered by a picture, the drone scene …). */
function visibleTrigger(): HTMLElement | null {
  for (const s of TRIGGERS) {
    const el = document.querySelector<HTMLElement>(s);
    if (!el || el.offsetParent === null) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    let seen = true;
    for (let at: HTMLElement | null = el; at; at = at.parentElement) {
      const cs = getComputedStyle(at);
      if (cs.visibility === "hidden" || Number(cs.opacity) < 0.3) {
        seen = false;
        break;
      }
    }
    if (!seen) continue;
    // On top at its middle - nothing else lying over it.
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (top && (el === top || el.contains(top) || top.closest(".mh"))) return el;
  }
  return null;
}

export function MenuHint({ slug, again }: { slug: string; again: boolean }) {
  const tr = useT();
  const [spot, setSpot] = useState<Spot | null>(null);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const key = `hv-menu-hint:${slug}`;
    try {
      if (!again && sessionStorage.getItem(key)) return;
    } catch {}
    let hide: ReturnType<typeof setTimeout> | undefined;
    let watch: ReturnType<typeof setInterval> | undefined;
    // A moment after stepping in, so it isn't lost among everything else appearing.
    const show = setTimeout(() => {
      const el = visibleTrigger();
      if (!el) return;
      const r = el.getBoundingClientRect();
      setSpot({ x: r.left, y: r.top, w: r.width, h: r.height });
      try {
        sessionStorage.setItem(key, "1");
      } catch {}
      hide = setTimeout(() => setGone(true), 4500);
      // The visitor may move on meanwhile (a tap inside the 3D tour never reaches this page): gone the moment the button
      // can't be seen any more, and following it if it moves.
      watch = setInterval(() => {
        const now = visibleTrigger();
        if (!now) return setGone(true);
        const n = now.getBoundingClientRect();
        setSpot((s) => (s && Math.abs(s.x - n.left) < 1 && Math.abs(s.y - n.top) < 1 && Math.abs(s.w - n.width) < 1 ? s : { x: n.left, y: n.top, w: n.width, h: n.height }));
      }, 200);
    }, 1200);
    const touched = () => setGone(true);
    window.addEventListener("pointerdown", touched, { once: true });
    return () => {
      clearTimeout(show);
      if (hide) clearTimeout(hide);
      if (watch) clearInterval(watch);
      window.removeEventListener("pointerdown", touched);
    };
  }, [slug, again]);

  if (!spot || gone) return null;
  const vw = window.innerWidth;
  const below = spot.y + spot.h / 2 < window.innerHeight / 2;
  const cx = spot.x + spot.w / 2;
  // The label beside the arrow, kept on the screen.
  const labelX = Math.max(12, Math.min(cx - 80, vw - 172));
  return (
    <div className="mh" aria-hidden>
      <span className="mh-ring" style={{ left: spot.x - 6, top: spot.y - 6, width: spot.w + 12, height: spot.h + 12 }} />
      <span className={`mh-pil ${below ? "ned" : "op"}`} style={{ left: cx - 14, top: below ? spot.y + spot.h + 10 : spot.y - 48 }}>
        <svg viewBox="0 0 24 24">
          <path d="M12 20V5M5 11l7-7 7 7" />
        </svg>
      </span>
      <span className="mh-tekst" style={{ left: labelX, top: below ? spot.y + spot.h + 50 : spot.y - 92 }}>
        {tr("Her er menuen")}
      </span>
    </div>
  );
}

export const MENU_HINT_CSS = `
.mh{position:fixed;inset:0;z-index:30;pointer-events:none;animation:hvFade .3s ease}
.mh-ring{position:fixed;border-radius:999px;box-shadow:0 0 0 3px #fff,0 0 0 7px var(--c-accent);animation:mhPuls 1.3s ease-in-out infinite}
.mh-pil{position:fixed;width:28px;height:36px;display:flex;align-items:center;justify-content:center}
.mh-pil svg{width:28px;height:28px;fill:none;stroke:#fff;stroke-width:3;stroke-linecap:round;stroke-linejoin:round;filter:drop-shadow(0 2px 6px rgba(0,0,0,.45))}
.mh-pil.ned{animation:mhOp 1s ease-in-out infinite}
.mh-pil.op svg{transform:rotate(180deg)}
.mh-pil.op{animation:mhNed 1s ease-in-out infinite}
.mh-tekst{position:fixed;width:160px;text-align:center;padding:8px 12px;border-radius:999px;background:var(--c-main);color:#fff;font-size:14px;font-weight:800;box-shadow:0 8px 22px rgba(0,0,0,.3);box-sizing:border-box}
@keyframes mhPuls{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.08);opacity:.75}}
@keyframes mhOp{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
@keyframes mhNed{0%,100%{transform:translateY(0)}50%{transform:translateY(6px)}}
@media (prefers-reduced-motion:reduce){.mh-ring,.mh-pil{animation:none!important}}
`;
