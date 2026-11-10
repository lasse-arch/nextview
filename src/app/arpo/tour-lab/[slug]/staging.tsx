"use client";

import { useEffect, useRef, useState } from "react";
import type { CameraPose, MpSdk } from "../matterport";
import type { Point3, StagingItem, TourConfig } from "../tours/types";
import { inFront } from "./info";
import { videoEmbed } from "./info";
import { safeHref } from "../tours/safe";
import { YearWheelView } from "./yearwheel";
import { useT } from "../tours/i18n-react";
import { stagingVideo } from "./staging-3d";
import { CHEST_IMAGE } from "./treasure";

/*
 * Virtual staging: videos, pictures, web pages, signs and the year wheel put
 * onto surfaces in the tour. Each is an ordinary element laid over the tour
 * and bent onto its four corners in perspective (a CSS matrix3d computed from
 * where the corners land on the screen) on every camera move - so a web page
 * or the year wheel stays clickable, which a texture in the 3D scene couldn't
 * be. Shown only from its own scan points, so it never shows through a wall,
 * and only inside the tour. A video plays (silently) only while it's seen.
 */

const cross = (a: Point3, b: Point3): Point3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const unit = (a: Point3): Point3 => {
  const l = Math.hypot(a.x, a.y, a.z) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
};
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** The surface's right and up, as seen standing in front of it (on a floor or ceiling: north is up). */
export function surfaceAxes(normal: Point3): { right: Point3; up: Point3 } {
  const n = unit(normal);
  const forward = { x: -n.x, y: -n.y, z: -n.z };
  const worldUp = Math.abs(n.y) > 0.9 ? { x: 0, y: 0, z: -1 } : { x: 0, y: 1, z: 0 };
  const right = unit(cross(forward, worldUp));
  const up = unit(cross(right, forward));
  return { right, up };
}

/** The four corners (top left, top right, bottom right, bottom left) of a rectangle w x h metres centred on the surface. */
export function cornersOf(place: NonNullable<StagingItem["place"]>): StagingItem["corners"] {
  const { right, up } = surfaceAxes(place.normal);
  // A hair in front of the surface, so it never sinks into it.
  const c = { x: place.center.x + place.normal.x * 0.005, y: place.center.y + place.normal.y * 0.005, z: place.center.z + place.normal.z * 0.005 };
  const at = (sx: number, sy: number): Point3 => ({
    x: r3(c.x + right.x * sx * (place.w / 2) + up.x * sy * (place.h / 2)),
    y: r3(c.y + right.y * sx * (place.w / 2) + up.y * sy * (place.h / 2)),
    z: r3(c.z + right.z * sx * (place.w / 2) + up.z * sy * (place.h / 2)),
  });
  return [at(-1, 1), at(1, 1), at(1, -1), at(-1, -1)];
}

/** Moves a place along its surface (metres right and up). */
export function movePlace(place: NonNullable<StagingItem["place"]>, dx: number, dy: number): NonNullable<StagingItem["place"]> {
  const { right, up } = surfaceAxes(place.normal);
  return { ...place, center: { x: r3(place.center.x + right.x * dx + up.x * dy), y: r3(place.center.y + right.y * dx + up.y * dy), z: r3(place.center.z + right.z * dx + up.z * dy) } };
}

/** A sane picture of the corners on the screen: a convex quad (no bow tie, nothing turned inside out) - else it isn't drawn at all. */
export function saneQuad(p: { x: number; y: number }[]): boolean {
  if (p.length !== 4 || !p.every((q) => Number.isFinite(q.x) && Number.isFinite(q.y))) return false;
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = p[i], b = p[(i + 1) % 4], c = p[(i + 2) % 4];
    const z = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(z) < 1e-6) return false;
    const s = Math.sign(z);
    if (sign && s !== sign) return false;
    sign = s;
  }
  return true;
}

/** The size an item is laid out in before it's bent onto its corners: 1600 wide, the height from the surface's own proportions. */
const BASE_W = 1600;
const dist = (a: Point3, b: Point3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export function baseSize(c: StagingItem["corners"]): { w: number; h: number } {
  const w = (dist(c[0], c[1]) + dist(c[3], c[2])) / 2 || 1;
  const h = (dist(c[0], c[3]) + dist(c[1], c[2])) / 2 || 1;
  return { w: BASE_W, h: Math.max(100, Math.min(BASE_W * 3, Math.round((BASE_W * h) / w))) };
}

/**
 * The CSS matrix3d that maps the rectangle 0,0-w,h onto the four screen points
 * (top left, top right, bottom right, bottom left): a projective transform,
 * solved from the eight equations of the corners.
 */
export function quadMatrix(w: number, h: number, p: { x: number; y: number }[]): string | null {
  const c = quadSolve(w, h, p);
  if (!c) return null;
  const [a0, a1, a2, b0, b1, b2, c0, c1] = c;
  // Column-major for CSS: x' = (a0 x + a1 y + a2) / (c0 x + c1 y + 1), y' likewise.
  return `matrix3d(${a0},${b0},0,${c0},${a1},${b1},0,${c1},0,0,1,0,${a2},${b2},0,1)`;
}

/** Where the point x, y of the rectangle lands under the transform `quadSolve` found. */
export function quadPoint(c: number[], x: number, y: number): { x: number; y: number } {
  const [a0, a1, a2, b0, b1, b2, c0, c1] = c;
  const d = c0 * x + c1 * y + 1;
  return { x: (a0 * x + a1 * y + a2) / d, y: (b0 * x + b1 * y + b2) / d };
}

/** The eight numbers of the projective transform from the rectangle 0,0-w,h onto the four points. */
export function quadSolve(w: number, h: number, p: { x: number; y: number }[]): number[] | null {
  const src = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ];
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const { x: u, y: v } = p[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  // Gaussian elimination with partial pivoting.
  for (let c = 0; c < 8; c++) {
    let best = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[best][c])) best = r;
    if (Math.abs(A[best][c]) < 1e-12) return null;
    [A[c], A[best]] = [A[best], A[c]];
    [b[c], b[best]] = [b[best], b[c]];
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      if (!f) continue;
      for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  const out = b.map((v, i) => v / A[i][i]);
  return out.every(Number.isFinite) ? out : null;
}

const VIDEO_TYPES = /\.(mp4|webm|mov|m4v)(\?|$)/i;

export function StagingLayer({
  sdk,
  items,
  T,
  currentSs,
  frame,
  lang,
  onLink,
}: {
  sdk: MpSdk | null;
  items: StagingItem[];
  T: TourConfig;
  currentSs: number | null;
  frame: React.RefObject<HTMLIFrameElement | null>;
  lang?: string;
  onLink: (label: string, href: string, item: StagingItem) => void;
}) {
  const els = useRef<(HTMLDivElement | null)[]>([]);
  // Only the items seen from where the visitor stands are made at all (a video elsewhere isn't loaded).
  const here = items.map((i) => currentSs != null && i.ss.includes(currentSs) && i.corners?.length === 4);
  const sizes = items.map((i) => baseSize(i.corners));
  const [shown, setShown] = useState<boolean[]>([]);

  useEffect(() => {
    if (!sdk?.Conversion) return;
    const conv = sdk.Conversion;
    let last: boolean[] = [];
    const place = (pose: CameraPose) => {
      const el = frame.current;
      if (!el) return;
      const size = { w: el.clientWidth, h: el.clientHeight };
      const now = items.map((item, n) => {
        const box = els.current[n];
        if (!box || !here[n]) return false;
        const inside = pose.mode.includes("inside") && item.corners.every((c) => inFront(pose, c));
        const pts = inside ? item.corners.map((c) => conv.worldToScreen(c, pose, size)) : null;
        // Off to the side by far more than the screen = not in view (and keeps the numbers sane).
        const near = pts?.every((q) => Math.abs(q.x) < size.w * 4 && Math.abs(q.y) < size.h * 4);
        const m = pts && near && saneQuad(pts) ? quadMatrix(sizes[n].w, sizes[n].h, pts) : null;
        box.style.transform = m ?? "";
        box.dataset.ude = m ? "" : "1";
        return Boolean(m);
      });
      if (now.some((v, i) => v !== last[i])) {
        last = now;
        setShown(now);
      }
    };
    const sub = sdk.Camera.pose.subscribe(place);
    return () => sub.cancel();
    // `here` and `sizes` follow items and currentSs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sdk, items, currentSs, frame]);

  return (
    <div className="vs-lag" aria-hidden={false}>
      {items.map((item, n) =>
        here[n] ? (
          <div
            key={item.id}
            ref={(el) => {
              els.current[n] = el;
            }}
            className={`vs-item vs-${item.kind} ${item.action || item.kind === "treasure" ? "vs-klik" : ""}`}
            data-ude="1"
            style={{ width: sizes[n].w, height: sizes[n].h }}
          >
            <StagedContent item={item} T={T} lang={lang} seen={Boolean(shown[n])} onLink={(label, href) => onLink(label, href, item)} />
          </div>
        ) : null
      )}
    </div>
  );
}

/**
 * "Tryk for lyd" under a film on a 3D surface (staging-3d.ts): the film plays
 * silently on the wall - this button, following it as the visitor turns,
 * turns its sound on and off. Shown from the surface's own scan points, while
 * the film is in view. Films with a button of their own (a link) get none.
 */
export function StagingSound({ sdk, items, currentSs, frame }: { sdk: MpSdk | null; items: StagingItem[]; currentSs: number | null; frame: React.RefObject<HTMLIFrameElement | null> }) {
  const tr = useT();
  const films = items.filter((i) => i.kind === "video" && i.src && !i.action?.href && currentSs != null && i.ss.includes(currentSs) && i.corners?.length === 4);
  const els = useRef<(HTMLButtonElement | null)[]>([]);
  const [, setTick] = useState(0);
  const key = films.map((f) => f.id).join(",");
  useEffect(() => {
    if (!sdk?.Conversion || !films.length) return;
    const conv = sdk.Conversion;
    const sub = sdk.Camera.pose.subscribe((pose) => {
      const el = frame.current;
      if (!el) return;
      const size = { w: el.clientWidth, h: el.clientHeight };
      films.forEach((f, n) => {
        const b = els.current[n];
        if (!b) return;
        // Just under the bottom edge's middle - for a screen standing up in the room, under the screen itself (its corners lie on the floor).
        const c = f.corners;
        const at = f.stand && f.place ? { x: f.place.center.x, y: f.place.center.y + (f.stand.lift ?? 0), z: f.place.center.z } : { x: (c[2].x + c[3].x) / 2, y: (c[2].y + c[3].y) / 2, z: (c[2].z + c[3].z) / 2 };
        const seen = pose.mode.includes("inside") && inFront(pose, at);
        const q = seen ? conv.worldToScreen(at, pose, size) : null;
        const ok = q && q.x > 0 && q.x < size.w && q.y > 0 && q.y < size.h - 30;
        b.style.transform = ok ? `translate(${q!.x}px, ${q!.y + 8}px) translateX(-50%)` : "";
        b.dataset.ude = ok ? "" : "1";
      });
    });
    // The film's own sound turned on or off (a tap on the wall does that too): the button says so.
    const vs = films.map((f) => stagingVideo(f.id)).filter((v): v is HTMLVideoElement => Boolean(v));
    const changed = () => setTick((t) => t + 1);
    vs.forEach((v) => v.addEventListener("volumechange", changed));
    return () => {
      sub.cancel();
      vs.forEach((v) => v.removeEventListener("volumechange", changed));
    };
    // `films` is named by `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sdk, key, frame]);
  if (!films.length) return null;
  return (
    <div className="vs-lag">
      {films.map((f, n) => {
        const v = stagingVideo(f.id);
        const on = Boolean(v && !v.muted);
        return (
          <button
            key={f.id}
            ref={(el) => {
              els.current[n] = el;
            }}
            type="button"
            data-ude="1"
            className="vs-lydknap"
            onClick={() => {
              const film = stagingVideo(f.id);
              if (!film) return;
              film.muted = !film.muted;
              void film.play().catch(() => {});
              setTick((t) => t + 1);
            }}
          >
            {on ? `🔊 ${tr("Slå lyd fra")}` : `🔇 ${tr("Tryk for lyd")}`}
          </button>
        );
      })}
    </div>
  );
}

function StagedContent({ item, T, lang, seen, onLink }: { item: StagingItem; T: TourConfig; lang?: string; seen: boolean; onLink: (label: string, href: string) => void }) {
  const tr = useT();
  const video = useRef<HTMLVideoElement>(null);
  const [sound, setSound] = useState(false);
  const fit = item.fit === "contain" ? "contain" : "cover";
  const action = item.action && safeHref(item.action.href) ? item.action : null;
  const click = action ? () => onLink(action.label, action.href) : undefined;

  // A video plays only while it's in view - silently, looping - and stops when it isn't.
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (seen) v.play().catch(() => {});
    else v.pause();
  }, [seen]);

  const ownVideo = item.kind === "video" && !!item.src && (VIDEO_TYPES.test(item.src.split("#")[0]) || item.src.startsWith("/api/tour-files/") || /\.blob\.vercel-storage\.com\//.test(item.src));
  if (ownVideo)
    return (
      <>
        <video
          ref={video}
          src={item.src}
          muted={!sound}
          loop
          playsInline
          preload="metadata"
          style={{ objectFit: fit }}
          onClick={() => (click ? click() : setSound((s) => !s))}
        />
        {!click && <span className="vs-lyd">{sound ? "🔊" : `🔇 ${tr("Tryk for lyd")}`}</span>}
        {click && <span className="vs-knap">{action!.label} →</span>}
      </>
    );
  if (item.kind === "treasure")
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={item.src || CHEST_IMAGE} alt={tr("Skattekiste")} style={{ objectFit: "contain" }} onClick={() => window.dispatchEvent(new CustomEvent("hv-skat", { detail: item.id }))} />
    );
  if (item.kind === "image" && item.src)
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.src} alt={item.title ?? ""} loading="lazy" decoding="async" style={{ objectFit: fit }} onClick={click} />
        {click && <span className="vs-knap">{action!.label} →</span>}
      </>
    );
  if ((item.kind === "iframe" || item.kind === "video") && item.src) {
    const embed = videoEmbed(item.src);
    const src = embed ? `${embed}${embed.includes("?") ? "&" : "?"}autoplay=1&mute=1&loop=1&playsinline=1` : /^https:\/\//i.test(item.src) ? item.src : null;
    // A page on the tour's own address could reach out of its sandbox (scripts + same origin) - never shown.
    const own = (() => {
      try {
        return src ? new URL(src).origin === window.location.origin : true;
      } catch {
        return true;
      }
    })();
    if (!src || !seen || own) return <div className="vs-tom" />;
    return (
      <iframe
        src={src}
        title={item.title ?? "Indhold"}
        loading="lazy"
        referrerPolicy="no-referrer"
        // A page from outside runs walled off: no access to the tour, no top-level navigation.
        sandbox="allow-scripts allow-same-origin allow-popups allow-presentation allow-forms"
        allow="autoplay; fullscreen; picture-in-picture"
      />
    );
  }
  if (item.kind === "sign")
    return (
      <div className="vs-skilt" onClick={click}>
        <p>{item.text}</p>
        {click && <span className="vs-knap">{action!.label} →</span>}
      </div>
    );
  if (item.kind === "yearwheel" && T.yearWheel) return seen ? <YearWheelView wheel={T.yearWheel} lang={lang} compact onLink={onLink} /> : <div className="vs-tom" />;
  return <div className="vs-tom" />;
}

export const STAGING_CSS = `
.vs-lag{position:absolute;inset:0;z-index:3;pointer-events:none;overflow:hidden}
.vs-item{position:absolute;left:0;top:0;transform-origin:0 0;overflow:hidden;background:#000;backface-visibility:hidden;will-change:transform}
.vs-item[data-ude="1"]{visibility:hidden}
.vs-item video,.vs-item img,.vs-item iframe{display:block;width:100%;height:100%;border:0}
.vs-video,.vs-iframe,.vs-yearwheel,.vs-klik{pointer-events:auto;cursor:pointer}
.vs-image:not(.vs-klik),.vs-sign:not(.vs-klik){pointer-events:none}
.vs-tom{width:100%;height:100%;background:#111}
.vs-lydknap{position:absolute;left:0;top:0;pointer-events:auto;display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border:0;border-radius:999px;background:rgba(0,0,0,.62);color:#fff;font:inherit;font-size:13px;font-weight:700;white-space:nowrap;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.3);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}
.vs-lydknap[data-ude="1"]{visibility:hidden}
.vs-lyd{position:absolute;left:24px;bottom:24px;padding:14px 26px;border-radius:999px;background:rgba(0,0,0,.6);color:#fff;font-size:34px;font-weight:700;pointer-events:none}
.vs-knap{position:absolute;right:28px;bottom:28px;padding:18px 34px;border-radius:999px;background:var(--c-accent);color:var(--c-on-accent,#fff);font-size:40px;font-weight:800;box-shadow:0 8px 30px rgba(0,0,0,.35);pointer-events:none}
.vs-skilt{width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:6%;box-sizing:border-box;background:#fff;color:var(--c-main);text-align:center}
.vs-skilt p{margin:0;font-family:var(--font-heading);font-size:120px;font-weight:800;line-height:1.08;white-space:pre-line}
.vs-sign{background:#fff}
.vs-treasure{background:transparent}
.vs-image{background:transparent}
`;
