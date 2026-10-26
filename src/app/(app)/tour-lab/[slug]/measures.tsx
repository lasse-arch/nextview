"use client";

import { useEffect, useRef } from "react";
import type { MpSdk } from "../matterport";

/**
 * While the measurements are shown, Matterport is in measuring mode - where a
 * click would start a new measurement. This layer over the view takes the
 * clicks instead, and turns drags into looking around (and wheel/pinch into
 * zoom) through the SDK, so visitors see the measurements but can't add any.
 */
export function MeasureShield({ sdk }: { sdk: MpSdk | null }) {
  const pose = useRef<{ x: number; y: number } | null>(null);
  const last = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<number | null>(null);
  useEffect(() => {
    if (!sdk) return;
    const sub = sdk.Camera.pose.subscribe((p) => (pose.current = p.rotation));
    return () => sub.cancel();
  }, [sdk]);
  if (!sdk?.Camera.setRotation) return null;
  const cam = sdk.Camera;
  return (
    <div
      className="ms-shield"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        last.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }}
      onPointerMove={(e) => {
        const prev = last.current.get(e.pointerId);
        if (!prev || !pose.current) return;
        last.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (last.current.size === 2) {
          const [a, b] = [...last.current.values()];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (pinch.current != null) cam.zoomBy?.((d - pinch.current) / 300).catch(() => {});
          pinch.current = d;
          return;
        }
        const k = 0.18;
        const next = { x: Math.max(-80, Math.min(80, pose.current.x + (e.clientY - prev.y) * k)), y: pose.current.y + (e.clientX - prev.x) * k };
        pose.current = next;
        cam.setRotation!(next, { speed: 1000 }).catch(() => {});
      }}
      onPointerUp={(e) => {
        last.current.delete(e.pointerId);
        if (last.current.size < 2) pinch.current = null;
      }}
      onPointerCancel={(e) => last.current.delete(e.pointerId)}
      onWheel={(e) => cam.zoomBy?.(-e.deltaY / 800).catch(() => {})}
    />
  );
}

export const MEASURES_CSS = `
.ms-shield{position:absolute;inset:0;z-index:3;touch-action:none;cursor:grab}
.ms-shield:active{cursor:grabbing}
.ms{position:absolute;inset:0;width:100%;height:100%;z-index:4;pointer-events:none;overflow:visible}
.ms-shadow{fill:none;stroke:rgba(0,0,0,.45);stroke-width:5;stroke-linecap:round}
.ms-line{fill:none;stroke:#fff;stroke-width:2.5;stroke-linecap:round}
.ms-end{fill:#fff;stroke:rgba(0,0,0,.45);stroke-width:1.5}
.ms-pill{fill:#fff;filter:drop-shadow(0 2px 4px rgba(0,0,0,.35))}
.ms-text{font:800 14px system-ui,sans-serif;fill:#1d2a30}
.hv-maal{position:absolute;top:14px;right:14px;z-index:8;display:flex;align-items:center;gap:7px;border:0;border-radius:999px;padding:9px 16px;background:rgba(255,255,255,.95);color:var(--c-main);font:inherit;font-weight:800;font-size:14px;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.25)}
.hv-maal svg{width:18px;height:18px}
.hv-maal.aktiv{background:var(--c-main);color:#fff}
.hv:has(.hv-menuknap) .hv-maal,.hv:has(.sp-menuknap) .hv-maal{top:76px}
/*
 * On a touch screen Matterport's measuring mode puts its own "add a point"
 * cross at the bottom of the view - under the tour's buttons, and useless
 * since visitors can't measure. The view is made a little taller than the
 * screen while measuring, so that strip is below the edge.
 */
@media (pointer:coarse){.hv-maler .hv-mp{height:calc(100% + 150px)!important}}
@media (max-width:760px){.hv-maal{top:12px;right:10px}.hv:has(.hv-menuknap) .hv-maal,.hv:has(.sp-menuknap) .hv-maal{top:72px}}
`;
