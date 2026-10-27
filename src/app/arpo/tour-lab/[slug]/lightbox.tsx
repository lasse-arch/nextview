"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "../tours/i18n-react";

/*
 * Pictures full screen: a place's photos to swipe through (big, with a count
 * and the place's name), or a site plan (e.g. a campsite's pladskort) zoomed
 * in on one area of it - "the comfort pitches are here" - with the rest of
 * the plan a touch darker and one tap to see all of it.
 */

export type LightboxState = {
  images: string[];
  at: number;
  title: string;
  /** On a plan: the area to show, as fractions of the picture (x1, y1, x2, y2). */
  focus?: [number, number, number, number];
} | null;

export function Lightbox({ state, onClose }: { state: NonNullable<LightboxState>; onClose: () => void }) {
  const tr = useT();
  const [at, setAt] = useState(state.at);
  const n = state.images.length;
  const step = (d: number) => setAt((i) => (i + d + n) % n);
  const touch = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && n > 1) setAt((i) => (i + 1) % n);
      if (e.key === "ArrowLeft" && n > 1) setAt((i) => (i - 1 + n) % n);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [n, onClose]);

  return (
    <div className="lb" role="dialog" aria-modal="true" aria-label={state.title}>
      <div className="lb-head">
        <b>{state.title}</b>
        {n > 1 && (
          <span>
            {at + 1} / {n}
          </span>
        )}
        <button type="button" aria-label={tr("Luk")} onClick={onClose}>
          ×
        </button>
      </div>
      {state.focus ? (
        <PlanView src={state.images[0]} focus={state.focus} />
      ) : (
        <div
          className="lb-stage"
          onClick={(e) => e.target === e.currentTarget && onClose()}
          onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
          onTouchEnd={(e) => {
            const dx = e.changedTouches[0].clientX - (touch.current ?? e.changedTouches[0].clientX);
            touch.current = null;
            if (Math.abs(dx) > 40 && n > 1) step(dx < 0 ? 1 : -1);
          }}
        >
          {state.images.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={src} src={src} alt={i === at ? state.title : ""} className={i === at ? "on" : ""} loading={Math.abs(i - at) <= 1 ? "eager" : "lazy"} draggable={false} />
          ))}
          {n > 1 && (
            <>
              <button type="button" className="lb-pil lb-forrige" aria-label={tr("Forrige")} onClick={() => step(-1)}>
                ‹
              </button>
              <button type="button" className="lb-pil lb-naeste" aria-label={tr("Næste")} onClick={() => step(1)}>
                ›
              </button>
            </>
          )}
        </div>
      )}
      {!state.focus && n > 1 && (
        <div className="lb-thumbs">
          {state.images.map((src, i) => (
            <button key={src} type="button" className={i === at ? "on" : ""} onClick={() => setAt(i)} aria-label={`${i + 1}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** A plan zoomed in on one area (outlined, the rest a touch darker) - or all of it. */
function PlanView({ src, focus }: { src: string; focus: [number, number, number, number] }) {
  const tr = useT();
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ iw: number; ih: number; cw: number; ch: number } | null>(null);
  const [whole, setWhole] = useState(false);
  useEffect(() => {
    const onResize = () => setSize((s) => (s && box.current ? { ...s, cw: box.current.clientWidth, ch: box.current.clientHeight } : s));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  let style: React.CSSProperties = { opacity: 0 };
  let ring: React.CSSProperties | null = null;
  if (size) {
    const { iw, ih, cw, ch } = size;
    const [x1, y1, x2, y2] = focus;
    const fit = Math.min(cw / iw, ch / ih);
    const zoom = Math.max(fit, Math.min((cw * 0.66) / ((x2 - x1) * iw), (ch * 0.6) / ((y2 - y1) * ih), fit * 3.2)); // room around the area, so you see where on the site it is
    const s = whole ? fit : zoom;
    const W = iw * s;
    const H = ih * s;
    // Centred on the area, but never past the plan's edges (no empty band when the area lies near one).
    const clampTo = (v: number, size: number, box: number) => (size <= box ? (box - size) / 2 : Math.min(0, Math.max(box - size, v)));
    const left = whole ? (cw - W) / 2 : clampTo(cw / 2 - ((x1 + x2) / 2) * W, W, cw);
    const top = whole ? (ch - H) / 2 : clampTo(ch / 2 - ((y1 + y2) / 2) * H, H, ch);
    style = { width: W, height: H, transform: `translate(${left}px, ${top}px)` };
    ring = { left: left + x1 * W, top: top + y1 * H, width: (x2 - x1) * W, height: (y2 - y1) * H };
  }
  return (
    <div ref={box} className="lb-plan">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        draggable={false}
        style={style}
        onLoad={(e) => box.current && setSize({ iw: e.currentTarget.naturalWidth, ih: e.currentTarget.naturalHeight, cw: box.current.clientWidth, ch: box.current.clientHeight })}
      />
      {ring && <i className="lb-ring" style={ring} />}
      <button type="button" className="lb-whole" onClick={() => setWhole((w) => !w)}>
        {whole ? tr("Zoom ind") : tr("Se hele kortet")}
      </button>
    </div>
  );
}

export const LIGHTBOX_CSS = `
.lb{position:absolute;inset:0;z-index:45;display:flex;flex-direction:column;background:rgba(8,12,14,.94);color:#fff;animation:hvFade .2s ease;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
.lb-head{display:flex;align-items:center;gap:12px;padding:14px 16px 10px}
.lb-head b{font-family:var(--font-heading);font-size:18px;font-weight:800}
.lb-head span{font-size:13px;opacity:.7;font-variant-numeric:tabular-nums}
.lb-head button{margin-left:auto;width:38px;height:38px;border:0;border-radius:50%;background:rgba(255,255,255,.14);color:#fff;font-size:22px;line-height:1;cursor:pointer}
.lb-stage{position:relative;flex:1;min-height:0;margin:0 12px}
.lb-stage img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;opacity:0;transition:opacity .3s ease;user-select:none}
.lb-stage img.on{opacity:1}
.lb-pil{position:absolute;top:50%;translate:0 -50%;width:46px;height:46px;border:0;border-radius:50%;background:rgba(255,255,255,.16);color:#fff;font-size:30px;line-height:1;cursor:pointer;backdrop-filter:blur(6px)}
.lb-pil:hover{background:rgba(255,255,255,.28)}
.lb-forrige{left:6px}.lb-naeste{right:6px}
.lb-thumbs{display:flex;justify-content:center;gap:8px;padding:12px 12px calc(14px + env(safe-area-inset-bottom,0px));overflow-x:auto;scrollbar-width:none}
.lb-thumbs button{flex:none;width:64px;height:44px;padding:0;border:2px solid transparent;border-radius:8px;overflow:hidden;background:none;opacity:.55;cursor:pointer}
.lb-thumbs button.on{border-color:#fff;opacity:1}
.lb-thumbs img{width:100%;height:100%;object-fit:cover}
.lb-plan{position:relative;flex:1;min-height:0;overflow:hidden}
.lb-plan img{position:absolute;left:0;top:0;max-width:none;transition:transform .5s cubic-bezier(.2,.7,.2,1),width .5s cubic-bezier(.2,.7,.2,1),height .5s cubic-bezier(.2,.7,.2,1);user-select:none}
.lb-ring{position:absolute;border:3px solid var(--c-accent);border-radius:10px;box-shadow:0 0 0 9999px rgba(8,12,14,.35);pointer-events:none;transition:all .5s cubic-bezier(.2,.7,.2,1)}
.lb-whole{position:absolute;left:50%;bottom:calc(16px + env(safe-area-inset-bottom,0px));translate:-50% 0;border:0;border-radius:999px;padding:10px 18px;background:#fff;color:var(--c-main);font:inherit;font-weight:800;font-size:14px;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.35)}
@media (max-width:760px){.lb-pil{display:none}.lb-thumbs button{width:52px;height:36px}}
`;
