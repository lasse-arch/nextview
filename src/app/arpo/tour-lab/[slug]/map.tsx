"use client";

import { useT } from "../tours/i18n-react";
import { useEffect, useImperativeHandle, useRef, useState } from "react";
import type { TourConfig, TourPoint } from "../tours/types";

/*
 * A flat start picture instead of the 360° drone scene: an illustrated map,
 * a site plan or a drone photo - something every place has long before the
 * spring drone flight. It zooms and pans like a map (wheel, drag, pinch),
 * the points keep their size and stay on their spots, and it comes alive
 * with a slow zoom in and cloud shadows drifting over it.
 */

export type MapApi = {
  /** Centres a point (optionally zoomed in further) - resolves when the move is done. */
  focus(id: string, zoom?: number, ms?: number): Promise<void>;
  /** Back to the start view. */
  reset(ms?: number): void;
};

type View = { s: number; x: number; y: number };

export function MapScene({
  T,
  api,
  icons,
  hidden,
  selectedId,
  onPoint,
  onZoomed,
}: {
  T: TourConfig;
  api: React.RefObject<MapApi | null>;
  icons: Record<string, string>;
  hidden: Record<string, boolean>;
  selectedId: string | null;
  onPoint: (p: TourPoint) => void;
  onZoomed: (zoomed: boolean) => void;
}) {
  const tr = useT();
  const M = T.map!;
  const box = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View | null>(null);
  const [anim, setAnim] = useState(0);
  const [query, setQuery] = useState("");
  const dragged = useRef(false);
  const viewRef = useRef<View | null>(null);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  /** The smallest zoom that still fills the screen. */
  const fit = () => {
    const el = box.current!;
    return Math.max(el.clientWidth / M.w, el.clientHeight / M.h);
  };
  /** Keeps the picture covering the screen. */
  const clamp = (v: View): View => {
    const el = box.current!;
    const s = Math.min(Math.max(v.s, fit()), fit() * 4);
    return { s, x: Math.min(0, Math.max(el.clientWidth - M.w * s, v.x)), y: Math.min(0, Math.max(el.clientHeight - M.h * s, v.y)) };
  };
  /** A view with the picture's point (px, py in %) in the middle of the screen. */
  const centred = (px: number, py: number, zoom: number): View => {
    const el = box.current!;
    const s = fit() * zoom;
    return clamp({ s, x: el.clientWidth / 2 - (px / 100) * M.w * s, y: el.clientHeight / 2 - (py / 100) * M.h * s });
  };
  const startView = () => {
    const st = (window.innerWidth <= 760 ? M.startMobile : null) ?? M.start ?? { x: 50, y: 50, zoom: 1 };
    return centred(st.x, st.y, st.zoom);
  };
  const go = (v: View, ms: number) => {
    setAnim(ms);
    setView(clamp(v));
  };

  // Opening: a touch closer than the start, then a slow move out to it.
  useEffect(() => {
    const target = startView();
    const first = requestAnimationFrame(() => {
      setAnim(0);
      setView(clamp({ ...target, s: target.s * 1.15, x: target.x - box.current!.clientWidth * 0.075, y: target.y - box.current!.clientHeight * 0.075 }));
    });
    const t = setTimeout(() => go(target, 2400), 80);
    const onResize = () => setView((v) => (v ? clamp(v) : v));
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(first);
      clearTimeout(t);
      window.removeEventListener("resize", onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on mount
  }, []);

  useEffect(() => {
    if (view) onZoomed(view.s > fit() * 1.6);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fit() reads the box
  }, [view, onZoomed]);

  useImperativeHandle(api, () => ({
    focus(id, zoom, ms = 900) {
      const pos = M.spots[id];
      if (!pos) return Promise.resolve();
      // On a computer the point's panel covers the right side - centre it in what's left.
      const shift = window.innerWidth > 760 ? 183 : 0;
      const z = zoom ?? Math.max(1.6, (viewRef.current?.s ?? fit()) / fit());
      const v = centred(pos[0], pos[1], z);
      go({ ...v, x: v.x - shift, y: window.innerWidth <= 760 ? v.y - box.current!.clientHeight * 0.18 : v.y }, ms);
      return new Promise((r) => setTimeout(r, ms));
    },
    reset(ms = 1200) {
      go(startView(), ms);
    },
  }));

  /* ----- Dragging, wheel and pinch ----- */
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; s: number } | null>(null);
  function zoomAt(cx: number, cy: number, s: number) {
    const v = viewRef.current!;
    const k = s / v.s;
    go({ s, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k }, 0);
  }
  const handlers = {
    onPointerDown(e: React.PointerEvent) {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      dragged.current = false;
      if (pointers.current.size === 2) {
        const [a, b] = [...pointers.current.values()];
        pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), s: viewRef.current!.s };
      }
    },
    onPointerMove(e: React.PointerEvent) {
      const last = pointers.current.get(e.pointerId);
      if (!last || !viewRef.current) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.current.size === 2 && pinch.current) {
        const [a, b] = [...pointers.current.values()];
        const r = box.current!.getBoundingClientRect();
        zoomAt((a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, (pinch.current.s * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.current.d);
        dragged.current = true;
        return;
      }
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) dragged.current = true;
      if (dragged.current) {
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        go({ ...viewRef.current, x: viewRef.current.x + dx, y: viewRef.current.y + dy }, 0);
      }
    },
    onPointerUp(e: React.PointerEvent) {
      pointers.current.delete(e.pointerId);
      if (pointers.current.size < 2) pinch.current = null;
    },
    onWheel(e: React.WheelEvent) {
      if (!viewRef.current) return;
      const r = box.current!.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, viewRef.current.s * Math.exp(-e.deltaY * 0.0015));
    },
  };

  const hits = query.trim()
    ? T.points.filter((p) => M.spots[p.id] && p.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 6)
    : [];

  return (
    <div ref={box} className="km" {...handlers} onPointerCancel={handlers.onPointerUp} style={{ touchAction: "none" }}>
      {view && (
        <div
          className="km-bild"
          style={{
            width: M.w,
            height: M.h,
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})`,
            transition: anim ? `transform ${anim}ms cubic-bezier(.22,.7,.2,1)` : "none",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={M.image}
            alt=""
            draggable={false}
            onClick={(e) => {
              // Setting up: Shift-click copies the spot's position (x, y in %) for the tour's setup.
              if (!e.shiftKey) return;
              const r = e.currentTarget.getBoundingClientRect();
              const spot = `[${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}, ${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}]`;
              navigator.clipboard?.writeText(spot).catch(() => {});
              console.info("Kortposition kopieret:", spot);
            }}
          />
          {M.clouds !== false && <div className="km-skyer" />}
          {T.points.map((p, i) => {
            const pos = M.spots[p.id];
            if (!pos) return null;
            return (
              <div
                key={p.id}
                data-punkt={p.id}
                className={`hv-hs hv-hs-${p.cat} km-pin ${hidden[p.cat] ? "hv-skjult" : ""} ${selectedId === p.id ? "hv-aktiv" : ""}`}
                style={{ left: `${pos[0]}%`, top: `${pos[1]}%`, transform: `scale(${(p.size ?? 1) / view.s})`, animationDelay: `${0.9 + i * 0.06}s` }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!dragged.current) onPoint(p);
                }}
              >
                <div className="hv-pkt">
                  <span className="hv-ikon" style={{ background: T.categories[p.cat].color }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: icons[p.icon] ?? "" }} />
                  </span>
                  <span className="hv-navn">{p.name}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="km-soeg" onPointerDown={(e) => e.stopPropagation()}>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={M.searchPlaceholder ?? tr("Søg…")} aria-label={tr("Søg…")} />
        {hits.length > 0 && (
          <ul>
            {hits.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    onPoint(p);
                  }}
                >
                  <i style={{ background: T.categories[p.cat].color }} />
                  {p.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="km-zoom" onPointerDown={(e) => e.stopPropagation()}>
        <button type="button" aria-label={tr("Zoom ind")} onClick={() => view && zoomAt(box.current!.clientWidth / 2, box.current!.clientHeight / 2, view.s * 1.5)}>
          +
        </button>
        <button type="button" aria-label={tr("Zoom ud")} onClick={() => view && zoomAt(box.current!.clientWidth / 2, box.current!.clientHeight / 2, view.s / 1.5)}>
          −
        </button>
      </div>
    </div>
  );
}

export const MAP_CSS = `
.km{position:absolute;inset:0;overflow:hidden;background:#dfe9e4;cursor:grab;user-select:none}
.km:active{cursor:grabbing}
.km-bild{position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform}
.km-bild>img{display:block;width:100%;height:100%}
/* Cloud shadows drifting slowly over the picture. */
.km-skyer{position:absolute;inset:-20% -40%;pointer-events:none;mix-blend-mode:multiply;opacity:.16;
  background:radial-gradient(28% 18% at 20% 30%,#1d2a30,transparent 70%),radial-gradient(22% 14% at 62% 62%,#1d2a30,transparent 70%),radial-gradient(30% 16% at 90% 20%,#1d2a30,transparent 70%);
  animation:kmSkyer 70s linear infinite}
@keyframes kmSkyer{from{transform:translateX(-12%)}to{transform:translateX(12%)}}
.km-pin{position:absolute;width:0;height:0;transform-origin:0 0;animation:kmPop .5s cubic-bezier(.3,1.6,.5,1) both}
@keyframes kmPop{from{opacity:0;translate:0 -14px}to{opacity:1;translate:0 0}}
.km-pin .hv-pkt{position:absolute;left:0;top:0}
.km-soeg{position:absolute;top:calc(14px + env(safe-area-inset-top,0px));left:50%;translate:-50% 0;z-index:6;width:min(320px,calc(100% - 240px))}
.km-soeg input{width:100%;border:0;border-radius:999px;padding:11px 18px;font:inherit;font-size:14px;background:rgba(255,255,255,.95);box-shadow:0 6px 20px rgba(0,0,0,.2);outline:none}
.km-soeg ul{list-style:none;margin:6px 0 0;padding:6px;background:#fff;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.25)}
.km-soeg li button{display:flex;align-items:center;gap:10px;width:100%;border:0;background:none;padding:9px 10px;border-radius:9px;font:inherit;font-size:14px;font-weight:700;color:#1d2a30;cursor:pointer;text-align:left}
.km-soeg li button:hover{background:#f1f3f4}
.km-soeg li i{width:12px;height:12px;border-radius:50%}
.km-zoom{position:absolute;right:16px;bottom:96px;z-index:6;display:flex;flex-direction:column;border-radius:12px;overflow:hidden;box-shadow:0 6px 18px rgba(0,0,0,.22)}
.km-zoom button{width:40px;height:40px;border:0;background:rgba(255,255,255,.95);font-size:20px;font-weight:700;color:#1d2a30;cursor:pointer}
.km-zoom button+button{border-top:1px solid #e5e8ea}
.hv-punkt .km-soeg,.hv-welcome .km-soeg,.hv-welcome .km-zoom{opacity:0;pointer-events:none}
@media (max-width:760px){
  .km-soeg{top:auto;bottom:calc(64px + env(safe-area-inset-bottom,0px));left:10px;right:10px;translate:none;width:auto}
  .km-soeg ul{position:absolute;bottom:100%;left:0;right:0;margin:0 0 6px}
  .km-zoom{display:none}
}
`;
