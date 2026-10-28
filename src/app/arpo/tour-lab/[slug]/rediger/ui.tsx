"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import "pannellum/build/pannellum.css";
import { registerTourFile, uploadTourFile } from "@/lib/actions/tour-files";
import { IMAGE_HREF, PANO_HFOV, panoHfov } from "../../tours/places";
import type { TourConfig } from "../../tours/types";

/* The editor's building blocks - Apple-style fields, switches and groups. */

export const input =
  "w-full rounded-[10px] border-0 bg-[#f2f2f7] px-3 py-2 text-[15px] text-[#1d1d1f] placeholder:text-[#8e8e93] transition focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0071e3]";
export const label = "block text-[13px] font-medium text-[#6e6e73]";

export function Icon({ d, className = "h-[18px] w-[18px]" }: { d: string; className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} dangerouslySetInnerHTML={{ __html: d }} />;
}

/** A white, rounded group of settings - like a section in the iPhone's Settings. */
export function Group({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section>
      {title && <h3 className="mb-1.5 px-1 text-[13px] font-medium uppercase tracking-wide text-[#6e6e73]">{title}</h3>}
      <div className="space-y-4 rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,.04)] ring-1 ring-black/[.04]">{children}</div>
    </section>
  );
}

export function Field({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span className={label}>{title}</span>
      {children}
      {hint && <p className="text-[12px] leading-snug text-[#8e8e93]">{hint}</p>}
    </div>
  );
}

/** An iOS-style switch with its label on the left. */
export function Toggle({ on, onChange, title, hint }: { on: boolean; onChange: (on: boolean) => void; title: string; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span>
        <span className="block text-[15px] text-[#1d1d1f]">{title}</span>
        {hint && <span className="block text-[12px] leading-snug text-[#8e8e93]">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={title}
        onClick={() => onChange(!on)}
        className={`relative h-[31px] w-[51px] flex-none rounded-full transition-colors duration-200 ${on ? "bg-[#34c759]" : "bg-[#e9e9eb]"}`}
      >
        <span className={`absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,.15),0_1px_1px_rgba(0,0,0,.16)] transition-all duration-200 ${on ? "left-[22px]" : "left-[2px]"}`} />
      </button>
    </div>
  );
}

/** A segmented control. */
export function Choice<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-[9px] bg-[#e9e9eb] p-[2px]">
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`flex-1 rounded-[7px] px-3 py-[5px] text-[13px] font-medium transition ${v === value ? "bg-white text-[#1d1d1f] shadow-[0_3px_8px_rgba(0,0,0,.12),0_3px_1px_rgba(0,0,0,.04)]" : "text-[#1d1d1f]/70 hover:text-[#1d1d1f]"}`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}


/** The live preview, as the editors use it: where it stands, a photo of what it shows, and showing a place. */
export type PreviewApi = {
  view: () => Promise<{ href?: string; room?: string | null; error?: string }>;
  shot: () => Promise<{ image?: string; error?: string }>;
  /** Waits for a click in the preview: the spot in the room (for a tag), the scan point and the room. */
  pick: () => Promise<{ position?: { x: number; y: number; z: number }; ss?: number | null; room?: string | null; error?: string }>;
  go: (name: string, href: string) => void;
  /** The 360° picture open in the preview: its direction, zoom (view width) and whether the preview is a phone. */
  /** The device the preview is set to (Computer / Mobil over it). */
  device: () => "computer" | "mobil";
  panoView: () => Promise<{ yaw?: number; pitch?: number; hfov?: number; phone?: boolean; image?: string; error?: string }>;
  /** Where the drone picture in the preview looks, and whether the preview is a phone. */
  droneView: () => Promise<{ yaw?: number; pitch?: number; hfov?: number; phone?: boolean; error?: string }>;
};

/** The scan point number (ss) of a link to a place in the tour. */
export const ssOfHref = (href: string) => {
  const ss = Number(new URLSearchParams(href.split("?")[1] ?? "").get("ss"));
  return Number.isFinite(ss) && ss > 0 ? ss : null;
};

/** Where the editor's uploads go: the tour, and whether Vercel Blob is set up (big files, videos). */
export const FilesContext = createContext<{ slug: string; blob: boolean }>({ slug: "", blob: false });

/** Uploads a file for the tour and returns its address - straight to Vercel Blob when it's there, otherwise via Arpo (max 4 MB). */
export async function uploadToTour(slug: string, file: File, blob: boolean): Promise<string> {
  if (blob) {
    const { upload } = await import("@vercel/blob/client");
    const result = await upload(`tours/${slug}/${file.name}`, file, { access: "public", handleUploadUrl: "/api/tour-files/upload", contentType: file.type });
    await registerTourFile(slug, { url: result.url, name: file.name, contentType: file.type, size: file.size });
    return result.url;
  }
  const form = new FormData();
  form.set("file", file);
  const r = await uploadTourFile(slug, form);
  if (!r.ok) throw new Error(r.error);
  return r.url;
}

/** A button that picks a file and uploads it. */
export function UploadButton({ accept, onDone, label = "Upload", className }: { accept: string; onDone: (url: string) => void; label?: string; className?: string }) {
  const { slug, blob } = useContext(FilesContext);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col">
      <label className={className ?? "cursor-pointer rounded-xl bg-white px-3 py-2 text-center text-[14px] font-medium text-[#0071e3] ring-1 ring-black/[.06] hover:bg-[#0071e3]/5"}>
        {busy ? "Uploader…" : label}
        <input
          type="file"
          accept={accept}
          className="hidden"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setBusy(true);
            setError(null);
            try {
              onDone(await uploadToTour(slug, file, blob));
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            }
            setBusy(false);
          }}
        />
      </label>
      {error && <span className="mt-1 text-[12px] text-[#ff3b30]">{error}</span>}
    </span>
  );
}

/** The files a setup takes from other sites (that could disappear) - mirrors fileSlots in src/lib/tour-files.ts. */
export function outsideFiles(c: TourConfig): string[] {
  const all = [c.logo, c.favicon, c.cover?.image, c.cover?.imageMobile, c.intro?.poster, c.map?.image, ...(c.places ?? []).map((p) => p.image), ...(c.intro?.sources ?? []).map((s) => s.src), ...(c.info ?? []).map((i) => i.image), ...(c.guide?.stops ?? []).map((s) => ("audio" in s ? s.audio : undefined))];
  return all.filter((src): src is string => {
    if (!src || !/^https?:\/\//i.test(src)) return false;
    return !/(^|\.)(arpo\.dk|nextview360\.dk|blob\.vercel-storage\.com|localhost)$/.test(new URL(src).hostname);
  });
}

/** A typed address with https:// in front when it has no scheme (links, # and mailto/tel are kept). */
export const withProtocol = (url: string) => (/^(https?:|mailto:|tel:|#)/i.test(url.trim()) ? url.trim() : `https://${url.trim()}`);

type PanoViewSetting = { desktop?: number; mobile?: number; yaw?: number; pitch?: number };

/**
 * How a 360° picture opens (shown only for a 2:1 picture): where it looks -
 * picked by turning a small 360° view - and how zoomed, on a computer and on
 * a phone. Unset = the normal: straight ahead, a computer a little zoomed out,
 * a phone a little zoomed in.
 */
export function PanoZoom({
  src,
  value,
  onChange,
  preview,
  name = "",
}: {
  src: string;
  value?: PanoViewSetting;
  onChange: (v: PanoViewSetting | undefined) => void;
  /** With the editor's preview: open the picture there and save what it shows (direction, and zoom for the device it shows). */
  preview?: PreviewApi;
  name?: string;
}) {
  const [is360, setIs360] = useState<boolean | null>(null);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const [picking, setPicking] = useState(false);
  /** The device whose zoom is being set - its view shown in a small window while the slider moves. */
  const [look, setLook] = useState<"desktop" | "mobile" | null>(null);
  /** The big preview is opened on this picture once, the first time a slider is moved. */
  const shownInPreview = useRef(false);
  const box = useRef<HTMLDivElement>(null);
  const viewer = useRef<{ getYaw(): number; getPitch(): number; destroy(): void } | null>(null);
  useEffect(() => {
    const img = new Image();
    img.onload = () => setIs360(Math.abs(img.naturalWidth / img.naturalHeight - 2) < 0.05);
    img.onerror = () => setIs360(false);
    img.src = src;
  }, [src]);
  // The small 360° view to turn to where it should start.
  useEffect(() => {
    if (!picking) return;
    let dead = false;
    (async () => {
      if (!window.pannellum) await import("pannellum/build/pannellum.js");
      if (dead || !box.current || !window.pannellum) return;
      viewer.current = window.pannellum.viewer(box.current, {
        type: "equirectangular",
        panorama: src,
        autoLoad: true,
        showFullscreenCtrl: false,
        hfov: 100,
        yaw: value?.yaw ?? 0,
        pitch: value?.pitch ?? -10,
      }) as unknown as { getYaw(): number; getPitch(): number; destroy(): void };
    })();
    return () => {
      dead = true;
      viewer.current?.destroy();
      viewer.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- opened once per picking; the saved view is only where it opens
  }, [picking, src]);
  if (!is360) return null;
  const put = (patch: Partial<PanoViewSetting>) => {
    const next: PanoViewSetting = { ...value, ...patch };
    (Object.keys(next) as (keyof PanoViewSetting)[]).forEach((k) => next[k] == null && delete next[k]);
    onChange(Object.keys(next).length ? next : undefined);
  };
  return (
    // Inside a menu row you can drag to reorder: dragging here turns the picture instead, never moves the row.
    <div
      className="space-y-2 rounded-xl bg-white p-2.5 ring-1 ring-black/[.06]"
      onDragStart={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <p className="text-[12px] font-medium text-[#1d1d1f]" title="Gælder billedet overalt i touren - også hvis det bruges både i menuen og på luftfotoet">360°-visning <span className="font-normal text-[#8e8e93]">· gælder billedet overalt</span></p>
      {preview ? (
        <div className="space-y-1.5">
          <div className="flex gap-2">
            <button type="button" className="flex-1 rounded-lg bg-[#f2f2f7] py-1.5 text-[12px] font-medium text-[#0071e3]" onClick={() => (setNote(null), preview.go(name, IMAGE_HREF + src))}>
              Vis i forhåndsvisningen
            </button>
            <button
              type="button"
              className="flex-1 rounded-lg bg-[#0071e3] py-1.5 text-[12px] font-medium text-white"
              onClick={async () => {
                setNote(null);
                const v = await preview.panoView();
                if (v.error || v.yaw == null || v.hfov == null) return setNote({ text: v.error ?? "Forhåndsvisningen svarede ikke.", error: true });
                if (v.image !== src) return setNote({ text: "Forhåndsvisningen viser et andet billede - tryk Vis i forhåndsvisningen først.", error: true });
                const phone = preview.device() === "mobil";
                // The tour picks its zoom by its width: a narrow Computer preview shows the phone view, so its zoom can't be read as a computer's.
                if (!phone && v.phone) return setNote({ text: "Forhåndsvisningen er så smal, at touren viser mobilvisningen. Tryk Stor skærm over forhåndsvisningen, og gem igen.", error: true });
                put({ yaw: Math.round(v.yaw), pitch: Math.round(v.pitch ?? 0), [phone ? "mobile" : "desktop"]: Math.round(((v.phone ? PANO_HFOV.mobile : PANO_HFOV.desktop) / v.hfov) * 100) / 100 });
                setNote({ text: `Gemt: hvor det starter, og zoom på ${phone ? "mobil" : "computer"}. Skift til ${phone ? "Computer" : "Mobil"} over forhåndsvisningen og gem igen for at sætte zoom dér.` });
              }}
            >
              Gem det, du ser
            </button>
          </div>
          <p className="text-[11px] leading-snug text-[#8e8e93]">Drej og zoom billedet i forhåndsvisningen, og tryk Gem det, du ser. Zoomen gemmes for den enhed, forhåndsvisningen viser.</p>
          {note && <p className={`text-[11px] leading-snug ${note.error ? "text-[#ff3b30]" : "text-[#34c759]"}`}>{note.text}</p>}
          {value?.yaw != null && (
            <button type="button" className="text-[12px] text-[#8e8e93] hover:text-[#0071e3]" onClick={() => put({ yaw: undefined, pitch: undefined })}>
              Start lige frem igen
            </button>
          )}
        </div>
      ) : picking ? (
        <div className="space-y-1.5">
          <div className="relative h-44 w-full overflow-hidden rounded-lg bg-black">
            <div ref={box} className="absolute inset-0" />
          </div>
          <p className="text-[11px] text-[#8e8e93]">Træk til det, man skal se først.</p>
          <div className="flex gap-2">
            <button
              type="button"
              className="flex-1 rounded-lg bg-[#0071e3] py-1.5 text-[12px] font-medium text-white"
              onClick={() => {
                const v = viewer.current;
                if (v) put({ yaw: Math.round(v.getYaw()), pitch: Math.round(v.getPitch()) });
                setPicking(false);
              }}
            >
              Start her
            </button>
            <button type="button" className="rounded-lg bg-[#f2f2f7] px-3 py-1.5 text-[12px] font-medium" onClick={() => setPicking(false)}>
              Fortryd
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-[12px]">
          <button type="button" className="rounded-lg bg-[#f2f2f7] px-3 py-1.5 font-medium text-[#0071e3]" onClick={() => setPicking(true)}>
            {value?.yaw != null ? "Skift hvor det starter" : "Vælg hvor det starter"}
          </button>
          {value?.yaw != null && (
            <button type="button" className="text-[#8e8e93] hover:text-[#0071e3]" onClick={() => put({ yaw: undefined, pitch: undefined })}>
              Lige frem
            </button>
          )}
        </div>
      )}
      {(["desktop", "mobile"] as const).map((k) => (
        <div key={k} className="flex items-center gap-2 text-[12px] text-[#6e6e73]">
          <span className="w-16 flex-none">{k === "desktop" ? "Computer" : "Mobil"}</span>
          <input
            type="range"
            min={0.7}
            max={2.5}
            step={0.05}
            className="w-full accent-[#0071e3]"
            value={value?.[k] ?? 1}
            onPointerDown={() => setLook(k)}
            onFocus={() => setLook(k)}
            onChange={(e) => {
              setLook(k);
              // The big preview shows the picture too (it follows the setting live) - opened once, not on every step.
              if (preview && !shownInPreview.current) {
                shownInPreview.current = true;
                preview.go(name, IMAGE_HREF + src);
              }
              put({ [k]: Number(e.target.value) });
            }}
          />
          <span className="w-16 flex-none text-right tabular-nums">{value?.[k] != null ? `${value[k]!.toFixed(2)}×` : "Standard"}</span>
          {value?.[k] != null && (
            <button type="button" title="Tilbage til standard" className="text-[#0071e3]" onClick={() => put({ [k]: undefined })}>
              ↺
            </button>
          )}
        </div>
      ))}
      {look && !picking && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] text-[#8e8e93]">
            <span>Sådan ser det ud på {look === "desktop" ? "en computer" : "en mobil"}</span>
            <button type="button" className="hover:text-[#1d1d1f]" onClick={() => setLook(null)}>
              Skjul
            </button>
          </div>
          <ZoomPeek src={src} yaw={value?.yaw ?? 0} pitch={value?.pitch ?? -10} hfov={panoHfov(look === "mobile", value?.[look] ?? 1)} phone={look === "mobile"} />
        </div>
      )}
      <p className="text-[11px] leading-snug text-[#8e8e93]">Zoom: standard er lidt zoomet ud på computer og lidt ind på mobil. Over 1× er tættere på.</p>
    </div>
  );
}

/** A small window with the picture as a device opens it - framed like its screen, zoomed as set, following the slider. */
function ZoomPeek({ src, yaw, pitch, hfov, phone }: { src: string; yaw: number; pitch: number; hfov: number; phone: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const viewer = useRef<{ setHfov(h: number, animated?: boolean): void; lookAt(p: number, y: number, h: number, animated?: boolean): void; destroy(): void } | null>(null);
  const latest = useRef({ yaw, pitch, hfov });
  useEffect(() => {
    latest.current = { yaw, pitch, hfov };
    viewer.current?.lookAt(pitch, yaw, hfov, false);
  }, [yaw, pitch, hfov]);
  useEffect(() => {
    let dead = false;
    (async () => {
      if (!window.pannellum) await import("pannellum/build/pannellum.js");
      if (dead || !box.current || !window.pannellum) return;
      const v = latest.current;
      viewer.current = window.pannellum.viewer(box.current, {
        type: "equirectangular",
        panorama: src,
        autoLoad: true,
        showControls: false,
        mouseZoom: false,
        draggable: false,
        minHfov: 20,
        maxHfov: 130,
        hfov: v.hfov,
        yaw: v.yaw,
        pitch: v.pitch,
      }) as unknown as NonNullable<typeof viewer.current>;
    })();
    return () => {
      dead = true;
      viewer.current?.destroy();
      viewer.current = null;
    };
  }, [src, phone]);
  return (
    <div className={`relative mx-auto overflow-hidden rounded-lg bg-black ring-1 ring-black/[.06] ${phone ? "aspect-[9/19.5] w-[45%]" : "aspect-[16/10] w-full"}`}>
      <div ref={box} className="absolute inset-0" />
    </div>
  );
}
