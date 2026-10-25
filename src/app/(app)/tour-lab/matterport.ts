"use client";

/**
 * Thin wrapper around Matterport's Showcase SDK Bundle: Matterport's own
 * viewer, hosted unmodified by Arpo (public/matterport/<version>, from
 * Matterport's showcase-bundle.zip) - the same approach MPSkins uses. Being
 * on our own domain is what lets the tour hide Matterport's logo, "Powered
 * by" and loading screen. Only the few SDK calls we use are typed here.
 */

/** The SDK Bundle version in public/matterport - upgrading = unzip the new one next to it and change this. */
export const BUNDLE_VERSION = "26.5.4_webgl-708-g332adb66f5";

export type Rotation = { x: number; y: number };
export type Vec3 = { x: number; y: number; z: number };
export type CameraPose = { position: Vec3; rotation: Rotation; projection: Float32Array | number[]; sweep: string; mode: string };

export type SweepInfo = { id?: string; sid?: string; uuid?: string; index?: number; position?: { x: number; y: number; z: number } };

export type MpSdk = {
  App: {
    Phase: { PLAYING: string };
    state: { waitUntil(cond: (s: { phase: string }) => boolean): Promise<unknown> };
  };
  Camera: {
    pose: { subscribe(cb: (pose: CameraPose) => void): { cancel(): void } };
    /** Turns the view by degrees; speed in degrees per second. */
    rotate?(horizontal: number, vertical: number, options?: { speed?: number }): Promise<void>;
  };
  /** Matterport's own measuring tool (allowed when the model's "measurements" setting is on). */
  Measurements?: { toggleMode(active: boolean, options?: Record<string, unknown>): Promise<void> };
  Conversion?: {
    worldToScreen(position: Vec3, pose: CameraPose, size: { w: number; h: number }): Vec3;
  };
  Pointer?: {
    intersection: { subscribe(cb: (hit: { position: Vec3 } | null) => void): { cancel(): void } };
  };
  Renderer: {
    /** The current view as an image (a data URL), without Matterport's own markers when told so. */
    takeScreenShot(
      resolution?: { width: number; height: number },
      visibility?: { mattertags?: boolean; sweeps?: boolean; views?: boolean; measurements?: boolean }
    ): Promise<string>;
  };
  Sweep: {
    Transition: { FLY: string; INSTANT: string; FADEOUT: string };
    data: {
      subscribe(observer: { onCollectionUpdated(collection: Record<string, SweepInfo>): void }): { cancel(): void };
    };
    enable(...sweepIds: string[]): Promise<void>;
    /** Hides scan points: no puck, can't be walked to. */
    disable(...sweepIds: string[]): Promise<void>;
    moveTo(sweepId: string, options?: { rotation?: Rotation; transition?: string; transitionTime?: number }): Promise<string>;
  };
};

type ShowcaseWindow = Window & { MP_SDK?: { connect(win: Window): Promise<MpSdk> } };

/** Matterport's branding inside the viewer - hidden; our own logo and loading take its place. */
const HIDE_BRANDING = `
  [class*="logo"], .powered-by, .powered-by-link, .powered-by-label, .co-brand, .co-branded,
  [class*="search-button"], [class*="search-bar"], [class*="search-panel"], button[aria-label="Search"],
  #loading-gui #loading-header, #loading-powered-by, #powered-by { display: none !important; }
`;

/** All of Matterport's own buttons and panels (the 3D view stays) - the tour's own UI replaces them. */
const HIDE_UI = `
  #gui, #react-overlay-root, #control-kit-wrapper { display: none !important; }
`;

function hideBranding(win: Window, hideUi: boolean) {
  const doc = win.document;
  if (doc.getElementById("nv-hide-branding")) return;
  const style = doc.createElement("style");
  style.id = "nv-hide-branding";
  style.textContent = HIDE_BRANDING + (hideUi ? HIDE_UI : "");
  (doc.head ?? doc.documentElement).appendChild(style);
}

/** Waits until the bundle in the iframe has loaded far enough to expose MP_SDK. */
async function showcaseWindow(iframe: HTMLIFrameElement, hideUi: boolean): Promise<ShowcaseWindow> {
  const deadline = Date.now() + 60_000;
  for (;;) {
    const win = iframe.contentWindow as ShowcaseWindow | null;
    try {
      if (win?.document?.head) hideBranding(win, hideUi);
      if (win?.MP_SDK) return win;
    } catch {
      // Not same-origin yet (about:blank while navigating) - keep waiting.
    }
    if (Date.now() > deadline) throw new Error("Matterport-viseren blev ikke indlæst.");
    await new Promise((r) => setTimeout(r, 100));
  }
}

/** Connects to a bundle iframe; its src carries `applicationKey`. */
export async function connectSdk(iframe: HTMLIFrameElement, sdkKey: string, opts: { hideUi?: boolean } = {}): Promise<MpSdk> {
  void sdkKey; // read by the bundle from the iframe's src
  const win = await showcaseWindow(iframe, opts.hideUi ?? false);
  try {
    return await win.MP_SDK!.connect(win);
  } catch (err) {
    const text = String(err);
    if (/mismatch|refused|invalid key/i.test(text)) {
      throw new Error(
        `SDK-nøglen blev afvist. Tjek i Matterport (Developer Tools → SDK Key Management), at ${window.location.host} er tilføjet som tilladt domæne, og at det ikke er en sandbox-nøgle (de virker kun på localhost). Matterport svarede: "${text}"`
      );
    }
    throw err instanceof Error ? err : new Error(text);
  }
}

/** The model id (`m=`) out of any Matterport link - a tour link, a U-link or just the id itself. */
export function modelIdFrom(raw: string): string | null {
  const value = raw.trim();
  if (/^[A-Za-z0-9]{11}$/.test(value)) return value;
  try {
    return new URL(value).searchParams.get("m");
  } catch {
    return null;
  }
}

export function showcaseUrl(modelId: string, sdkKey: string | null, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams({
    m: modelId,
    play: "1",
    qs: "1",
    brand: "0",
    help: "0",
    title: "0",
    ...(sdkKey ? { applicationKey: sdkKey } : {}),
    ...extra,
  });
  // Without a key there's no SDK, so the plain Matterport embed is used.
  return sdkKey ? `/matterport/${BUNDLE_VERSION}/showcase.html?${params}` : `https://my.matterport.com/show/?${params}`;
}

/**
 * A U-link's `sr` is the camera's rotation as Euler angles in X,Y order
 * (radians, roll left out) - not "pitch,yaw". Read naively, links with a
 * first value near ±3.1 (half of Halvorsminde's) turn into looking straight
 * up or down. Converting the rotation to yaw-then-pitch (Euler Y,X - what
 * Sweep.moveTo takes) gives the real view: in practice pitch within a few
 * degrees of level. Same maths as three.js' Euler/Quaternion.
 */
export function srToRotation(first: number, second: number): Rotation {
  const c1 = Math.cos(first / 2), s1 = Math.sin(first / 2);
  const c2 = Math.cos(second / 2), s2 = Math.sin(second / 2);
  // Quaternion of Euler(first, second, 0, "XYZ").
  const x = s1 * c2, y = c1 * s2, z = s1 * s2, w = c1 * c2;
  // The rotation matrix elements the "YXZ" decomposition needs.
  const m13 = 2 * (x * z + w * y);
  const m23 = 2 * (y * z - w * x);
  const m33 = 1 - 2 * (x * x + y * y);
  const m31 = 2 * (x * z - w * y);
  const m11 = 1 - 2 * (y * y + z * z);
  const pitch = Math.asin(-Math.max(-1, Math.min(1, m23)));
  const yaw = Math.abs(m23) < 0.9999999 ? Math.atan2(m13, m33) : Math.atan2(-m31, m11);
  return { x: (pitch * 180) / Math.PI, y: (yaw * 180) / Math.PI };
}

/** Where a Matterport "U"-link points: the scan point number (`ss`) and the view direction (`sr`, or our own `rot`). */
export function uLinkTarget(raw: string): { ss: number; rotation?: Rotation } | null {
  let params: URLSearchParams;
  try {
    params = new URL(raw.trim()).searchParams;
  } catch {
    return null;
  }
  const ss = Number(params.get("ss"));
  if (!params.get("ss") || !Number.isFinite(ss)) return null;
  // `rot` = the viewer's own angles (pitch,yaw in degrees), as copied with "Kopiér dette udsyn" - exact, no conversion.
  const rot = (params.get("rot") ?? "").split(",").map(parseFloat);
  if (rot.length === 2 && !isNaN(rot[0]) && !isNaN(rot[1])) return { ss, rotation: { x: rot[0], y: rot[1] } };
  const sr = (params.get("sr") ?? "").split(",").map(parseFloat);
  const rotation = sr.length >= 2 && !isNaN(sr[0]) && !isNaN(sr[1]) ? srToRotation(sr[0], sr[1]) : undefined;
  return { ss, rotation };
}

export function sweepIdForIndex(sweeps: Record<string, SweepInfo>, ss: number): string | null {
  const list = Object.values(sweeps);
  const hit = list.find((s) => s && s.index === ss) ?? list[ss];
  return hit ? hit.sid ?? hit.id ?? null : null;
}
