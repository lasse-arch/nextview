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
  /** How a picture opens on an upright phone (the tour's imageView "phone"): the whole picture, or how much of the height it fills. */
  phone?: "fit" | number;
} | null;

export function Lightbox({ state, onClose }: { state: NonNullable<LightboxState>; onClose: () => void }) {
  const tr = useT();
  const [at, setAt] = useState(state.at);
  const n = state.images.length;
  const step = (d: number) => setAt((i) => (i + d + n) % n);
  const touch = useRef<number | null>(null);
  /** A phone held upright and a wide picture: it fills the screen's height and is dragged sideways - not a thin strip in the middle. */
  const [fill, setFill] = useState(state.phone !== "fit");
  const share = typeof state.phone === "number" ? Math.min(1, Math.max(0.5, state.phone)) : 1;
  const [ratios, setRatios] = useState<Record<string, number>>({});
  const [upright, setUpright] = useState(false);
  useEffect(() => {
    const check = () => setUpright(window.innerWidth <= 760 && window.innerHeight > window.innerWidth);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  const src = state.images[at];
  const wide = upright && (ratios[src] ?? 0) > 1.15;
  const pan = useRef<HTMLDivElement>(null);
  const [hint, setHint] = useState(true);
  /** Which part of the wide picture is on the screen (0-1 from the left, and how much of it) - the little bar at the bottom. */
  const [view, setView] = useState<{ at: number; size: number } | null>(null);
  const peek = useRef(0);
  const touched = () => {
    cancelAnimationFrame(peek.current);
    if (hint) setHint(false);
  };
  const measure = () => {
    const box = pan.current;
    if (!box || !box.scrollWidth) return;
    setView({ at: box.scrollLeft / box.scrollWidth, size: box.clientWidth / box.scrollWidth });
  };
  /*
   * Opened: the picture glides a little to one side and the other and back,
   * so one sees at once that there's more of it - as the place cards do.
   */
  function glide(box: HTMLDivElement) {
    const mid = box.scrollLeft;
    const reach = Math.min(70, (box.scrollWidth - box.clientWidth) / 2);
    if (reach < 8 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const start = performance.now() + 450;
    const dur = 2200;
    const step = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / dur));
      // Out to the right, over to the left, back to the middle - one soft sway.
      box.scrollLeft = mid + reach * Math.sin(t * Math.PI * 2) * (1 - t * 0.15);
      if (t < 1) peek.current = requestAnimationFrame(step);
      else box.scrollLeft = mid;
    };
    peek.current = requestAnimationFrame(step);
  }
  useEffect(() => () => cancelAnimationFrame(peek.current), []);

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
    <div className={`lb ${wide && fill ? "lb-fyld" : ""}`} role="dialog" aria-modal="true" aria-label={state.title}>
      {/* The picture itself, blurred, behind it - instead of a black frame round a small picture. */}
      {!state.focus && <div className="lb-bg" style={{ backgroundImage: `url("${src.replace(/"/g, "%22")}")` }} />}
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
      ) : wide && fill ? (
        <div
          ref={pan}
          className="lb-pan"
          onTouchStart={touched}
          onWheel={touched}
          onMouseDown={touched}
          onScroll={measure}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={src}
            src={src}
            alt={state.title}
            draggable={false}
            style={share < 1 ? { height: `${share * 100}%`, marginTop: `${((1 - share) / 2) * 100}dvh` } : undefined}
            onLoad={(e) => {
              const box = pan.current;
              if (!box) return;
              box.scrollLeft = (e.currentTarget.clientWidth - box.clientWidth) / 2;
              measure();
              glide(box);
            }}
          />
        </div>
      ) : null}
      {wide && fill && !state.focus && (
        <>
          {/* Over the picture (not in it, or it would scroll away): a hand showing the way, until one touches it. */}
          {hint && (
            <span className="lb-hint" aria-hidden>
              <svg viewBox="0 0 24 24" className="lb-haand">
                <path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11m0-1.5a1.5 1.5 0 0 1 3 0V11m0-.5a1.5 1.5 0 0 1 3 0v4a6 6 0 0 1-6 6h-.6a6 6 0 0 1-4.6-2.2L4.6 15a1.5 1.5 0 0 1 2.3-1.9L9 15" />
              </svg>
              {tr("Træk for at se hele billedet")}
            </span>
          )}
          {view && view.size < 0.98 && (
            <span className={`lb-mini ${n > 1 ? "lb-mini-op" : ""}`} aria-hidden>
              <i style={{ left: `${view.at * 100}%`, width: `${view.size * 100}%` }} />
            </span>
          )}
        </>
      )}
      {state.focus || (wide && fill) ? null : (
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
            <img
              key={src}
              src={src}
              alt={i === at ? state.title : ""}
              className={i === at ? "on" : ""}
              loading={Math.abs(i - at) <= 1 ? "eager" : "lazy"}
              draggable={false}
              onLoad={(e) => {
                const r = e.currentTarget.naturalWidth / Math.max(1, e.currentTarget.naturalHeight);
                setRatios((x) => (x[src] === r ? x : { ...x, [src]: r }));
              }}
            />
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
      {wide && (
        <button type="button" className="lb-fit" onClick={() => (setFill((f) => !f), setHint(false))}>
          {fill ? tr("Se hele billedet") : tr("Fyld skærmen")}
        </button>
      )}
      {wide && fill && n > 1 && (
        <div className="lb-skift">
          <button type="button" aria-label={tr("Forrige")} onClick={() => (step(-1), setHint(false))}>
            ‹
          </button>
          <button type="button" aria-label={tr("Næste")} onClick={() => (step(1), setHint(false))}>
            ›
          </button>
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
.lb-bg{position:absolute;inset:-40px;background-size:cover;background-position:center;filter:blur(28px) brightness(.45) saturate(1.2);opacity:.9;pointer-events:none}
.lb>*:not(.lb-bg){position:relative}
.lb-head{display:flex;align-items:center;gap:12px;padding:calc(14px + env(safe-area-inset-top,0px)) 16px 10px}
.lb-pan{flex:1;min-height:0;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;scrollbar-width:none;overscroll-behavior:contain}
.lb-pan::-webkit-scrollbar{display:none}
.lb-pan img{display:block;height:100%;width:auto;max-width:none;user-select:none}
/* Filling the screen: the picture edge to edge, the title and the buttons floating over it. */
.lb.lb-fyld .lb-head{position:absolute;top:0;left:0;right:0;z-index:2;background:linear-gradient(rgba(0,0,0,.6),rgba(0,0,0,0));padding-bottom:28px;text-shadow:0 1px 6px rgba(0,0,0,.5)}
.lb.lb-fyld .lb-pan{position:absolute;inset:0}
.lb-fit{white-space:nowrap}
.lb.lb-fyld .lb-fit{position:absolute;left:50%;bottom:calc(18px + env(safe-area-inset-bottom,0px));translate:-50% 0;margin:0;z-index:2;background:rgba(0,0,0,.45);box-shadow:0 6px 20px rgba(0,0,0,.3)}
.lb.lb-fyld .lb-thumbs{position:absolute;left:0;right:0;bottom:calc(64px + env(safe-area-inset-bottom,0px));z-index:2;padding-bottom:0}
.lb-stage img.on{filter:drop-shadow(0 14px 34px rgba(0,0,0,.45))}
.lb-hint{position:absolute!important;left:50%;top:50%;z-index:2;translate:-50% -50%;display:flex;align-items:center;gap:9px;padding:10px 17px 10px 13px;border-radius:999px;background:rgba(0,0,0,.5);color:#fff;font-size:14px;font-weight:700;white-space:nowrap;pointer-events:none;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);box-shadow:0 8px 26px rgba(0,0,0,.3);animation:lbHint 9s ease forwards}
.lb-haand{width:24px;height:24px;flex:none;fill:none;stroke:#fff;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;animation:lbHaand 1.6s ease-in-out infinite}
@keyframes lbHint{0%{opacity:0;scale:.92}6%,82%{opacity:1;scale:1}100%{opacity:0}}
@keyframes lbHaand{0%,100%{translate:-7px 0;rotate:-8deg}50%{translate:7px 0;rotate:8deg}}
/* Where on the wide picture one is - like the strip under a panorama photo. */
.lb-mini{position:absolute!important;left:50%;bottom:calc(70px + env(safe-area-inset-bottom,0px));z-index:2;translate:-50% 0;width:76px;height:5px;border-radius:999px;background:rgba(255,255,255,.28);overflow:hidden;pointer-events:none;box-shadow:0 2px 8px rgba(0,0,0,.25)}
.lb-mini.lb-mini-op{bottom:calc(126px + env(safe-area-inset-bottom,0px))}
.lb-mini i{position:absolute;top:0;bottom:0;border-radius:999px;background:#fff}
@media (prefers-reduced-motion:reduce){.lb-haand{animation:none}}
.lb-fit{align-self:center;margin:10px auto calc(14px + env(safe-area-inset-bottom,0px));border:0;border-radius:999px;padding:9px 16px;background:rgba(255,255,255,.16);color:#fff;font:inherit;font-weight:700;font-size:13.5px;cursor:pointer;backdrop-filter:blur(6px)}
.lb-skift{position:absolute!important;left:0;right:0;top:50%;display:flex;justify-content:space-between;padding:0 8px;pointer-events:none}
.lb-skift button{pointer-events:auto;width:40px;height:40px;border:0;border-radius:50%;background:rgba(0,0,0,.45);color:#fff;font-size:26px;line-height:1;cursor:pointer}
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
