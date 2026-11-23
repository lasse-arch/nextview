"use client";

import { useContext, useRef, useState } from "react";
import { cropTourPhoto } from "@/lib/actions/tour-ai";
import { FilesContext } from "./ui";

export type Crop = { x: number; y: number; w: number; h: number };

/** The part's shape: a portrait (4:5) - how a person is shown everywhere in the tour. */
const RATIO = 5 / 4;

/*
 * "Vælg udsnit": a person's photo with a portrait frame on it - drag it to the
 * part you want, make it bigger or smaller - and that part is cut out on the
 * server (lib/photo-crop.ts) and used everywhere the person is shown. The
 * original is kept, so the part can be chosen again.
 */
export function PhotoCropper({ src, crop, onDone, onClose }: { src: string; crop?: Crop; onDone: (image: string, crop: Crop) => void; onClose: () => void }) {
  const { slug } = useContext(FilesContext);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  const [size, setSize] = useState<{ W: number; H: number } | null>(null);
  const [frame, setFrame] = useState<Crop | null>(crop ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The frame's width as a fraction of the photo's (its height follows the 4:5 shape).
  const maxW = size ? Math.min(1, size.H / (RATIO * size.W)) : 1;
  const hOf = (w: number) => (size ? (w * RATIO * size.W) / size.H : w);
  const clamp = (f: Crop): Crop => {
    const w = Math.min(maxW, Math.max(0.1 * maxW, f.w));
    const h = Math.min(1, hOf(w));
    return { w, h, x: Math.min(1 - w, Math.max(0, f.x)), y: Math.min(1 - h, Math.max(0, f.y)) };
  };

  function loaded(img: HTMLImageElement) {
    const W = img.naturalWidth;
    const H = img.naturalHeight;
    setSize({ W, H });
    if (frame) return;
    // A first guess: as big as it goes, centred, near the top (where a face usually is).
    const w = Math.min(1, H / (RATIO * W));
    const h = Math.min(1, (w * RATIO * W) / H);
    setFrame({ w, h, x: (1 - w) / 2, y: Math.max(0, Math.min(1 - h, 0.15 * (1 - h))) });
  }

  async function save() {
    if (!frame) return;
    setBusy(true);
    setError(null);
    const r = await cropTourPhoto(slug, src, frame).catch(() => ({ ok: false as const, error: "Udsnittet kunne ikke laves." }));
    setBusy(false);
    if (!r.ok) return setError(r.error);
    onDone(r.url, frame);
  }

  const zoom = frame ? maxW / frame.w : 1;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="flex max-h-full w-full max-w-[560px] flex-col gap-3 overflow-auto rounded-2xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div>
          <p className="text-[15px] font-semibold">Vælg udsnit</p>
          <p className="text-[13px] leading-snug text-[#6e6e73]">Træk rammen hen over den del af billedet, der skal vises, og gør den større eller mindre. Udsnittet bruges overalt i touren - originalen gemmes.</p>
        </div>
        <div
          ref={box}
          className="relative mx-auto touch-none select-none overflow-hidden rounded-lg bg-[#f2f2f7]"
          onPointerMove={(e) => {
            const d = drag.current;
            const r = box.current?.getBoundingClientRect();
            if (!d || !r || !frame) return;
            setFrame(clamp({ ...frame, x: d.x + (e.clientX - d.px) / r.width, y: d.y + (e.clientY - d.py) / r.height }));
          }}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" draggable={false} className="block max-h-[60vh] max-w-full" onLoad={(e) => loaded(e.currentTarget)} />
          {frame && (
            <div
              className="absolute cursor-move rounded-sm ring-2 ring-white"
              style={{ left: `${frame.x * 100}%`, top: `${frame.y * 100}%`, width: `${frame.w * 100}%`, height: `${frame.h * 100}%`, boxShadow: "0 0 0 9999px rgba(0,0,0,.5)" }}
              onPointerDown={(e) => {
                e.currentTarget.parentElement?.setPointerCapture(e.pointerId);
                drag.current = { px: e.clientX, py: e.clientY, x: frame.x, y: frame.y };
              }}
            >
              <div className="pointer-events-none absolute inset-x-0 top-1/3 border-t border-white/40" />
              <div className="pointer-events-none absolute inset-x-0 top-2/3 border-t border-white/40" />
              <div className="pointer-events-none absolute inset-y-0 left-1/3 border-l border-white/40" />
              <div className="pointer-events-none absolute inset-y-0 left-2/3 border-l border-white/40" />
            </div>
          )}
        </div>
        <label className="flex items-center gap-3 text-[13px] text-[#6e6e73]">
          Zoom
          <input
            type="range"
            min={1}
            max={4}
            step={0.01}
            value={zoom}
            disabled={!frame}
            className="flex-1"
            onChange={(e) => {
              if (!frame) return;
              const w = maxW / Number(e.target.value);
              const h = hOf(w);
              // Zoom around the frame's middle.
              setFrame(clamp({ w, h, x: frame.x + frame.w / 2 - w / 2, y: frame.y + frame.h / 2 - h / 2 }));
            }}
          />
        </label>
        {error && <p className="text-[13px] text-[#d70015]">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="rounded-xl px-3 py-2 text-[14px] font-medium text-[#0071e3] hover:bg-[#0071e3]/5" onClick={onClose}>
            Annuller
          </button>
          <button type="button" disabled={!frame || busy} className="rounded-xl bg-[#0071e3] px-4 py-2 text-[14px] font-medium text-white disabled:opacity-50" onClick={save}>
            {busy ? "Klipper…" : "Brug udsnittet"}
          </button>
        </div>
      </div>
    </div>
  );
}
