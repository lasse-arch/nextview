"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { InUseItem } from "../tours/types";
import { useT } from "../tours/i18n-react";

/*
 * "Se det i brug" (TourConfig.inUse): standing at one of a place's scan
 * points, a small box slides up with a short silent film (looping) or a photo
 * of the place in use. A tap shows it big - a film with sound and the
 * player's controls, a photo in the lightbox. Each shows once a visit (also
 * after the visitor closes it); in the editor's preview every time. Kept
 * small on a phone: a thumbnail under the menu button.
 */

const SEEN_KEY = "tour-inuse-seen";

function seenBefore(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(SEEN_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

export function InUseBox({
  items,
  currentSs,
  hidden,
  preview,
  onImage,
  onShown,
}: {
  items: InUseItem[];
  currentSs: number | null;
  /** Something else has the screen (the guide, Find vej, a picture) - it waits. */
  hidden: boolean;
  /** The editor's preview: shown every time it's reached. */
  preview: boolean;
  onImage: (src: string, title: string) => void;
  onShown?: (item: InUseItem) => void;
}) {
  const tr = useT();
  const [seen, setSeen] = useState<Set<string>>(() => (typeof window === "undefined" || preview ? new Set() : seenBefore()));
  const [showing, setShowing] = useState<InUseItem | null>(null);
  const [full, setFull] = useState<InUseItem | null>(null);
  const shownRef = useRef(onShown);
  useEffect(() => {
    shownRef.current = onShown;
  });
  const here = currentSs == null ? null : items.find((i) => i.src && i.ss.includes(currentSs) && !seen.has(i.id)) ?? null;
  const hereId = here?.id ?? null;

  // A moment after arriving (the room first), it slides up - and counts as seen. Leaving the spot takes it away.
  useEffect(() => {
    if (!hereId || hidden) return;
    const item = items.find((i) => i.id === hereId);
    if (!item) return;
    const t = setTimeout(() => {
      setShowing(item);
      shownRef.current?.(item);
      setSeen((s) => {
        const next = new Set(s).add(item.id);
        if (!preview)
          try {
            sessionStorage.setItem(SEEN_KEY, JSON.stringify([...next]));
          } catch {}
        return next;
      });
    }, 1200);
    return () => clearTimeout(t);
  }, [hereId, hidden, items, preview]);
  // Walked on (to a spot it isn't for), or something else took the screen: gone - and not back (it was seen).
  const stillHere = Boolean(showing && currentSs != null && showing.ss.includes(currentSs) && !hidden);
  const [wasHere, setWasHere] = useState(stillHere);
  if (wasHere !== stillHere) {
    setWasHere(stillHere);
    if (!stillHere && showing) setShowing(null);
  }

  const open = (item: InUseItem) => {
    setShowing(null);
    if (item.kind === "image") onImage(item.src, item.title || tr("Se det i brug"));
    else setFull(item);
  };

  return (
    <>
      {showing && stillHere && (
        <div className="iu" role="dialog" aria-label={showing.title || tr("Se det i brug")}>
          <button type="button" className="iu-media" onClick={() => open(showing)} aria-label={showing.title || tr("Se det i brug")}>
            {showing.kind === "video" ? (
              <video src={showing.src} muted autoPlay loop playsInline preload="auto" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={showing.src} alt="" />
            )}
            <span className="iu-play" aria-hidden>
              {showing.kind === "video" ? "▶" : "⤢"}
            </span>
          </button>
          <div className="iu-tekst">
            <b>{showing.title || tr("Se det i brug")}</b>
          </div>
          <button type="button" className="iu-luk" aria-label={tr("Luk")} onClick={() => setShowing(null)}>
            ×
          </button>
        </div>
      )}
      {full &&
        createPortal(
          <div className="hv-videofuld" role="dialog" aria-label={full.title || tr("Se det i brug")} onClick={() => setFull(null)}>
            <video src={full.src} autoPlay controls playsInline onClick={(e) => e.stopPropagation()} />
            <button type="button" className="hv-videofuld-luk" aria-label={tr("Luk")} onClick={() => setFull(null)}>
              ×
            </button>
          </div>,
          document.body
        )}
    </>
  );
}

export const IN_USE_CSS = `
.iu{position:absolute;right:16px;bottom:calc(84px + env(safe-area-inset-bottom,0px));z-index:8;width:260px;border-radius:16px;overflow:hidden;background:#fff;box-shadow:0 14px 40px rgba(0,0,0,.35);animation:hvUp .45s cubic-bezier(.2,.7,.2,1) both}
.iu-media{position:relative;display:block;width:100%;aspect-ratio:16/9;padding:0;border:0;background:#0d1b20;cursor:pointer}
.iu-media video,.iu-media img{display:block;width:100%;height:100%;object-fit:cover}
.iu-play{position:absolute;left:10px;bottom:10px;display:grid;place-items:center;width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,.92);color:var(--c-main);font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,.3)}
.iu-tekst{padding:9px 12px 10px}
.iu-tekst b{display:block;font-size:14px;font-weight:800;line-height:1.25;color:var(--c-main);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.iu-luk{position:absolute;top:8px;right:8px;width:28px;height:28px;border:0;border-radius:50%;background:rgba(0,0,0,.55);color:#fff;font-size:17px;line-height:1;cursor:pointer}
/* A phone: a small box under the menu button - the picture, its name on it, the ×. */
@media (max-width:760px){
  .iu{right:10px;bottom:auto;top:calc(66px + env(safe-area-inset-top,0px));width:132px;border-radius:12px}
  .iu-media{aspect-ratio:4/3}
  .iu-tekst{position:absolute;left:0;right:0;bottom:0;padding:16px 8px 6px;background:linear-gradient(transparent,rgba(0,0,0,.65));pointer-events:none}
  .iu-tekst b{font-size:11.5px;color:#fff}
  .iu-play{left:auto;right:6px;bottom:auto;top:30px;width:24px;height:24px;font-size:10px;display:none}
  .iu-luk{top:5px;right:5px;width:22px;height:22px;font-size:14px}
  /* Under Find vej's button when it stands there (and under the live chip too). */
  .hv-har-rute .iu{top:calc(108px + env(safe-area-inset-top,0px))}
  .hv-har-rute:has(.hv-live-chip) .iu{top:calc(156px + env(safe-area-inset-top,0px))}
}
`;
