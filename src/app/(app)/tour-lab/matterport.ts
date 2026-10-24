"use client";

/**
 * Thin wrapper around Matterport's Showcase SDK for Embeds. The SDK script is
 * Matterport's own, loaded at runtime from their CDN (the npm package fetches
 * type definitions from Matterport's API on install, which we don't want a
 * deploy to depend on), so only the few calls we use are typed here.
 */

export type Rotation = { x: number; y: number };

export type SweepInfo = { id?: string; sid?: string; uuid?: string; index?: number };

export type MpSdk = {
  App: {
    Phase: { PLAYING: string };
    state: { waitUntil(cond: (s: { phase: string }) => boolean): Promise<unknown> };
  };
  Camera: {
    pose: { subscribe(cb: (pose: { sweep: string; rotation: Rotation; mode: string }) => void): { cancel(): void } };
  };
  Sweep: {
    Transition: { FLY: string; INSTANT: string; FADEOUT: string };
    data: {
      subscribe(observer: { onCollectionUpdated(collection: Record<string, SweepInfo>): void }): { cancel(): void };
    };
    moveTo(sweepId: string, options?: { rotation?: Rotation; transition?: string; transitionTime?: number }): Promise<string>;
  };
};

declare global {
  interface Window {
    MP_SDK?: { connect(iframe: HTMLIFrameElement, sdkKey?: string, version?: string): Promise<MpSdk> };
  }
}

const SDK_SCRIPT = "https://static.matterport.com/showcase-sdk/latest.js";
let scriptPromise: Promise<void> | null = null;

function loadSdkScript(): Promise<void> {
  if (window.MP_SDK) return Promise.resolve();
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SDK_SCRIPT;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("Kunne ikke hente Matterports SDK."));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/**
 * Connects to a showcase iframe. The key goes both in the iframe's src
 * (`applicationKey`, what newer SDK versions read) and to connect() itself -
 * the script served as latest.js still checks the key it's handed there, and
 * answers "invalid key" without it.
 */
export async function connectSdk(iframe: HTMLIFrameElement, sdkKey: string): Promise<MpSdk> {
  await loadSdkScript();
  try {
    return await window.MP_SDK!.connect(iframe, sdkKey, "");
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
  return `https://my.matterport.com/show/?${params}`;
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

/** Where a Matterport "U"-link points: the scan point number (`ss`) and the view direction (`sr`). */
export function uLinkTarget(raw: string): { ss: number; rotation?: Rotation } | null {
  let params: URLSearchParams;
  try {
    params = new URL(raw.trim()).searchParams;
  } catch {
    return null;
  }
  const ss = Number(params.get("ss"));
  if (!params.get("ss") || !Number.isFinite(ss)) return null;
  const sr = (params.get("sr") ?? "").split(",").map(parseFloat);
  const rotation = sr.length >= 2 && !isNaN(sr[0]) && !isNaN(sr[1]) ? srToRotation(sr[0], sr[1]) : undefined;
  return { ss, rotation };
}

export function sweepIdForIndex(sweeps: Record<string, SweepInfo>, ss: number): string | null {
  const list = Object.values(sweeps);
  const hit = list.find((s) => s && s.index === ss) ?? list[ss];
  return hit ? hit.sid ?? hit.id ?? null : null;
}
