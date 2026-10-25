"use client";

import { useEffect, useRef } from "react";
import type { MeasurementData, MpSdk, Vec3 } from "../matterport";
import { inFront } from "./info";

/** A saved measurement in the viewer's own coordinates. */
export type Measurement = { label: string; points: Vec3[] };

/** The viewer's measurements in one shape (newer ones have points, older ones start/end). */
export function fromViewer(list: MeasurementData[]): Measurement[] {
  return list
    .map((m) => ({ label: m.label ?? "", points: m.points?.length ? m.points : m.start && m.end ? [m.start, m.end] : [] }))
    .filter((m) => m.points.length >= 2);
}

const length = (m: Measurement) => m.points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - m.points[i].x, p.y - m.points[i].y, p.z - m.points[i].z), 0);

/**
 * The model's saved measurements drawn over the tour - a line with its length -
 * only the ones near the visitor, so walls don't show measurements behind them.
 */
export function MeasureLines({
  sdk,
  measurements,
  frame,
}: {
  sdk: MpSdk | null;
  measurements: Measurement[];
  frame: React.RefObject<HTMLIFrameElement | null>;
}) {
  const svg = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!sdk?.Conversion) return;
    const conv = sdk.Conversion;
    const items = measurements.map((m) => ({ pts: m.points, text: m.label || `${length(m).toFixed(2).replace(".", ",")} m` }));
    const sub = sdk.Camera.pose.subscribe((pose) => {
      const el = frame.current;
      const root = svg.current;
      if (!el || !root) return;
      const size = { w: el.clientWidth, h: el.clientHeight };
      let html = "";
      for (const it of items) {
        const near = it.pts.some((p) => Math.hypot(p.x - pose.position.x, p.z - pose.position.z) < 5);
        if (!near || !it.pts.every((p) => inFront(pose, p))) continue;
        const s = it.pts.map((p) => conv.worldToScreen(p, pose, size));
        const d = s.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join("");
        const mid = { x: (s[0].x + s[s.length - 1].x) / 2, y: (s[0].y + s[s.length - 1].y) / 2 };
        html += `<path d="${d}" class="ms-shadow"/><path d="${d}" class="ms-line"/>`;
        html += s.map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" class="ms-end"/>`).join("");
        html += `<g transform="translate(${mid.x.toFixed(1)},${mid.y.toFixed(1)})"><rect x="-34" y="-14" width="68" height="28" rx="14" class="ms-pill"/><text class="ms-text" text-anchor="middle" dy="5">${it.text.replace(/[<&]/g, "")}</text></g>`;
      }
      root.innerHTML = html;
    });
    return () => sub.cancel();
  }, [sdk, measurements, frame]);
  return <svg ref={svg} className="ms" aria-hidden />;
}

export const MEASURES_CSS = `
.ms{position:absolute;inset:0;width:100%;height:100%;z-index:4;pointer-events:none;overflow:visible}
.ms-shadow{fill:none;stroke:rgba(0,0,0,.45);stroke-width:5;stroke-linecap:round}
.ms-line{fill:none;stroke:#fff;stroke-width:2.5;stroke-linecap:round}
.ms-end{fill:#fff;stroke:rgba(0,0,0,.45);stroke-width:1.5}
.ms-pill{fill:#fff;filter:drop-shadow(0 2px 4px rgba(0,0,0,.35))}
.ms-text{font:800 14px system-ui,sans-serif;fill:#1d2a30}
.hv-maal{position:absolute;top:14px;right:14px;z-index:8;display:flex;align-items:center;gap:7px;border:0;border-radius:999px;padding:9px 16px;background:rgba(255,255,255,.95);color:var(--c-main);font:inherit;font-weight:800;font-size:14px;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.25)}
.hv-maal svg{width:18px;height:18px}
.hv-maal.aktiv{background:var(--c-main);color:#fff}
.hv:has(.hv-menuknap) .hv-maal{top:66px}
@media (max-width:760px){.hv-maal{top:12px;right:10px}.hv:has(.hv-menuknap) .hv-maal{top:62px}}
`;
