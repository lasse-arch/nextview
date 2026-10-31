"use client";

import { useEffect, useState } from "react";
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
