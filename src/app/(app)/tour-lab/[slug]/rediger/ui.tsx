"use client";

import { createContext, useContext, useState } from "react";
import { registerTourFile, uploadTourFile } from "@/lib/actions/tour-files";
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
  const all = [c.logo, c.favicon, c.cover?.image, c.cover?.imageMobile, c.intro?.poster, c.map?.image, ...(c.places ?? []).map((p) => p.image), ...(c.intro?.sources ?? []).map((s) => s.src), ...(c.info ?? []).map((i) => i.image)];
  return all.filter((src): src is string => {
    if (!src || !/^https?:\/\//i.test(src)) return false;
    return !/(^|\.)(arpo\.dk|nextview360\.dk|blob\.vercel-storage\.com|localhost)$/.test(new URL(src).hostname);
  });
}
