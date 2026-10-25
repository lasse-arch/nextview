"use client";

import { useEffect, useRef, useState } from "react";
import type { CameraPose, MpSdk, Vec3 } from "../matterport";
import type { TourInfo } from "../tours/types";
import { TourLink } from "./links";

/** Is the point in front of the camera? (Matterport looks down -z; rotation is pitch x / yaw y in degrees.) */
export function inFront(pose: CameraPose, p: Vec3) {
  const pitch = (pose.rotation.x * Math.PI) / 180;
  const yaw = (pose.rotation.y * Math.PI) / 180;
  const fwd = { x: -Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) };
  return (p.x - pose.position.x) * fwd.x + (p.y - pose.position.y) * fwd.y + (p.z - pose.position.z) * fwd.z > 0.2;
}

/**
 * Info points over the tour: a pulsing dot that follows its spot in the room
 * as the visitor looks around, shown only from the scan points it belongs to
 * (so it never shows through a wall). A tap opens its card.
 */
export function InfoDots({
  sdk,
  info,
  currentSs,
  frame,
  onOpen,
  onLink,
}: {
  sdk: MpSdk | null;
  info: TourInfo[];
  currentSs: number | null;
  frame: React.RefObject<HTMLIFrameElement | null>;
  onOpen: (i: TourInfo) => void;
  onLink: (label: string, href: string) => void;
}) {
  const dots = useRef<(HTMLButtonElement | null)[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const here = info.map((i) => currentSs != null && i.ss.includes(currentSs));

  useEffect(() => {
    if (!sdk?.Conversion) return;
    const conv = sdk.Conversion;
    const sub = sdk.Camera.pose.subscribe((pose) => {
        const el = frame.current;
        if (!el) return;
        const size = { w: el.clientWidth, h: el.clientHeight };
        info.forEach((i, n) => {
          const dot = dots.current[n];
          if (!dot) return;
          const ok = pose.mode.includes("inside") && inFront(pose, i.position);
          const at = ok ? conv.worldToScreen(i.position, pose, size) : null;
          const show = at != null && at.x > 0 && at.y > 0 && at.x < size.w && at.y < size.h;
          dot.style.transform = show ? `translate(${at!.x}px, ${at!.y}px)` : "";
          dot.dataset.ude = show ? "" : "1";
        });
    });
    return () => sub.cancel();
  }, [sdk, info, frame]);

  const card = open != null && here[open] ? info[open] : null;

  return (
    <>
      {info.map((i, n) => (
        <button
          key={i.title + n}
          ref={(el) => {
            dots.current[n] = el;
          }}
          type="button"
          className={`ip-dot ${here[n] ? "" : "ip-skjult"} ${open === n ? "aaben" : ""}`}
          data-ude="1"
          aria-label={i.title}
          onClick={() => {
            setOpen(open === n ? null : n);
            if (open !== n) onOpen(i);
          }}
        >
          <span />
          <em>{i.title}</em>
        </button>
      ))}
      {card && (
        <div className="ip-card" key={open}>
          <button type="button" className="ip-luk" aria-label="Luk" onClick={() => setOpen(null)}>
            ×
          </button>
          {card.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={card.image} alt="" />
          )}
          {card.video && videoEmbed(card.video) && <iframe className="ip-video" src={videoEmbed(card.video)!} title={card.title} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen />}
          <h3>{card.title}</h3>
          {card.price && <div className="ip-price">{card.price}</div>}
          <p>{card.text}</p>
          {card.link && (
            <TourLink className="ip-link" href={card.link.href} label={card.link.label} onClick={() => onLink(card.link!.label, card.link!.href)}>
              {card.link.label} →
            </TourLink>
          )}
        </div>
      )}
    </>
  );
}

/** A YouTube/Vimeo link as its embeddable player (null for anything else). */
export function videoEmbed(url: string): string | null {
  const yt = /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/.exec(url);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}?rel=0`;
  const vimeo = /vimeo\.com\/(?:video\/)?(\d+)/.exec(url);
  return vimeo ? `https://player.vimeo.com/video/${vimeo[1]}` : null;
}

/**
 * Prototype tool: click a spot in the tour, get the info point's setup with
 * its exact 3D position (copied to the clipboard).
 */
export function usePlaceInfo(sdk: MpSdk | null, frame: React.RefObject<HTMLIFrameElement | null>, currentSs: () => number | null) {
  const [result, setResult] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);

  useEffect(() => {
    if (!placing || !sdk) return;
    let last: Vec3 | null = null;
    const doc = frame.current?.contentDocument;
    const onClick = () => {
      if (!last) return setResult("Klik på en flade i rummet.");
      const p = { x: +last.x.toFixed(2), y: +last.y.toFixed(2), z: +last.z.toFixed(2) };
      const ss = currentSs();
      const snippet = `{ title: "", text: "", position: { x: ${p.x}, y: ${p.y}, z: ${p.z} }, ss: [${ss ?? ""}] },`;
      navigator.clipboard?.writeText(snippet).catch(() => {});
      setResult(snippet);
      setPlacing(false);
    };
    const sub = sdk.Pointer?.intersection.subscribe((hit) => (last = hit?.position ?? null));
    doc?.addEventListener("click", onClick, true);
    return () => {
      sub?.cancel();
      doc?.removeEventListener("click", onClick, true);
    };
  }, [placing, sdk, frame, currentSs]);

  return { placing, setPlacing, result };
}

export const INFO_CSS = `
.ip-dot{position:absolute;left:0;top:0;z-index:5;width:0;height:0;border:0;padding:0;background:none;cursor:pointer}
.ip-dot[data-ude="1"],.ip-dot.ip-skjult{display:none}
.ip-dot span{position:absolute;left:-14px;top:-14px;width:28px;height:28px;border-radius:50%;background:var(--c-accent);border:3px solid #fff;box-shadow:0 3px 12px rgba(0,0,0,.4)}
.ip-dot span::after{content:"";position:absolute;inset:-9px;border-radius:50%;border:2px solid #fff;animation:ipPuls 1.8s ease-out infinite}
@keyframes ipPuls{from{transform:scale(.6);opacity:.9}to{transform:scale(1.4);opacity:0}}
.ip-dot em{position:absolute;left:20px;top:-13px;white-space:nowrap;font-style:normal;font-size:13px;font-weight:800;background:#fff;color:#1d2a30;border-radius:999px;padding:4px 11px;box-shadow:0 3px 10px rgba(0,0,0,.25);opacity:0;transform:translateX(-6px);transition:opacity .2s,transform .2s;pointer-events:none}
.ip-dot:hover em,.ip-dot.aaben em{opacity:1;transform:none}
.ip-card{position:absolute;right:20px;top:50%;translate:0 -50%;z-index:10;width:min(340px,calc(100% - 40px));padding:16px 18px 18px;border-radius:18px;background:#fff;color:#1d2a30;box-shadow:0 16px 44px rgba(0,0,0,.35);animation:hvIn .3s ease both}
.ip-card img{width:100%;aspect-ratio:16/10;object-fit:cover;border-radius:12px;margin-bottom:12px}
.ip-video{display:block;width:100%;aspect-ratio:16/9;border:0;border-radius:12px;margin-bottom:12px;background:#000}
.ip-price{margin:-2px 0 8px;font-size:18px;font-weight:800;color:var(--c-accent-dark,var(--c-main))}
.ip-card h3{margin:0 30px 6px 0;font-family:var(--font-heading);font-size:22px;font-weight:800;color:var(--c-main)}
.ip-card p{margin:0 0 14px;font-size:15px;line-height:1.5;color:#3d4a50}
.ip-luk{position:absolute;top:10px;right:10px;width:32px;height:32px;border:0;border-radius:50%;background:#f1f2f3;font-size:20px;cursor:pointer}
.ip-link{display:inline-block;padding:10px 16px;border-radius:999px;background:var(--c-accent);color:#fff;font-weight:800;font-size:14px;text-decoration:none}
@media (max-width:760px){
  .ip-card{top:auto;bottom:0;right:0;left:0;width:auto;translate:none;border-radius:18px 18px 0 0;padding-bottom:calc(18px + env(safe-area-inset-bottom,0px))}
}
`;
