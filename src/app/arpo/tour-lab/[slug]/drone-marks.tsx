"use client";

import { useEffect, useRef } from "react";
import type { DroneMark } from "../tours/types";

/*
 * Marks on the 360° drone photo for a moment of "En linje på": e.g. "Skolen"
 * and "Gården" with a dashed line between them - so it's seen where the line
 * is, compared to the school. Placed by yaw/pitch and drawn every frame with
 * the photo's own view, so they stay put when the visitor turns.
 */

type Viewer = { getYaw(): number; getPitch(): number; getHfov(): number; lookAt(pitch: number, yaw: number, hfov: number, ms: number): void };
const rad = Math.PI / 180;

function project(yaw: number, pitch: number, v: { yaw: number; pitch: number; hfov: number; w: number; h: number }) {
  const f = v.w / 2 / Math.tan((v.hfov * rad) / 2);
  const d = [Math.cos(pitch * rad) * Math.sin(yaw * rad), Math.sin(pitch * rad), Math.cos(pitch * rad) * Math.cos(yaw * rad)];
  const sy = Math.sin(v.yaw * rad), cy = Math.cos(v.yaw * rad), sp = Math.sin(v.pitch * rad), cp = Math.cos(v.pitch * rad);
  const F = [cp * sy, sp, cp * cy];
  const R = [cy, 0, -sy];
  const U = [-sp * sy, cp, -sp * cy];
  const z = d[0] * F[0] + d[1] * F[1] + d[2] * F[2];
  if (z < 0.05) return null;
  const x = d[0] * R[0] + d[2] * R[2];
  const y = d[0] * U[0] + d[1] * U[1] + d[2] * U[2];
  return { x: v.w / 2 + (x / z) * f, y: v.h / 2 - (y / z) * f };
}

export function DroneMarks({ marks, viewer }: { marks: DroneMark[]; viewer: () => Viewer | null }) {
  const box = useRef<HTMLDivElement>(null);
  const pins = useRef<(HTMLDivElement | null)[]>([]);
  const path = useRef<SVGPathElement>(null);
  // Turned so every mark is in view (a moment after the tour has flown to its place).
  useEffect(() => {
    if (marks.length < 2) return;
    const t = window.setTimeout(() => {
      const v = viewer();
      const el = box.current;
      if (!v || !el) return;
      const base = marks[0].yaw;
      const ys = marks.map((m) => base + ((((m.yaw - base) % 360) + 540) % 360) - 180);
      const lo = Math.min(...ys), hi = Math.max(...ys);
      const ps = marks.map((m) => m.pitch);
      const aspect = el.clientWidth / Math.max(1, el.clientHeight);
      const span = Math.max(hi - lo, (Math.max(...ps) - Math.min(...ps)) * aspect);
      const hfov = Math.min(120, Math.max(40, span * 1.6));
      v.lookAt(Math.max(-80, (Math.max(...ps) + Math.min(...ps)) / 2 - 4), (lo + hi) / 2, hfov, 1200);
    }, 1400);
    return () => window.clearTimeout(t);
  }, [marks, viewer]);
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const v = viewer();
      const el = box.current;
      if (!v || !el) return;
      const view = { yaw: v.getYaw(), pitch: v.getPitch(), hfov: v.getHfov(), w: el.clientWidth, h: el.clientHeight };
      const pts = marks.map((m) => project(m.yaw, m.pitch, view));
      pts.forEach((p, i) => {
        const pin = pins.current[i];
        if (!pin) return;
        pin.style.visibility = p ? "visible" : "hidden";
        if (p) pin.style.transform = `translate(${p.x}px, ${p.y}px)`;
      });
      // A dashed curve from mark to mark (bowed up a little, like a route seen from above).
      const seg: string[] = [];
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i], b = pts[i + 1];
        if (!a || !b) continue;
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 - Math.hypot(b.x - a.x, b.y - a.y) * 0.18;
        seg.push(`M${a.x.toFixed(1)},${a.y.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`);
      }
      path.current?.setAttribute("d", seg.join(" "));
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [marks, viewer]);
  return (
    <div ref={box} className="dm" aria-hidden>
      <svg className="dm-svg">
        <path ref={path} className="dm-linje" />
      </svg>
      {marks.map((m, i) => (
        <div key={i} ref={(el) => void (pins.current[i] = el)} className={`dm-pin ${i === 0 ? "dm-her" : "dm-der"}`}>
          <span className="dm-prik" />
          <span className="dm-navn">{m.label}</span>
        </div>
      ))}
      <style>{DM_CSS}</style>
    </div>
  );
}

const DM_CSS = `
.dm{position:absolute;inset:0;z-index:4;pointer-events:none;animation:hvFade .5s ease}
.dm-svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.dm-linje{fill:none;stroke:#fff;stroke-width:3;stroke-linecap:round;stroke-dasharray:2 9;filter:drop-shadow(0 1px 3px rgba(0,0,0,.5));animation:dmGaa 1.2s linear infinite}
@keyframes dmGaa{to{stroke-dashoffset:-22}}
.dm-pin{position:absolute;left:0;top:0;will-change:transform}
.dm-prik{position:absolute;left:0;top:0;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:var(--c-accent,#1a8c3a);border:3px solid #fff;box-shadow:0 0 0 0 rgba(255,255,255,.7),0 2px 8px rgba(0,0,0,.4);animation:dmPuls 2s ease-out infinite}
.dm-her .dm-prik{background:var(--c-main,#1d2a30)}
@keyframes dmPuls{0%{box-shadow:0 0 0 0 rgba(255,255,255,.7),0 2px 8px rgba(0,0,0,.4)}100%{box-shadow:0 0 0 18px rgba(255,255,255,0),0 2px 8px rgba(0,0,0,.4)}}
.dm-navn{position:absolute;left:0;bottom:16px;translate:-50% 0;white-space:nowrap;padding:7px 14px;border-radius:999px;background:#fff;color:var(--c-main,#1d2a30);font-weight:800;font-size:15px;line-height:1.1;box-shadow:0 6px 18px rgba(0,0,0,.3)}
.dm-der .dm-navn{background:var(--c-accent,#1a8c3a);color:var(--c-on-accent,#fff)}
@media (max-width:640px){.dm-navn{font-size:13px;padding:6px 11px}}
@media (prefers-reduced-motion:reduce){.dm-linje,.dm-prik{animation:none}}
`;
