"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { InUseItem } from "../tours/types";
import { useT } from "../tours/i18n-react";
import { TourLink } from "./links";

/** A photo item's photos: the first and the rest (more photos fade in the box and are swiped through big). */
const photosOf = (i: InUseItem) => (i.kind === "image" ? [i.src, ...(i.images ?? [])].filter(Boolean) : []);

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
  /** Big: the photos to swipe through, with the item's words and button. */
  const [gallery, setGallery] = useState<{ item: InUseItem; at: number } | null>(null);
  /** The photo shown in the box now (more photos: one after the other). */
  const [frame, setFrame] = useState(0);
  const boxPhotos = showing ? photosOf(showing) : [];
  useEffect(() => {
    if (boxPhotos.length < 2) return;
    const t = window.setInterval(() => setFrame((f) => f + 1), 3500);
    return () => window.clearInterval(t);
  }, [boxPhotos.length]);
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
    // A photo with nothing more: the tour's own lightbox. More photos, words or a button: its own view.
    if (item.kind === "image" && photosOf(item).length < 2 && !item.text && !item.button) onImage(item.src, item.title || tr("Se det i brug"));
    else if (item.kind === "image") setGallery({ item, at: boxPhotos.length ? frame % boxPhotos.length : 0 });
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
              boxPhotos.map((src, k) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={src + k} src={src} alt="" className={k === frame % boxPhotos.length ? "iu-vis" : ""} />
              ))
            )}
            <span className="iu-play" aria-hidden>
              {showing.kind === "video" ? "▶" : "⤢"}
            </span>
          </button>
          <div className="iu-tekst">
            <b>{showing.title || tr("Se det i brug")}</b>
            {boxPhotos.length > 1 && <small>{tr("{n} billeder", { n: boxPhotos.length })}</small>}
          </div>
          <button type="button" className="iu-luk" aria-label={tr("Luk")} onClick={() => setShowing(null)}>
            ×
          </button>
        </div>
      )}
      {gallery && createPortal(<InUseGallery item={gallery.item} at={gallery.at} onClose={() => setGallery(null)} />, document.body)}
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

/** The place in use, big: its photos to swipe through, its words and its button. */
function InUseGallery({ item, at: start, onClose }: { item: InUseItem; at: number; onClose: () => void }) {
  const tr = useT();
  const photos = photosOf(item);
  const [at, setAt] = useState(Math.min(start, photos.length - 1));
  const go = (by: number) => setAt((a) => (a + by + photos.length) % photos.length);
  const touch = useRef<number | null>(null);
  return (
    <div className="iu-gal" role="dialog" aria-modal="true" aria-label={item.title || tr("Se det i brug")} onClick={onClose}>
      <div className="iu-gal-ark" onClick={(e) => e.stopPropagation()}>
        <div
          className="iu-gal-foto"
          onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
          onTouchEnd={(e) => {
            if (touch.current == null) return;
            const dx = e.changedTouches[0].clientX - touch.current;
            touch.current = null;
            if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photos[at]} alt={item.title || ""} />
          {photos.length > 1 && (
            <>
              <button type="button" className="iu-gal-pil iu-gal-forrige" aria-label={tr("Forrige")} onClick={() => go(-1)}>
                ‹
              </button>
              <button type="button" className="iu-gal-pil iu-gal-naeste" aria-label={tr("Næste")} onClick={() => go(1)}>
                ›
              </button>
              <div className="iu-gal-prikker" aria-hidden>
                {photos.map((_, k) => (
                  <i key={k} className={k === at ? "aktiv" : ""} />
                ))}
              </div>
            </>
          )}
        </div>
        <div className="iu-gal-tekst">
          <h3>{item.title || tr("Se det i brug")}</h3>
          {item.text && <p>{item.text}</p>}
          {item.button?.label && item.button.href && (
            <TourLink className="iu-gal-knap" href={item.button.href} label={item.button.label}>
              {item.button.label}
            </TourLink>
          )}
        </div>
        <button type="button" className="iu-gal-luk" aria-label={tr("Luk")} onClick={onClose}>
          ×
        </button>
      </div>
    </div>
  );
}

export const IN_USE_CSS = `
.iu-media img{position:absolute;inset:0;opacity:0;transition:opacity .8s ease}
.iu-media img.iu-vis,.iu-media img:only-child{opacity:1}
.iu-tekst small{display:block;margin-top:1px;font-size:11.5px;color:#6b7a80}
.iu-gal{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.6);animation:hvFade .25s ease}
.iu-gal-ark{position:relative;width:min(980px,calc(100% - 32px));max-height:calc(100% - 32px);display:grid;grid-template-columns:minmax(0,1.7fr) minmax(0,1fr);border-radius:22px;overflow:hidden;background:#fff;box-shadow:0 24px 70px rgba(0,0,0,.45)}
.iu-gal-foto{position:relative;background:#0d1b20;min-height:420px}
.iu-gal-foto img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.iu-gal-pil{position:absolute;top:50%;translate:0 -50%;width:42px;height:42px;border:0;border-radius:50%;background:rgba(255,255,255,.9);color:#1d2a30;font-size:26px;line-height:1;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.3)}
.iu-gal-forrige{left:12px}.iu-gal-naeste{right:12px}
.iu-gal-prikker{position:absolute;left:0;right:0;bottom:12px;display:flex;justify-content:center;gap:6px}
.iu-gal-prikker i{width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.5)}
.iu-gal-prikker i.aktiv{background:#fff}
.iu-gal-tekst{padding:28px 26px;display:flex;flex-direction:column;gap:12px;color:#1d2a30}
.iu-gal-tekst h3{margin:0 30px 0 0;font-size:24px;line-height:1.15;font-weight:800;color:var(--c-main)}
.iu-gal-tekst p{margin:0;font-size:15px;line-height:1.55;color:#33474d}
.iu-gal-knap{align-self:flex-start;margin-top:4px;border-radius:999px;padding:12px 20px;background:var(--c-accent);color:var(--c-on-accent,#fff);font-weight:800;font-size:14.5px;text-decoration:none}
.iu-gal-luk{position:absolute;top:12px;right:12px;width:34px;height:34px;border:0;border-radius:50%;background:rgba(0,0,0,.55);color:#fff;font-size:20px;line-height:1;cursor:pointer}
@media (max-width:760px){
  .iu-gal{align-items:flex-end}
  .iu-gal-ark{width:100%;grid-template-columns:1fr;border-radius:22px 22px 0 0;max-height:92%;overflow-y:auto}
  .iu-gal-foto{min-height:0;height:min(52vh,360px)}
  .iu-gal-tekst{padding:18px 18px calc(22px + env(safe-area-inset-bottom,0px))}
  .iu-gal-tekst h3{font-size:21px}
}
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
