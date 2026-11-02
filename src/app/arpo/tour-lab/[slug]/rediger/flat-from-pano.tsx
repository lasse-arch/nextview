"use client";

import { useContext, useEffect, useRef, useState } from "react";
import type { TourConfig, TourPoint } from "../../tours/types";
import { Choice, Field, FilesContext, Group, uploadToTour } from "./ui";

/*
 * "Et fladt luftfoto ud af 360°-fotoet": the pladskort (and everything else
 * that needs a picture taken straight down) works on a flat photo - so here
 * one is made from the 360° aerial: the view straight down from where the
 * drone hung, turned so the chosen way is up, as wide as chosen. It becomes
 * the start picture; the points on the 360° photo move with it (those it
 * shows), and the 360° photo itself can stay as a point in the middle -
 * "Se det hele i 360°".
 */

type Edit = (fn: (d: TourConfig) => void) => void;
const small = "px-1 text-[12px] leading-snug text-[#8e8e93]";
const rad = Math.PI / 180;

/** Pixels of the 360° photo, to read from. */
type Source = { data: Uint8ClampedArray; w: number; h: number };

function loadSource(src: string, maxW: number): Promise<Source> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const w = Math.min(maxW, img.naturalWidth);
      const h = Math.round((w * img.naturalHeight) / img.naturalWidth);
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const g = c.getContext("2d", { willReadFrequently: true })!;
      g.drawImage(img, 0, 0, w, h);
      try {
        resolve({ data: g.getImageData(0, 0, w, h).data, w, h });
      } catch {
        reject(new Error("360°-fotoet kan ikke læses her (det ligger på en anden side, der ikke tillader det). Gem filerne hos os først."));
      }
    };
    img.onerror = () => reject(new Error("360°-fotoet kunne ikke hentes."));
    img.src = src;
  });
}

/** Which way the flat photo's top faces (yaw, degrees), and how wide it is (degrees across, straight down). */
type Shot = { heading: number; fov: number };

/** The flat photo's frame: forward (its top) and right, on the ground. */
function frame(heading: number) {
  const t = heading * rad;
  return { F: [Math.sin(t), 0, Math.cos(t)], R: [Math.cos(t), 0, -Math.sin(t)] };
}

/** Draws the view straight down: for each pixel, the ray to the ground, read from the 360° photo (bilinear). */
function render(src: Source, size: number, shot: Shot): ImageData {
  const out = new ImageData(size, size);
  const k = Math.tan((shot.fov / 2) * rad);
  const { F, R } = frame(shot.heading);
  const { data, w, h } = src;
  const px = (x: number, y: number, c: number) => data[(y * w + x) * 4 + c];
  for (let j = 0; j < size; j++) {
    const v = ((j + 0.5) / size) * 2 - 1;
    for (let i = 0; i < size; i++) {
      const u = ((i + 0.5) / size) * 2 - 1;
      const f = -v * k;
      const r = u * k;
      const dx = f * F[0] + r * R[0];
      const dz = f * F[2] + r * R[2];
      const yaw = Math.atan2(dx, dz) / rad;
      const pitch = Math.atan2(-1, Math.hypot(dx, dz)) / rad;
      // Where in the photo: x around (yaw -180..180), y down (pitch 90..-90).
      let sx = ((yaw + 180) / 360) * w - 0.5;
      const sy = Math.min(h - 1.001, Math.max(0, ((90 - pitch) / 180) * h - 0.5));
      sx = ((sx % w) + w) % w;
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = (x0 + 1) % w;
      const y1 = Math.min(h - 1, y0 + 1);
      const ax = sx - x0;
      const ay = sy - y0;
      const o = (j * size + i) * 4;
      for (let c = 0; c < 3; c++) {
        const top = px(x0, y0, c) * (1 - ax) + px(x1, y0, c) * ax;
        const bottom = px(x0, y1, c) * (1 - ax) + px(x1, y1, c) * ax;
        out.data[o + c] = top * (1 - ay) + bottom * ay;
      }
      out.data[o + 3] = 255;
    }
  }
  return out;
}

/** A point on the 360° photo (x, y in % of it) on the flat photo (x, y in %) - null when it isn't on it (above the horizon, or outside). */
function spotOnFlat([x, y]: [number, number], shot: Shot): [number, number] | null {
  const yaw = ((x / 100) * 360 - 180) * rad;
  const pitch = (90 - (y / 100) * 180) * rad;
  const d = [Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw)];
  if (d[1] >= -0.02) return null;
  const s = -1 / d[1];
  const { F, R } = frame(shot.heading);
  const f = (d[0] * F[0] + d[2] * F[2]) * s;
  const r = (d[0] * R[0] + d[2] * R[2]) * s;
  const k = Math.tan((shot.fov / 2) * rad);
  const u = r / k;
  const v = -f / k;
  if (Math.abs(u) > 1 || Math.abs(v) > 1) return null;
  return [Math.round(((u + 1) / 2) * 1000) / 10, Math.round(((v + 1) / 2) * 1000) / 10];
}

export function FlatFromPano({ config, edit }: { config: TourConfig; edit: Edit }) {
  const M = config.map!;
  const { slug, blob } = useContext(FilesContext);
  const [shot, setShot] = useState<Shot>({ heading: 0, fov: 120 });
  const [keep360, setKeep360] = useState(true);
  const [preview, setPreview] = useState<Source | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  // A small copy to turn and zoom live; the real one is made from the full photo.
  useEffect(() => {
    let dead = false;
    loadSource(M.image, 2048)
      .then((s) => !dead && setPreview(s))
      .catch((e: unknown) => !dead && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      dead = true;
    };
  }, [M.image]);
  useEffect(() => {
    if (!preview || !canvas.current) return;
    const size = 320;
    canvas.current.width = size;
    canvas.current.height = size;
    canvas.current.getContext("2d")!.putImageData(render(preview, size, shot), 0, 0);
  }, [preview, shot]);
  const placed = Object.entries(M.spots).filter(([, s]) => spotOnFlat(s, shot)).length;
  const all = Object.keys(M.spots).length;

  async function make() {
    setBusy(true);
    setError(null);
    try {
      const src = await loadSource(M.image, 8192);
      // About as sharp as the 360° photo gives straight down - and never over 3000 px (a light file).
      const size = Math.round(Math.max(1200, Math.min(3000, ((src.w * shot.fov) / 360) * 1.4)));
      const c = document.createElement("canvas");
      c.width = size;
      c.height = size;
      c.getContext("2d")!.putImageData(render(src, size, shot), 0, 0);
      const file = await new Promise<File>((resolve, reject) =>
        c.toBlob((b) => (b ? resolve(new File([b], "luftfoto-oppefra.jpg", { type: "image/jpeg" })) : reject(new Error("Billedet kunne ikke laves."))), "image/jpeg", 0.86)
      );
      const url = await uploadToTour(slug, file, blob);
      const pano = M.image;
      edit((d) => {
        const m = d.map!;
        const spots: Record<string, [number, number]> = {};
        for (const [id, s] of Object.entries(m.spots)) {
          const flat = spotOnFlat(s, shot);
          if (flat) spots[id] = flat;
        }
        if (keep360) {
          const id = "luftfoto-360";
          if (!d.points.some((p) => p.id === id)) {
            if (!Object.keys(d.categories).length) d.categories = { steder: { name: "Steder", color: d.colors.accent } };
            const cat = Object.keys(d.categories)[0];
            const point: TourPoint = { id, name: "Se det hele i 360°", cat, icon: "kamera", yaw: 0, pitch: 0, tour: null, panorama: pano, text: "Hele stedet fra luften - drej rundt og se det hele.", chips: [] };
            d.points = [...d.points, point];
          }
          spots[id] = [50, 50];
        }
        d.map = { ...m, image: url, w: size, h: size, panorama: undefined, spots, start: { x: 50, y: 50, zoom: 1 }, startMobile: undefined };
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  return (
    <Group title="Pladskort over luftfotoet">
      <p className="text-[14px] leading-snug">Pladskortet skal ligge på et foto taget lige oppefra. Lav et ud af 360°-fotoet: det, dronen så lige nedad.</p>
      <div className="relative mx-auto aspect-square w-full max-w-[320px] overflow-hidden rounded-xl bg-[#f2f2f7]">
        <canvas ref={canvas} className="h-full w-full" />
        {!preview && !error && <span className="absolute inset-0 flex items-center justify-center text-[13px] text-[#8e8e93]">Henter 360°-fotoet …</span>}
        <span className="pointer-events-none absolute left-1/2 top-1.5 -translate-x-1/2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white">↑ op i billedet</span>
      </div>
      <Field title={`Hvilken vej er op: ${Math.round(shot.heading)}°`} hint="Drej, så billedet vender, som gæsterne kender stedet - fx indgangen nederst.">
        <input type="range" min={-180} max={180} step={1} value={shot.heading} onChange={(e) => setShot((s) => ({ ...s, heading: Number(e.target.value) }))} className="w-full" />
      </Field>
      <Field title={`Hvor meget med: ${shot.fov}°`} hint="Mere med = mere af stedet, men kanterne bliver strakt. Tag lige nok med til hele pladsen.">
        <input type="range" min={60} max={150} step={1} value={shot.fov} onChange={(e) => setShot((s) => ({ ...s, fov: Number(e.target.value) }))} className="w-full" />
      </Field>
      <Field title="360°-fotoet bagefter">
        <Choice
          value={keep360 ? "keep" : "drop"}
          options={[
            ["keep", "Behold som punkt i midten"],
            ["drop", "Brug det ikke"],
          ]}
          onChange={(v) => setKeep360(v === "keep")}
        />
      </Field>
      {all > 0 && <p className={small}>{placed} af {all} punkter er med på det flade foto og flyttes derhen - de andre (over horisonten eller uden for billedet) tages af kortet, men slettes ikke.</p>}
      <button type="button" disabled={!preview || busy} onClick={make} className="w-full rounded-xl bg-[#0071e3] py-2.5 text-[15px] font-medium text-white disabled:opacity-40">
        {busy ? "Laver det flade luftfoto …" : "Brug det som luftfoto"}
      </button>
      <p className={small}>Bagefter er luftfotoet fladt, og pladskortet kan lægges på her. Fortryd med Versioner, hvis det ikke blev godt.</p>
      {error && <p className="px-1 text-[12px] text-[#ff3b30]">{error}</p>}
    </Group>
  );
}
