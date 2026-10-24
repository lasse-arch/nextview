"use client";

/**
 * Thin wrapper around Matterport's Showcase SDK for Embeds. The SDK script is
 * Matterport's own, loaded at runtime from their CDN (the npm package fetches
 * type definitions from Matterport's API on install, which we don't want a
 * deploy to depend on), so only the few calls we use are typed here.
 */

export type Rotation = { x: number; y: number };

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
    moveTo(sweepId: string, options?: { rotation?: Rotation; transition?: string; transitionTime?: number }): Promise<string>;
  };
};

declare global {
  interface Window {
    MP_SDK?: { connect(iframe: HTMLIFrameElement): Promise<MpSdk> };
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

/** Connects to a showcase iframe whose src carries `applicationKey`. */
export async function connectSdk(iframe: HTMLIFrameElement): Promise<MpSdk> {
  await loadSdkScript();
  try {
    return await window.MP_SDK!.connect(iframe);
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
