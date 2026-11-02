import { fitPlan } from "./plan-fit";

/*
 * Laying a site plan on the photo by hand, more ways than corners: stretched
 * along its own width or height, one side pulled out, or by pins - a spot on
 * the plan dragged to where it really is on the photo (one pin moves it, two
 * also turn and scale it, three more make it fit them all - the corners
 * follow). Corners are in order: top left, top right, bottom right, bottom left.
 */

export type P = { x: number; y: number };
type H = number[];

const apply = (h: H, x: number, y: number): P => {
  const d = h[6] * x + h[7] * y + 1;
  return { x: (h[0] * x + h[1] * y + h[2]) / d, y: (h[3] * x + h[4] * y + h[5]) / d };
};
const PLAN: [number, number][] = [
  [0, 0],
  [100, 0],
  [100, 100],
  [0, 100],
];

/** The plan (% of it) onto the corners - and back. */
export function planToGround(g: P[]): ((x: number, y: number) => P) | null {
  const f = fitPlan(PLAN.map((p, i) => ({ plan: p, photo: [g[i].x, g[i].y] as [number, number] })));
  return f ? (x, y) => apply(f.h, x, y) : null;
}
export function groundToPlan(g: P[]): ((p: P) => [number, number]) | null {
  const f = fitPlan(g.map((p, i) => ({ plan: [p.x, p.y] as [number, number], photo: PLAN[i] })));
  return f ? (p) => {
    const q = apply(f.h, p.x, p.y);
    return [q.x, q.y];
  } : null;
}

/** Wider/narrower (sx) and taller/lower (sy) along the plan's own sides, around its middle. */
export function stretch(g: P[], sx: number, sy: number): P[] {
  const mid = { x: g.reduce((a, p) => a + p.x, 0) / 4, y: g.reduce((a, p) => a + p.y, 0) / 4 };
  // Its width and height directions: the mean of the top and bottom sides, and of the left and right.
  const U = { x: (g[1].x - g[0].x + g[2].x - g[3].x) / 2, y: (g[1].y - g[0].y + g[2].y - g[3].y) / 2 };
  const V = { x: (g[3].x - g[0].x + g[2].x - g[1].x) / 2, y: (g[3].y - g[0].y + g[2].y - g[1].y) / 2 };
  const det = U.x * V.y - U.y * V.x;
  if (Math.abs(det) < 1e-9) return g;
  return g.map((p) => {
    const dx = p.x - mid.x;
    const dy = p.y - mid.y;
    const a = (dx * V.y - dy * V.x) / det;
    const b = (U.x * dy - U.y * dx) / det;
    return { x: mid.x + a * sx * U.x + b * sy * V.x, y: mid.y + a * sx * U.y + b * sy * V.y };
  });
}

/** One side (0 top, 1 right, 2 bottom, 3 left) moved by d - its two corners together. */
export function moveSide(g: P[], side: number, d: P): P[] {
  const a = side;
  const b = (side + 1) % 4;
  return g.map((p, i) => (i === a || i === b ? { x: p.x + d.x, y: p.y + d.y } : p));
}

/** The middle of a side, for its handle. */
export const sideMid = (g: P[], side: number): P => ({ x: (g[side].x + g[(side + 1) % 4].x) / 2, y: (g[side].y + g[(side + 1) % 4].y) / 2 });

export type Pin = { plan: [number, number]; at: P };

/**
 * The corners that bring every pin's spot on the plan onto its place: one pin
 * moves the plan, two also turn and scale it (its shape kept), three bend it
 * evenly (affine), four or more as close to all as can be (perspective).
 */
export function fitPins(g: P[], pins: Pin[]): P[] {
  const to = planToGround(g);
  if (!to || !pins.length) return g;
  const now = pins.map((p) => to(p.plan[0], p.plan[1]));
  if (pins.length === 1) {
    const d = { x: pins[0].at.x - now[0].x, y: pins[0].at.y - now[0].y };
    return g.map((p) => ({ x: p.x + d.x, y: p.y + d.y }));
  }
  if (pins.length === 2) {
    // z' = a z + b (complex): turned, scaled and moved.
    const [s1, s2] = now;
    const [t1, t2] = [pins[0].at, pins[1].at];
    const sx = s2.x - s1.x;
    const sy = s2.y - s1.y;
    const n = sx * sx + sy * sy;
    if (n < 1e-9) return g;
    const tx = t2.x - t1.x;
    const ty = t2.y - t1.y;
    const ar = (tx * sx + ty * sy) / n;
    const ai = (ty * sx - tx * sy) / n;
    return g.map((p) => {
      const dx = p.x - s1.x;
      const dy = p.y - s1.y;
      return { x: t1.x + ar * dx - ai * dy, y: t1.y + ai * dx + ar * dy };
    });
  }
  if (pins.length === 3) {
    // x' = a x + b y + c, y' = d x + e y + f through the three.
    const m = now.map((s) => [s.x, s.y, 1]);
    const det3 = (A: number[][]) => A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) - A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) + A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);
    const D = det3(m);
    if (Math.abs(D) < 1e-9) return fitPins(g, pins.slice(0, 2));
    const solve = (v: number[]) => [0, 1, 2].map((c) => det3(m.map((row, r) => row.map((x, k) => (k === c ? v[r] : x)))) / D);
    const [a, b, c] = solve(pins.map((p) => p.at.x));
    const [d, e, f] = solve(pins.map((p) => p.at.y));
    return g.map((p) => ({ x: a * p.x + b * p.y + c, y: d * p.x + e * p.y + f }));
  }
  const fit = fitPlan(pins.map((p) => ({ plan: p.plan, photo: [p.at.x, p.at.y] as [number, number] })));
  return fit ? PLAN.map(([x, y]) => apply(fit.h, x, y)) : g;
}
