"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useT } from "../tours/i18n-react";

/*
 * A tour in someone's page on a phone: it loads in the frame as usual, and
 * the first tap in it (the welcome, the menu, a tile …) puts it in full
 * screen - a tour is hard to use in a small frame. An iPhone can't make a
 * frame full screen: there a small "Fuld skærm" button opens the tour in its
 * own tab instead. Out of full screen again, it just stays in the frame.
 */
export function FullscreenOnUse() {
  const tr = useT();
  const [canFull] = useState(() => typeof document !== "undefined" && Boolean(document.fullscreenEnabled && document.documentElement.requestFullscreen));
  const [hideTab, setHideTab] = useState(false);

  useEffect(() => {
    if (!canFull) return;
    // The first touch - the browser only allows full screen right after one.
    const go = () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    };
    window.addEventListener("pointerup", go, { once: true, capture: true });
    return () => window.removeEventListener("pointerup", go, { capture: true });
  }, [canFull]);

  if (canFull || hideTab) return null;
  return (
    <button
      type="button"
      className="fs-knap"
      onClick={() => {
        const url = new URL(location.href);
        url.searchParams.set("afspil", "1");
        window.open(url.toString(), "_blank", "noopener");
        setHideTab(true);
      }}
    >
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
      </svg>
      {tr("Fuld skærm")}
    </button>
  );
}

export const FULLSCREEN_CSS = `
.fs-knap{position:fixed;left:50%;top:calc(10px + env(safe-area-inset-top,0px));translate:-50% 0;z-index:70;display:flex;align-items:center;gap:6px;border:0;border-radius:999px;padding:8px 14px;background:rgba(10,18,20,.72);color:#fff;font:inherit;font-weight:700;font-size:13px;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);box-shadow:0 6px 18px rgba(0,0,0,.3)}
.fs-knap svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
`;

const SIZE = 40;
const GAP = 8;
const MENU_BUTTONS = ".hv-menuknap, .bm-knap, .sp-menuknap";
const OBSTACLES = "button, a, select, input, [role='button'], .hv-logo, .hv-live-chip";

/** Where the button can sit: left of the menu button, past anything else in that row - null where there's no room. */
function placeFor(button: HTMLElement): { top: number; left: number } | null {
  const root = button.closest(".hv") ?? document.body;
  // Something open on top of the tour (a menu of another design, a sheet): out of the way until it's closed.
  if (root.querySelector('.bm.vis, .sp-menu, [role="dialog"][aria-modal="true"]:not([aria-hidden="true"])')) return null;
  const vw = window.innerWidth;
  const menu = [...root.querySelectorAll<HTMLElement>(MENU_BUTTONS)].find((el) => el.getClientRects().length && el.checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) !== false);
  const m = menu?.getBoundingClientRect();
  const top = m ? m.top + m.height / 2 - SIZE / 2 : 14;
  let left = (m ? m.left : vw - 14) - GAP - SIZE;
  const others = [...root.querySelectorAll<HTMLElement>(OBSTACLES)]
    .filter((el) => el !== button && !button.contains(el) && el !== menu && el.getClientRects().length && el.checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) !== false)
    .map((el) => el.getBoundingClientRect())
    // Whole-screen layers (the tour itself, a dim behind the menu) aren't in the way.
    .filter((r) => r.width < vw * 0.6 && r.width > 0 && r.height > 0);
  // Step left past anything in the way - a language switch, a button under the menu - and give up when it reaches the left half.
  for (let i = 0; i < 8; i++) {
    const hit = others.find((r) => r.left < left + SIZE + GAP / 2 && r.right > left - GAP / 2 && r.top < top + SIZE + GAP / 2 && r.bottom > top - GAP / 2);
    if (!hit) return left > vw / 2 - SIZE ? { top, left } : null;
    left = hit.left - GAP - SIZE;
  }
  return null;
}

/*
 * A small full-screen button in the top right corner of the tour, just left
 * of the menu button - it measures where that is (every menu design puts its
 * own there) and steps past anything else in the row, and stays away when
 * there's no free spot, so it never lies on top of another button. Only
 * where the browser can make the page full screen (not an iPhone).
 */
const noop = () => () => {};

export function FullscreenButton({ onToggle }: { onToggle?: (on: boolean) => void }) {
  const tr = useT();
  // Known only in the browser (the server draws nothing, so the page matches when it wakes up).
  const canFull = useSyncExternalStore(noop, () => Boolean(document.fullscreenEnabled && document.documentElement.requestFullscreen), () => false);
  const [on, setOn] = useState(false);
  const [place, setPlace] = useState<{ top: number; left: number } | null>(null);
  const [el, setEl] = useState<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!canFull) return;
    const sync = () => setOn(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, [canFull]);

  // Placed again when the window changes and every so often (menus, chips and switches come and go).
  useEffect(() => {
    if (!el) return;
    let last = "";
    const measure = () => {
      const p = placeFor(el);
      const key = p ? `${Math.round(p.top)},${Math.round(p.left)}` : "";
      if (key !== last) {
        last = key;
        setPlace(p);
      }
    };
    measure();
    const t = window.setInterval(measure, 800);
    window.addEventListener("resize", measure);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("resize", measure);
    };
  }, [el]);

  if (!canFull) return null;
  return (
    <button
      ref={setEl}
      type="button"
      className="fs-hjorne"
      style={place ? { top: place.top, left: place.left } : { visibility: "hidden" }}
      aria-label={on ? tr("Luk fuld skærm") : tr("Fuld skærm")}
      title={on ? tr("Luk fuld skærm") : tr("Fuld skærm")}
      onClick={() => {
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
        else void document.documentElement.requestFullscreen().catch(() => {});
        onToggle?.(!on);
      }}
    >
      <svg viewBox="0 0 24 24" aria-hidden>
        {on ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /> : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
      </svg>
    </button>
  );
}

export const FULLSCREEN_BUTTON_CSS = `
.fs-hjorne{position:fixed;z-index:9;width:${SIZE}px;height:${SIZE}px;display:grid;place-items:center;border:0;border-radius:12px;background:rgba(10,18,20,.62);color:#fff;cursor:pointer;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);box-shadow:0 4px 14px rgba(0,0,0,.25);animation:hvFade .4s ease}
.fs-hjorne:hover{background:rgba(10,18,20,.82)}
.fs-hjorne svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
`;
