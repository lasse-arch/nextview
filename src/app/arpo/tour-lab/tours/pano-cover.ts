import type { PanoCover } from "./types";

/*
 * Pictures that aren't a full 360° (a 180° photo, a half panorama): Pannellum
 * shows them with `haov`/`vaov` (how much they cover), and the view is held
 * inside them - it turns only as far as the picture goes and never zooms out
 * past its edges, so no black shows. A full 360° picture is left as it is.
 */

type ViewerOptions = { hfov?: number; maxHfov?: number; minHfov?: number; yaw?: number; pitch?: number; autoRotate?: number; [k: string]: unknown };

/** A cover only when it's less than the whole sphere - sane numbers, or none. */
export function partialCover(c: PanoCover | undefined | null): PanoCover | null {
  if (!c || !(c.h > 0) || !(c.v > 0)) return null;
  const h = Math.min(360, c.h);
  const v = Math.min(180, c.v);
  return h >= 360 && v >= 180 ? null : { h, v };
}

/** The viewer's options for a picture that covers `cover` (unchanged for a full 360°). */
export function fitPano<T extends ViewerOptions>(opts: T, cover: PanoCover | undefined | null, aspect?: number): T {
  const c = partialCover(cover);
  if (!c) return opts;
  // Never wider than the picture (with a little room), so its edges stay out of view.
  // (Looking up or down, the picture's side edges lean in - hence the margin.)
  const widest = Math.max(30, Math.min(opts.maxHfov ?? 120, c.h < 360 ? c.h * 0.5 : 360, c.v * 0.8));
  // The screen's shape (width / height), when known: on an upright phone a view that wide would see past the top and bottom of a low picture.
  const rad = Math.PI / 180;
  const byHeight = aspect && aspect > 0 ? (2 * Math.atan(Math.tan(((c.v * 0.95) / 2) * rad) * aspect)) / rad : Infinity;
  const widestHere = Math.max(10, Math.min(widest, byHeight));
  const out: ViewerOptions = { ...opts, haov: c.h, vaov: c.v, maxHfov: widestHere, minHfov: Math.min(opts.minHfov ?? 30, widestHere), hfov: Math.min(opts.hfov ?? 100, widestHere) };
  if (c.h < 360) {
    out.minYaw = -c.h / 2 + 16;
    out.maxYaw = c.h / 2 - 16;
    // A half picture can't turn round by itself.
    delete out.autoRotate;
    if (out.yaw != null) out.yaw = Math.max(-c.h / 2, Math.min(c.h / 2, out.yaw));
  }
  // How far up and down: to the picture's edge - and on a half picture, short of straight up and down, where its two sides meet (beyond them is nothing).
  // (A low, wide picture - a phone's panorama - has no poles to stay away from: never a negative range, which broke it.)
  const tilt = c.h < 360 ? Math.max(0, Math.min(c.v / 2, 90) - (c.v >= 120 ? 35 : 0)) : c.v / 2;
  // And Pannellum itself keeps the edges out of view whatever the screen's shape (an upright phone sees more up and down).
  out.avoidShowingBackground = true;
  if (c.v < 180 || c.h < 360) {
    out.minPitch = -tilt;
    out.maxPitch = tilt;
    if (out.pitch != null) out.pitch = Math.max(-tilt, Math.min(tilt, out.pitch));
  }
  return out as T;
}
