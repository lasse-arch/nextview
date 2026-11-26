/*
 * "Let tilstand": a computer that struggles with the tour's 3D (Matterport) gets a lighter tour by itself - moving
 * between places without the flight, no frosted glass over the 3D (it's blurred again on every frame), and no slow
 * turns (the view set on every frame). Nothing is stored on the device.
 *
 * Two signs: the browser draws 3D without a graphics card (software rendering - e.g. graphics acceleration turned off
 * in Edge or Chrome), or, once the tour is in use, the page has stayed slow for a while (under ~20 frames a second).
 */

/** The browser draws WebGL without a graphics card (or can't at all). */
export function softwareRendering(): boolean {
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl") ?? c.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) return true;
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)).toLowerCase();
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return /swiftshader|llvmpipe|softpipe|software|basic render driver|microsoft basic/.test(renderer);
  } catch {
    return false;
  }
}

/**
 * Watches the frame rate while the tour is on the screen: `onSlow` once, when three windows of 2 seconds in a row ran
 * under 20 frames a second (a hidden tab or a page in the background doesn't count). Returns the stop.
 */
export function watchSlowFrames(onSlow: () => void): () => void {
  let raf = 0;
  let frames = 0;
  let start = performance.now();
  let slow = 0;
  let stopped = false;
  const tick = (t: number) => {
    if (stopped) return;
    frames++;
    if (t - start >= 2000) {
      const fps = (frames * 1000) / (t - start);
      slow = document.visibilityState === "visible" && fps < 20 ? slow + 1 : 0;
      frames = 0;
      start = t;
      if (slow >= 3) {
        stopped = true;
        return onSlow();
      }
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
  };
}

export const LITE_CSS = `
.hv-let *,.hv-let *::before,.hv-let *::after{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
.hv-let .ld-card.ld-glas{background:rgba(255,255,255,.97)!important}
.hv-let .hv-wel,.hv-let .ld-frame{background:rgba(13,27,32,.72)!important}
`;
