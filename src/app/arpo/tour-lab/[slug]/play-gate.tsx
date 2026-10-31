"use client";

import { useT } from "../tours/i18n-react";
import type { TourConfig } from "../tours/types";
import { welcomeTiles } from "../tours/places";

/**
 * "Afspil-knap" (as in MPSkins): with autoplay off, a tour on a website shows
 * a picture with a big play button - nothing of Matterport loads until it's
 * pressed. Pressed, the tour opens in full screen (a phone, which can't make
 * a frame full screen, opens it in its own tab).
 */
export function PlayGate({ T, isPreview, onPlay }: { T: TourConfig; /** Asked when pressed (it reads the window): the editor's preview just starts, no full screen. */ isPreview: () => boolean; onPlay: () => void }) {
  const tr = useT();
  const image = T.cover?.image || T.places?.find((p) => p.image)?.image || welcomeTiles(T).find((t) => t.image)?.image || "";
  const title = T.cover?.title || T.brand || T.title;
  const lead = T.cover?.lead || T.subtitle || "";

  async function play() {
    if (!isPreview()) {
      const el = document.documentElement;
      if (document.fullscreenEnabled && el.requestFullscreen) {
        await el.requestFullscreen().catch(() => {});
      } else if (window.parent !== window) {
        // A phone: the tour in a tab of its own fills the screen - this one stays as it is.
        const url = new URL(location.href);
        url.searchParams.set("afspil", "1");
        window.open(url.toString(), "_blank", "noopener");
        return;
      }
    }
    onPlay();
  }

  return (
    <button
      type="button"
      onClick={play}
      className="pg"
      style={
        {
          "--pg-bg": image ? `url(${image})` : "none",
          "--c-main": T.colors.main,
          "--c-accent": T.colors.accent,
          fontFamily: `'${T.font}', system-ui, sans-serif`,
        } as React.CSSProperties
      }
    >
      <span className="pg-tekst">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {T.logo && <img src={T.logo} alt={T.brand} className="pg-logo" />}
        <span className="pg-titel">{title}</span>
        {lead && <span className="pg-lead">{lead}</span>}
      </span>
      <span className="pg-knap">
        <span className="pg-play" aria-hidden>
          <svg viewBox="0 0 24 24">
            <path d="M8 5.5v13l11-6.5z" />
          </svg>
        </span>
        {T.cover?.enter || tr("Gå ind i touren")}
      </span>
      <style>{PLAY_CSS}</style>
      <link rel="stylesheet" href={`https://fonts.googleapis.com/css2?family=${T.font.replace(/ /g, "+")}:wght@400;700;800&display=swap`} />
    </button>
  );
}

const PLAY_CSS = `
.pg{position:fixed;inset:0;z-index:60;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;width:100%;border:0;padding:calc(24px + env(safe-area-inset-top,0px)) 24px calc(24px + env(safe-area-inset-bottom,0px));cursor:pointer;color:#fff;text-align:center;background:linear-gradient(180deg,rgba(0,0,0,.55),rgba(0,0,0,.25) 45%,rgba(0,0,0,.6)),var(--pg-bg) center/cover,var(--c-main)}
.pg-tekst{display:flex;flex-direction:column;align-items:center;gap:6px;max-width:640px}
.pg-logo{height:46px;width:auto;max-width:200px;object-fit:contain;filter:drop-shadow(0 2px 8px rgba(0,0,0,.4));margin-bottom:4px}
.pg-titel{font-size:clamp(22px,4vw,40px);font-weight:800;line-height:1.1;text-shadow:0 2px 14px rgba(0,0,0,.45)}
.pg-lead{font-size:clamp(13px,1.6vw,16px);line-height:1.5;opacity:.92;text-shadow:0 1px 8px rgba(0,0,0,.5);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.pg-knap{display:inline-flex;align-items:center;gap:10px;margin-top:4px;padding:8px 20px 8px 8px;border-radius:999px;background:#fff;color:#1d2a30;font-size:15px;font-weight:700;box-shadow:0 6px 20px rgba(0,0,0,.25);transition:transform .15s}
.pg:hover .pg-knap{transform:translateY(-1px)}
.pg-play{display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:50%;background:var(--c-main)}
.pg-play svg{width:15px;height:15px;margin-left:2px;fill:#fff}
`;
