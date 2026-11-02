"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { SiteUnit, TourConfig } from "../tours/types";
import type { SitePlanState } from "./site-plan";
import { quadPoint, quadSolve } from "./staging";

/*
 * "Pladskort" on the 360° aerial photo: the site plan lies on the ground in
 * the 360° scene and stays there while the visitor turns and zooms. Its four
 * corners are points on the 360° photo (x, y in % of it - like the points);
 * from where the drone hung, they are spots on the ground, and the plan is
 * stretched between them. Every frame the plan is drawn as a grid of small
 * tiles, each bent onto the screen on its own (a flat piece of ground is a
 * plain perspective picture of it) - tiles behind the viewer are left out.
 * The free pitches are dots on the ground, the same way.
 */

const BOX = 1000;
const GRID = 12;
const rad = Math.PI / 180;

type Viewer = { getYaw(): number; getPitch(): number; getHfov(): number };
type Pt = { x: number; y: number };

/** The 360° photo has the plan on it: a 360° start picture (it was a 360° map) with its four corners. */
export const sitePlan360Ready = (T: TourConfig) => Boolean(!T.map && T.drone?.panorama && T.sitePlan?.overlay?.corners?.length === 4);

/** A spot on the 360° photo (x, y in %) as a direction (x right, y up, z ahead at yaw 0). */
export function dirOf([x, y]: [number, number]): [number, number, number] {
  const yaw = ((x / 100) * 360 - 180) * rad;
  const pitch = (90 - (y / 100) * 180) * rad;
  return [Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw)];
}

/** Where a spot below the horizon hits the ground (the drone 1 unit up) - null above it. */
export function groundOf(spot: [number, number]): Pt | null {
  const d = dirOf(spot);
  if (d[1] > -0.01) return null;
  return { x: d[0] / -d[1], y: d[2] / -d[1] };
}

/** A spot on the ground back to the 360° photo (x, y in %). */
export function spotOfGround(g: Pt): [number, number] {
  const yaw = Math.atan2(g.x, g.y) / rad;
  const pitch = Math.atan2(-1, Math.hypot(g.x, g.y)) / rad;
  return [Math.round(((yaw + 180) / 360) * 1000) / 10, Math.round(((90 - pitch) / 180) * 1000) / 10];
}

/** The plan (BOX x BOX) onto the ground - null when a corner isn't on the ground. */
export function planToGround(corners: [number, number][]): number[] | null {
  const g = corners.map(groundOf);
  if (g.some((p) => !p)) return null;
  return quadSolve(BOX, BOX, g as Pt[]);
}

/** A ground spot on the screen for the view (yaw, pitch, hfov) - null behind the viewer. */
function project(g: Pt, v: { yaw: number; pitch: number; f: number; w: number; h: number }): Pt | null {
  const d = [g.x, -1, g.y];
  const sy = Math.sin(v.yaw * rad);
  const cy = Math.cos(v.yaw * rad);
  const sp = Math.sin(v.pitch * rad);
  const cp = Math.cos(v.pitch * rad);
  const F = [cp * sy, sp, cp * cy];
  const R = [cy, 0, -sy];
  const U = [-sp * sy, cp, -sp * cy];
  const z = d[0] * F[0] + d[1] * F[1] + d[2] * F[2];
  if (z < 0.05) return null;
  const x = d[0] * R[0] + d[2] * R[2];
  const y = d[0] * U[0] + d[1] * U[1] + d[2] * U[2];
  return { x: v.w / 2 + (x / z) * v.f, y: v.h / 2 - (y / z) * v.f };
}

const TILE = BOX / GRID;

/** In the 360° scene (over the picture, under its points): the plan on the ground and the free units. */
export function SitePlan360Layer({
  T,
  viewer,
  scene,
  state,
  onPick,
}: {
  T: TourConfig;
  viewer: () => Viewer | null;
  /** The 360° viewer's box: the plan goes into its picture, under its points (which stay on top to tap). */
  scene: React.RefObject<HTMLDivElement | null>;
  state: SitePlanState;
  onPick: (u: SiteUnit) => void;
}) {
  const plan = T.sitePlan;
  const box = useRef<HTMLDivElement>(null);
  const tiles = useRef<(HTMLDivElement | null)[]>([]);
  const dots = useRef(new Map<string, HTMLButtonElement>());
  const corners = plan?.overlay?.corners;
  const toGround = useMemo(() => (corners ? planToGround(corners) : null), [corners]);
  const free = useMemo(() => (plan?.units ?? []).filter((u) => state.free?.has(u.id)), [plan?.units, state.free]);
  /** The viewer's picture layer (made when the viewer has loaded) - the plan is drawn there. */
  const [under, setUnder] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!state.on || under?.isConnected) return;
    const find = () => {
      const el = scene.current?.querySelector<HTMLElement>(".pnlm-render-container");
      if (el) setUnder(el);
      return Boolean(el);
    };
    if (find()) return;
    const t = window.setInterval(() => find() && window.clearInterval(t), 300);
    return () => window.clearInterval(t);
  }, [state.on, under, scene]);

  useEffect(() => {
    if (!state.on || !toGround) return;
    let frame = 0;
    let last = "";
    const draw = () => {
      frame = requestAnimationFrame(draw);
      const v = viewer();
      const el = box.current;
      if (!v || !el) return;
      const w = el.clientWidth;
      const h = el.clientHeight;
      const view = { yaw: v.getYaw(), pitch: v.getPitch(), f: w / 2 / Math.tan((v.getHfov() / 2) * rad), w, h };
      const key = `${view.yaw.toFixed(3)},${view.pitch.toFixed(3)},${view.f.toFixed(2)},${w},${h},${free.length}`;
      if (key === last) return;
      // Drawn again until the plan's tiles are in the viewer's picture (they come a moment after it).
      if (tiles.current[0]?.isConnected) last = key;
      const at = (u: number, t: number) => project(quadPoint(toGround, u, t), view);
      for (let j = 0; j < GRID; j++)
        for (let i = 0; i < GRID; i++) {
          const tile = tiles.current[j * GRID + i];
          if (!tile) continue;
          const u0 = i * TILE;
          const t0 = j * TILE;
          // A hair bigger than the tile, so no seams show between them.
          const q = [at(u0, t0), at(u0 + TILE + 0.6, t0), at(u0 + TILE + 0.6, t0 + TILE + 0.6), at(u0, t0 + TILE + 0.6)];
          const c = q.every(Boolean) ? quadSolve(TILE + 0.6, TILE + 0.6, q as Pt[]) : null;
          if (!c) {
            tile.style.visibility = "hidden";
            continue;
          }
          const [a0, a1, a2, b0, b1, b2, c0, c1] = c;
          tile.style.visibility = "visible";
          tile.style.transform = `matrix3d(${a0},${b0},0,${c0},${a1},${b1},0,${c1},0,0,1,0,${a2},${b2},0,1)`;
        }
      for (const u of free) {
        const dot = dots.current.get(u.id);
        if (!dot) continue;
        const p = project(quadPoint(toGround, (u.x / 100) * BOX, (u.y / 100) * BOX), view);
        dot.style.visibility = p ? "visible" : "hidden";
        if (p) dot.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
      }
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [state.on, toGround, free, viewer]);

  if (!plan || !toGround) return null;
  const opacity = Math.min(1, Math.max(0.2, plan.overlay?.opacity ?? 0.55));
  const planEl = <div className="pk360-plan" style={{ opacity: state.on ? opacity : 0 }}>
        {Array.from({ length: GRID * GRID }, (_, n) => {
          const i = n % GRID;
          const j = Math.floor(n / GRID);
          return (
            <div
              key={n}
              ref={(el) => void (tiles.current[n] = el)}
              className="pk360-tile"
              style={{ width: TILE + 0.6, height: TILE + 0.6, backgroundImage: `url("${plan.image.replace(/["\\\n]/g, encodeURIComponent)}")`, backgroundSize: `${BOX}px ${BOX}px`, backgroundPosition: `${-i * TILE}px ${-j * TILE}px`, visibility: "hidden" }}
            />
          );
        })}
      </div>;
  return (
    <div ref={box} className="pk360" aria-hidden={!state.on} style={{ opacity: state.on ? 1 : 0, visibility: state.on ? "visible" : "hidden" }}>
      {under && createPortal(planEl, under)}
      {state.on &&
        free.map((u) => (
          <button
            key={u.id}
            ref={(el) => void (el ? dots.current.set(u.id, el) : dots.current.delete(u.id))}
            type="button"
            className={`pk-unit pk360-unit ${state.picked?.id === u.id ? "valgt" : ""}`}
            style={{ visibility: "hidden" }}
            aria-label={u.name}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onPick(u);
            }}
          >
            {state.picked?.id === u.id && <span>{u.name}</span>}
          </button>
        ))}
    </div>
  );
}

export const SITE_PLAN_360_CSS = `
.pk360{position:absolute;inset:0;z-index:1;pointer-events:none;overflow:hidden;transition:opacity .35s ease}
.pk360-plan{position:absolute;inset:0;z-index:1;pointer-events:none;overflow:hidden;transition:opacity .35s ease}
.pk360-tile{position:absolute;left:0;top:0;transform-origin:0 0;background-repeat:no-repeat;backface-visibility:hidden}
.pk360-unit{left:0;top:0;pointer-events:auto;animation:none}
`;
