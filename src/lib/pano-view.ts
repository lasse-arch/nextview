/*
 * A 360° photo (equirectangular, 2:1) and a normal photo of part of it: the
 * view a person looks at (yaw, pitch, horizontal field of view - as the tour's
 * 360° viewer has them) is drawn out as a flat picture, and a changed copy of
 * that picture is laid back in exactly where it came from. Image models only
 * understand normal photos, so "Ret med AI" on a 360° photo edits the view.
 *
 * Directions: x to the right, y up, z straight ahead (yaw 0 = the middle of the
 * picture, yaw grows to the right like the viewer's).
 */

export type PanoView = { yaw: number; pitch: number; hfov: number };

type Basis = { f: number[]; r: number[]; u: number[]; tx: number; ty: number };

function basis(view: PanoView, w: number, h: number): Basis {
  const ya = (view.yaw * Math.PI) / 180;
  const pi = (view.pitch * Math.PI) / 180;
  const tx = Math.tan(((view.hfov * Math.PI) / 180) / 2);
  return {
    f: [Math.cos(pi) * Math.sin(ya), Math.sin(pi), Math.cos(pi) * Math.cos(ya)],
    r: [Math.cos(ya), 0, -Math.sin(ya)],
    u: [-Math.sin(pi) * Math.sin(ya), Math.cos(pi), -Math.sin(pi) * Math.cos(ya)],
    tx,
    ty: (tx * h) / w,
  };
}

/** One pixel of an RGB picture at (x, y), blended from its four neighbours; x wraps round when `wrap`. */
function sample(src: Uint8Array, w: number, h: number, x: number, y: number, out: number[], wrap: boolean) {
  x -= 0.5;
  y -= 0.5;
  const x0 = Math.floor(x);
  const y0 = Math.max(0, Math.min(h - 1, Math.floor(y)));
  const y1 = Math.min(h - 1, y0 + 1);
  const fx = x - x0;
  const fy = Math.max(0, Math.min(1, y - y0));
  const cx = (c: number) => (wrap ? ((c % w) + w) % w : Math.max(0, Math.min(w - 1, c)));
  const a = (y0 * w + cx(x0)) * 3;
  const b = (y0 * w + cx(x0 + 1)) * 3;
  const c = (y1 * w + cx(x0)) * 3;
  const d = (y1 * w + cx(x0 + 1)) * 3;
  for (let k = 0; k < 3; k++) out[k] = (src[a + k] * (1 - fx) + src[b + k] * fx) * (1 - fy) + (src[c + k] * (1 - fx) + src[d + k] * fx) * fy;
}

/** The view as a flat picture (raw RGB, vw × vh) drawn from the 360° photo (raw RGB, w × h). */
export function renderView(equi: Uint8Array, w: number, h: number, view: PanoView, vw: number, vh: number): Buffer {
  const B = basis(view, vw, vh);
  const out = Buffer.alloc(vw * vh * 3);
  const px = [0, 0, 0];
  for (let j = 0; j < vh; j++) {
    const yc = (1 - (2 * (j + 0.5)) / vh) * B.ty;
    for (let i = 0; i < vw; i++) {
      const xc = ((2 * (i + 0.5)) / vw - 1) * B.tx;
      const dx = B.f[0] + xc * B.r[0] + yc * B.u[0];
      const dy = B.f[1] + xc * B.r[1] + yc * B.u[1];
      const dz = B.f[2] + xc * B.r[2] + yc * B.u[2];
      const len = Math.hypot(dx, dy, dz);
      const lon = Math.atan2(dx, dz);
      const lat = Math.asin(dy / len);
      sample(equi, w, h, ((lon + Math.PI) / (2 * Math.PI)) * w, ((Math.PI / 2 - lat) / Math.PI) * h, px, true);
      const o = (j * vw + i) * 3;
      out[o] = px[0];
      out[o + 1] = px[1];
      out[o + 2] = px[2];
    }
  }
  return out;
}

/**
 * Lays a changed view (raw RGB, vw × vh) back into the 360° photo (changed in
 * place), weighted by `mask` (one byte per view pixel: 0 keep the photo, 255
 * use the view) - and faded out towards the view's edges, so no seam shows.
 */
export function pasteView(equi: Uint8Array, w: number, h: number, edited: Uint8Array, mask: Uint8Array, view: PanoView, vw: number, vh: number) {
  const B = basis(view, vw, vh);
  const px = [0, 0, 0];
  // Only the rows the view can reach (its corners' latitudes, with room for the curve).
  const half = Math.atan(Math.hypot(B.tx, B.ty));
  const top = Math.max(0, Math.floor(((Math.PI / 2 - Math.min(Math.PI / 2, (view.pitch * Math.PI) / 180 + half)) / Math.PI) * h) - 2);
  const bottom = Math.min(h, Math.ceil(((Math.PI / 2 - Math.max(-Math.PI / 2, (view.pitch * Math.PI) / 180 - half)) / Math.PI) * h) + 2);
  const sinLon = new Float64Array(w);
  const cosLon = new Float64Array(w);
  for (let x = 0; x < w; x++) {
    const lon = ((x + 0.5) / w) * 2 * Math.PI - Math.PI;
    sinLon[x] = Math.sin(lon);
    cosLon[x] = Math.cos(lon);
  }
  const edge = 0.06; // the outer 6% of the view fades from the change to the photo
  for (let y = top; y < bottom; y++) {
    const lat = Math.PI / 2 - ((y + 0.5) / h) * Math.PI;
    const cl = Math.cos(lat);
    const sl = Math.sin(lat);
    for (let x = 0; x < w; x++) {
      const dx = cl * sinLon[x];
      const dz = cl * cosLon[x];
      const zc = dx * B.f[0] + sl * B.f[1] + dz * B.f[2];
      if (zc <= 0.05) continue;
      const xc = (dx * B.r[0] + sl * B.r[1] + dz * B.r[2]) / zc / B.tx;
      const yc = (dx * B.u[0] + sl * B.u[1] + dz * B.u[2]) / zc / B.ty;
      if (xc <= -1 || xc >= 1 || yc <= -1 || yc >= 1) continue;
      const vx = ((xc + 1) / 2) * vw;
      const vy = ((1 - yc) / 2) * vh;
      // How much of the change: the mask, faded at the view's edges.
      const fade = Math.min(1, (1 - Math.abs(xc)) / edge, (1 - Math.abs(yc)) / edge);
      const mi = Math.min(vh - 1, Math.floor(vy)) * vw + Math.min(vw - 1, Math.floor(vx));
      const k = (mask[mi] / 255) * fade;
      if (k <= 0.004) continue;
      sample(edited, vw, vh, vx, vy, px, false);
      const o = (y * w + x) * 3;
      equi[o] = equi[o] + (px[0] - equi[o]) * k;
      equi[o + 1] = equi[o + 1] + (px[1] - equi[o + 1]) * k;
      equi[o + 2] = equi[o + 2] + (px[2] - equi[o + 2]) * k;
    }
  }
}
