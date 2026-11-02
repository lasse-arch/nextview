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
  const opacity = Math.min(1, Math.max(0.2, plan?.overlay?.opacity ?? 0.55));
  /** The viewer's picture layer (made when the viewer has loaded) - the plan is drawn there. */
  const [under, setUnder] = useState<HTMLElement | null>(null);
  /** No WebGL here (or the plan picture can't be used in it): the plan as tiles instead. */
  const [tilesOnly, setTilesOnly] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
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

  // Drawn in the same moment as the 360° picture, with the very view it's drawn with: the viewer's own render
  // is followed - so the plan never lags a frame behind when the visitor turns (no judder).
  useEffect(() => {
    if (!state.on || !toGround || !under) return;
    const gl = tilesOnly ? null : startGl(canvas.current, plan!.image, toGround, () => setTilesOnly(true));
    const draw = (pitch: number, yaw: number, hfov: number) => {
      const el = box.current;
      if (!el) return;
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (gl) gl.draw(pitch, yaw, hfov, w, h, opacity);
      const view = { yaw: yaw / rad, pitch: pitch / rad, f: w / 2 / Math.tan(hfov / 2), w, h };
      if (!gl) drawTiles(tiles.current, toGround, view);
      for (const u of free) {
        const dot = dots.current.get(u.id);
        if (!dot) continue;
        const p = project(quadPoint(toGround, (u.x / 100) * BOX, (u.y / 100) * BOX), view);
        dot.style.visibility = p ? "visible" : "hidden";
        if (p) dot.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
      }
    };
    let renderer: { render: (p: number, y: number, h: number, o?: unknown) => void; __pk?: boolean } | null = null;
    let own: ((p: number, y: number, h: number, o?: unknown) => void) | null = null;
    let orig: ((p: number, y: number, h: number, o?: unknown) => void) | null = null;
    // The viewer's renderer is made when its picture has loaded - followed as soon as it's there.
    const hook = () => {
      const v = viewer() as (Viewer & { getRenderer?: () => typeof renderer }) | null;
      const r = v?.getRenderer?.();
      if (!v || !r) return false;
      renderer = r;
      orig = r.render;
      own = function (this: unknown, p, y, h, o) {
        orig!.call(this, p, y, h, o);
        draw(p, y, h);
      };
      r.render = own;
      draw(v.getPitch() * rad, v.getYaw() * rad, v.getHfov() * rad);
      return true;
    };
    let t = 0;
    if (!hook()) t = window.setInterval(() => hook() && window.clearInterval(t), 200);
    // The window changing size: drawn again (the viewer only draws when it moves).
    const resize = () => {
      const v = viewer();
      if (v) draw(v.getPitch() * rad, v.getYaw() * rad, v.getHfov() * rad);
    };
    window.addEventListener("resize", resize);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("resize", resize);
      if (renderer && renderer.render === own && orig) renderer.render = orig;
      gl?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the plan's picture and place are in toGround/plan.image
  }, [state.on, toGround, under, free, viewer, tilesOnly, opacity, plan?.image]);

  if (!plan || !toGround) return null;
  const planEl = tilesOnly ? (
    <div className="pk360-plan" style={{ opacity: state.on ? opacity : 0 }}>
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
    </div>
  ) : (
    <canvas ref={canvas} className="pk360-plan" style={{ opacity: state.on ? 1 : 0 }} />
  );
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

/** Without WebGL: each tile of the plan bent onto the screen on its own. */
function drawTiles(tiles: (HTMLDivElement | null)[], toGround: number[], view: { yaw: number; pitch: number; f: number; w: number; h: number }) {
  const at = (u: number, t: number) => project(quadPoint(toGround, u, t), view);
  for (let j = 0; j < GRID; j++)
    for (let i = 0; i < GRID; i++) {
      const tile = tiles[j * GRID + i];
      if (!tile) continue;
      const u0 = i * TILE;
      const t0 = j * TILE;
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
}

/** The plan (BOX x BOX) to the ground as a 3x3 matrix - and back (ground -> plan, as the shader needs it). */
function groundToPlan(c: number[]): Float32Array {
  const [a0, a1, a2, b0, b1, b2, c0, c1] = c;
  const m = [a0, a1, a2, b0, b1, b2, c0, c1, 1];
  const [a, b, cc, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + cc * C;
  const inv = [A, -(b * i - cc * h), b * f - cc * e, B, a * i - cc * g, -(a * f - cc * d), C, -(a * h - b * g), a * e - b * d].map((x) => x / det);
  // Column-major for WebGL, and to the plan's 0-1.
  const s = 1 / BOX;
  return new Float32Array([inv[0] * s, inv[3] * s, inv[6], inv[1] * s, inv[4] * s, inv[7], inv[2] * s, inv[5] * s, inv[8]]);
}

/**
 * The plan drawn with WebGL in one go: for each pixel, where its line of
 * sight meets the ground, and that spot read from the plan - exact, no seams,
 * nothing behind the viewer. Null (and `fail`) where WebGL can't be used.
 */
function startGl(cv: HTMLCanvasElement | null, image: string, toGround: number[], fail: () => void) {
  const gl = cv?.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: false });
  if (!cv || !gl) {
    fail();
    return null;
  }
  const vs = "attribute vec2 p;varying vec2 v;void main(){v=p;gl_Position=vec4(p,0.,1.);}";
  const fs = `precision highp float;varying vec2 v;uniform vec3 F;uniform vec3 R;uniform vec3 U;uniform vec2 k;uniform mat3 H;uniform sampler2D t;uniform float a;
void main(){vec3 d=F+R*(v.x*k.x)+U*(v.y*k.y);if(d.y>-0.002)discard;vec2 g=vec2(d.x,d.z)/(-d.y);vec3 q=H*vec3(g,1.);vec2 uv=q.xy/q.z;
if(q.z<=0.||uv.x<0.||uv.y<0.||uv.x>1.||uv.y>1.)discard;vec4 c=texture2D(t,uv);gl_FragColor=vec4(c.rgb*c.a*a,c.a*a);}`;
  const sh = (type: number, src: string) => {
    const x = gl.createShader(type)!;
    gl.shaderSource(x, src);
    gl.compileShader(x);
    return x;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    fail();
    return null;
  }
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const u = (n: string) => gl.getUniformLocation(prog, n);
  gl.uniformMatrix3fv(u("H"), false, groundToPlan(toGround));
  const tex = gl.createTexture();
  let ready = false;
  let last: [number, number, number, number, number, number] | null = null;
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    try {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      ready = true;
      if (last) draw(...last);
    } catch {
      fail(); // a picture from another site that doesn't allow it
    }
  };
  img.onerror = fail;
  img.src = image;
  function draw(pitch: number, yaw: number, hfov: number, w: number, h: number, alpha: number) {
    last = [pitch, yaw, hfov, w, h, alpha];
    if (!ready || !cv) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(w * dpr);
    const Hh = Math.round(h * dpr);
    if (cv.width !== W || cv.height !== Hh) {
      cv.width = W;
      cv.height = Hh;
    }
    gl!.viewport(0, 0, W, Hh);
    const sy = Math.sin(yaw);
    const cy = Math.cos(yaw);
    const sp = Math.sin(pitch);
    const cp = Math.cos(pitch);
    gl!.uniform3f(u("F"), cp * sy, sp, cp * cy);
    gl!.uniform3f(u("R"), cy, 0, -sy);
    gl!.uniform3f(u("U"), -sp * sy, cp, -sp * cy);
    const kx = Math.tan(hfov / 2);
    gl!.uniform2f(u("k"), kx, (kx * h) / w);
    gl!.uniform1f(u("a"), alpha);
    gl!.clearColor(0, 0, 0, 0);
    gl!.clear(gl!.COLOR_BUFFER_BIT);
    gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
  }
  return {
    draw,
    dispose() {
      gl.deleteTexture(tex);
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
    },
  };
}

export const SITE_PLAN_360_CSS = `
.pk360{position:absolute;inset:0;z-index:1;pointer-events:none;overflow:hidden;transition:opacity .35s ease}
.pk360-plan{position:absolute;inset:0;width:100%;height:100%;z-index:1;pointer-events:none;overflow:hidden;transition:opacity .35s ease}
.pk360-tile{position:absolute;left:0;top:0;transform-origin:0 0;background-repeat:no-repeat;backface-visibility:hidden}
.pk360-unit{left:0;top:0;pointer-events:auto;animation:none}
`;
