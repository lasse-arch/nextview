"use client";

import { useContext, useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { createPortal } from "react-dom";
import { cutTourView, editTourImage, imageAiReady, pasteTourEdit, saveGeminiKey } from "@/lib/actions/tour-image-ai";
import { FilesContext, Icon, input } from "./ui";

const SPARK = '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/>';

const IDEAS = ["Gør græsset sommergrønt og himlen blå", "Fyld poolen med vand, og læg solsenge rundt om", "Gør lyset varmere, som en sommeraften", "Fjern bilerne på parkeringspladsen"];

/*
 * The AI's last suggestion for a picture is kept on this computer (the new
 * file is already stored with the tour), so it isn't lost - nor paid for
 * again - when the panel closes, another row opens or the page reloads. It
 * goes when it's used or thrown away.
 */
const kept = (slug: string, src: string) => `ai-forslag:${slug}:${src}`;
const keptEvent = "ai-forslag";
function readKept(slug: string, src: string): string | null {
  try {
    return localStorage.getItem(kept(slug, src));
  } catch {
    return null;
  }
}
function writeKept(slug: string, src: string, url: string | null) {
  try {
    if (url) localStorage.setItem(kept(slug, src), url);
    else localStorage.removeItem(kept(slug, src));
  } catch {}
  window.dispatchEvent(new Event(keptEvent));
}

/**
 * "Ret med AI" next to a picture: describe the change, see the new picture
 * next to the old, and use it - or try again. The old picture is kept; the
 * tour only changes when "Brug det nye" is pressed (and then saved).
 */
export function AiImageButton({ src, onUse }: { src: string; onUse: (url: string) => void }) {
  const { slug } = useContext(FilesContext);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState<boolean | null>(null);
  const [key, setKey] = useState("");
  const [ask, setAsk] = useState("");
  const result = useSyncExternalStore(
    (cb) => (window.addEventListener(keptEvent, cb), () => window.removeEventListener(keptEvent, cb)),
    () => (src ? readKept(slug, src) : null),
    () => null
  );
  const setResult = (url: string | null) => writeKept(slug, src, url);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  /** Before and after, big - side by side, or one over the other with a slider. */
  const [big, setBig] = useState(false);
  /** A 360° photo (2:1): only the view turned to in the small 360° window is changed. */
  const [is360, setIs360] = useState(false);
  useEffect(() => {
    if (!src || !open) return;
    const img = new Image();
    img.onload = () => setIs360(Math.abs(img.naturalWidth / img.naturalHeight - 2) < 0.05);
    img.src = src;
  }, [src, open]);
  const view = useRef<{ yaw: number; pitch: number; hfov: number }>({ yaw: 0, pitch: -20, hfov: 75 });
  /** Which one the 360° window shows once there's a suggestion. */
  const [showAfter, setShowAfter] = useState(true);

  if (!src) return null;
  if (!open)
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          if (ready == null) start(async () => setReady(await imageAiReady().catch(() => false)));
        }}
        className="inline-flex items-center gap-1.5 rounded-xl bg-[#d97757]/10 px-3 py-2 text-[14px] font-medium text-[#b4532f] hover:bg-[#d97757]/15"
      >
        <Icon d={SPARK} className="h-4 w-4" />
        {result ? "Ret med AI · et forslag venter" : "Ret med AI"}
      </button>
    );

  return (
    <div className="space-y-2 rounded-xl bg-white p-3 ring-1 ring-black/[.06]">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-[#b4532f]">
          <Icon d={SPARK} className="h-4 w-4" /> Ret billedet med AI
        </span>
        <button type="button" className="text-[13px] text-[#8e8e93] hover:text-[#1d1d1f]" onClick={() => setOpen(false)}>
          Luk
        </button>
      </div>

      {is360 && (
        <>
          <PanoWindow key={result && showAfter ? result : src} src={result && showAfter ? result : src} view={view} />
          {result ? (
            <div className="flex rounded-lg bg-[#f2f2f7] p-0.5 text-[12px] font-medium">
              {(
                [
                  [false, "Før"],
                  [true, "Efter (rettet af AI)"],
                ] as const
              ).map(([after, label]) => (
                <button key={label} type="button" onClick={() => setShowAfter(after)} className={`flex-1 rounded-md py-1 ${showAfter === after ? "bg-white shadow-sm" : "text-[#6e6e73]"}`}>
                  {label}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-[11px] leading-snug text-[#8e8e93]">Drej og zoom hen til det, der skal rettes - kun det, du ser i rammen, bliver rettet. Resten af 360°-billedet røres ikke.</p>
          )}
        </>
      )}
      <ManualEdit slug={slug} base={result ?? src} is360={is360} view={view} onResult={(url) => (setResult(url), setShowAfter(true))} onError={setError} />
      {ready === false ? (
        <>
          <p className="text-[12px] leading-snug text-[#6e6e73]">
            Billeder rettes af Googles Gemini-billedmodel (nextviewAI kan kun se billeder, ikke tegne). Indsæt en API-nøgle fra Google AI Studio (aistudio.google.com) - den gemmes i Arpo til alle admins.
          </p>
          <input className={`${input} bg-[#f2f2f7]`} type="password" placeholder="Gemini API-nøgle" value={key} onChange={(e) => setKey(e.target.value)} />
          <button
            type="button"
            disabled={pending || !key.trim()}
            className="w-full rounded-xl bg-[#1d1d1f] py-2 text-[14px] font-medium text-white disabled:opacity-40"
            onClick={() =>
              start(async () => {
                setError(null);
                const r = await saveGeminiKey(key);
                if (!r.ok) return setError(r.error);
                setKey("");
                setReady(true);
              })
            }
          >
            {pending ? "Tjekker nøglen…" : "Gem nøgle"}
          </button>
        </>
      ) : (
        <>
          <textarea
            className={`${input} min-h-[64px] resize-y bg-[#f2f2f7]`}
            placeholder="Hvad skal ændres? Fx: gør græsset sommergrønt og fyld poolen"
            value={ask}
            onChange={(e) => setAsk(e.target.value)}
          />
          {!ask && (
            <div className="flex flex-wrap gap-1.5">
              {IDEAS.map((i) => (
                <button key={i} type="button" onClick={() => setAsk(i)} className="rounded-full bg-[#f2f2f7] px-2.5 py-1 text-[12px] text-[#1d1d1f] hover:bg-[#e9e9eb]">
                  {i}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            disabled={pending || ready == null || !ask.trim()}
            className="w-full rounded-xl bg-[#d97757] py-2 text-[14px] font-medium text-white hover:bg-[#c96442] disabled:opacity-40"
            onClick={() =>
              start(async () => {
                setError(null);
                const r = await editTourImage(slug, result ?? src, ask, is360 ? { ...view.current } : undefined);
                if (!r.ok) {
                  if (r.error.startsWith("Gemini-nøglen")) setReady(false);
                  return setError(r.error);
                }
                setResult(r.url);
                setShowAfter(true);
              })
            }
          >
            {pending ? "AI'en retter billedet… (10-30 sek.)" : result ? "Ret det nye videre" : "Ret billedet"}
          </button>
        </>
      )}
      {result && big && <Compare before={src} after={result} onClose={() => setBig(false)} />}
      {result && (
        <>
          <div className={`grid grid-cols-2 gap-1.5 ${is360 ? "hidden" : ""}`}>
            <figure>
              <button type="button" className="block w-full" onClick={() => setBig(true)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="aspect-[4/3] w-full rounded-lg object-cover ring-1 ring-black/[.06]" />
              </button>
              <figcaption className="mt-0.5 text-center text-[11px] text-[#8e8e93]">Nu</figcaption>
            </figure>
            <figure>
              <button type="button" className="block w-full" onClick={() => setBig(true)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={result} alt="" className="aspect-[4/3] w-full rounded-lg object-cover ring-2 ring-[#d97757]" />
              </button>
              <figcaption className="mt-0.5 text-center text-[11px] text-[#8e8e93]">Rettet af AI (tryk for stort)</figcaption>
            </figure>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="flex-1 rounded-xl bg-[#0071e3] py-2 text-[14px] font-medium text-white"
              onClick={() => {
                onUse(result);
                setResult(null);
                setAsk("");
                setOpen(false);
              }}
            >
              Brug det nye
            </button>
            <button type="button" className="flex-1 rounded-xl bg-[#f2f2f7] py-2 text-[14px] font-medium text-[#1d1d1f]" onClick={() => setResult(null)}>
              Forkast
            </button>
          </div>
        </>
      )}
      <p className="text-[11px] leading-snug text-[#8e8e93]">Det gamle billede bliver liggende. Touren ændres først, når du trykker &quot;Brug det nye&quot; og Gem.</p>
      {error && <p className="text-[12px] text-[#ff3b30]">{error}</p>}
    </div>
  );
}

type PanoViewer = { getYaw(): number; getPitch(): number; getHfov(): number; on(e: string, f: () => void): void; destroy(): void };

/**
 * A small 360° window to turn to the part to change - framed 3:2 like the
 * picture the AI gets. Where it looks is kept in `view` (also when it shows
 * the AI's version, so before and after are seen from the same place).
 */
function PanoWindow({ src, view }: { src: string; view: React.MutableRefObject<{ yaw: number; pitch: number; hfov: number }> }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let dead = false;
    let viewer: PanoViewer | null = null;
    let timer = 0;
    (async () => {
      if (!window.pannellum) await import("pannellum/build/pannellum.js");
      if (dead || !box.current || !window.pannellum) return;
      viewer = window.pannellum.viewer(box.current, {
        type: "equirectangular",
        panorama: src,
        autoLoad: true,
        showFullscreenCtrl: false,
        showZoomCtrl: true,
        hfov: view.current.hfov,
        minHfov: 25,
        maxHfov: 110,
        yaw: view.current.yaw,
        pitch: view.current.pitch,
      }) as unknown as PanoViewer;
      // Where it looks, kept as it moves.
      timer = window.setInterval(() => {
        if (viewer) view.current = { yaw: viewer.getYaw(), pitch: viewer.getPitch(), hfov: viewer.getHfov() };
      }, 250);
    })();
    return () => {
      dead = true;
      window.clearInterval(timer);
      viewer?.destroy();
    };
  }, [src, view]);
  return (
    <div className="relative aspect-[3/2] w-full overflow-hidden rounded-lg bg-black ring-1 ring-black/[.06]">
      <div ref={box} className="absolute inset-0" />
    </div>
  );
}

/**
 * Before and after over the whole screen: side by side, or the same view with
 * a line to drag across (the AI's change shows where the two differ).
 */
function Compare({ before, after, onClose }: { before: string; after: string; onClose: () => void }) {
  const [mode, setMode] = useState<"side" | "slider">("side");
  const [at, setAt] = useState(50);
  // Over the whole page (the editor's panels would otherwise clip and show through it).
  return createPortal(
    <div className="fixed inset-0 z-[1000] flex flex-col bg-[#111] p-4 text-white" role="dialog" aria-label="Før og efter" onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div className="mb-3 flex items-center gap-3">
        <div className="flex rounded-full bg-white/10 p-0.5 text-[13px]">
          {(
            [
              ["side", "Side om side"],
              ["slider", "Før/efter-skyder"],
            ] as const
          ).map(([m, label]) => (
            <button key={m} type="button" onClick={() => setMode(m)} className={`rounded-full px-3 py-1.5 font-medium ${mode === m ? "bg-white text-[#1d1d1f]" : "text-white/80"}`}>
              {label}
            </button>
          ))}
        </div>
        <button type="button" onClick={onClose} autoFocus className="ml-auto rounded-full bg-white/10 px-4 py-1.5 text-[13px] font-medium hover:bg-white/20">
          Luk
        </button>
      </div>
      {mode === "side" ? (
        <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-2">
          {(
            [
              [before, "Nu"],
              [after, "Rettet af AI"],
            ] as const
          ).map(([url, label]) => (
            <figure key={label} className="flex min-h-0 flex-col">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={label} className="min-h-0 w-full flex-1 rounded-lg object-contain" />
              <figcaption className="mt-1 text-center text-[12px] text-white/70">{label}</figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <div className="relative min-h-0 flex-1 select-none">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={before} alt="Nu" className="absolute inset-0 h-full w-full object-contain" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={after} alt="Rettet af AI" className="absolute inset-0 h-full w-full object-contain" style={{ clipPath: `inset(0 0 0 ${at}%)` }} />
          <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-[0_0_8px_rgba(0,0,0,.6)]" style={{ left: `${at}%` }} />
          <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-[12px]">Nu</span>
          <span className="absolute right-3 top-3 rounded-full bg-[#d97757] px-2.5 py-1 text-[12px]">Rettet af AI</span>
          <input
            type="range"
            min={0}
            max={100}
            value={at}
            onChange={(e) => setAt(Number(e.target.value))}
            aria-label="Før og efter"
            className="absolute bottom-3 left-1/2 w-[min(420px,80%)] -translate-x-1/2 accent-[#d97757]"
          />
        </div>
      )}
    </div>,
    document.body
  );
}

/** Where a downloaded 360° view was cut, so the changed one goes back in the same place - kept on this computer. */
const cutKey = (slug: string, base: string) => `ai-udsnit:${slug}:${base}`;

/**
 * "Ret selv i en anden AI": download the view (or the whole picture), change
 * it in ChatGPT, Gemini, Photoshop … and upload it again - it goes back where
 * it came from, and only where it changed.
 */
function ManualEdit({
  slug,
  base,
  is360,
  view,
  onResult,
  onError,
}: {
  slug: string;
  /** The picture it's cut from - the AI's suggestion, when there is one. */
  base: string;
  is360: boolean;
  view: React.MutableRefObject<{ yaw: number; pitch: number; hfov: number }>;
  onResult: (url: string) => void;
  onError: (e: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  /** Use the whole changed view (default) - or only where it differs, so the rest stays as sharp as the original. */
  const [mode, setMode] = useState<"hele" | "aendret">("hele");
  /** The last uploaded picture - to put it in again the other way without uploading it again. */
  const [last, setLast] = useState<File | null>(null);
  const file = useRef<HTMLInputElement>(null);

  function save(blob: Blob, name: string) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  }

  function download() {
    onError(null);
    start(async () => {
      if (is360) {
        const v = { ...view.current };
        const r = await cutTourView(base, v);
        if (!r.ok) return onError(r.error);
        try {
          localStorage.setItem(cutKey(slug, base), JSON.stringify(v));
        } catch {}
        setSaved(true);
        save(new Blob([Uint8Array.from(atob(r.jpeg), (c) => c.charCodeAt(0))], { type: "image/jpeg" }), `udsnit-${slug}-${r.width}x${r.height}.jpg`);
      } else {
        const res = await fetch(base).catch(() => null);
        if (!res?.ok) return void window.open(base, "_blank");
        const blob = await res.blob();
        save(blob, `billede-${slug}.${(blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg")}`);
      }
    });
  }

  async function upload(f: File, how = mode) {
    onError(null);
    setLast(f);
    let v: { yaw: number; pitch: number; hfov: number } | null = null;
    if (is360) {
      try {
        v = JSON.parse(localStorage.getItem(cutKey(slug, base)) ?? "null");
      } catch {}
      if (!v) return onError("Hent udsnittet her først - så ved Arpo, hvor det rettede skal sidde.");
    }
    // Made a JPEG of at most 3072 px here, so even a big PNG from the AI goes through quickly.
    const bmp = await createImageBitmap(f).catch(() => null);
    if (!bmp) return onError("Billedet kunne ikke læses.");
    const k = Math.min(1, 3072 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * k);
    canvas.height = Math.round(bmp.height * k);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const jpeg = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.93));
    if (!jpeg) return onError("Billedet kunne ikke læses.");
    const form = new FormData();
    form.append("file", new File([jpeg], "rettet.jpg", { type: "image/jpeg" }));
    start(async () => {
      const r = await pasteTourEdit(slug, base, v, form, how);
      if (!r.ok) return onError(r.error);
      // The new picture has the same geometry - so its view is remembered too, and a picture can be uploaded again straight away.
      if (v)
        try {
          localStorage.setItem(cutKey(slug, r.url), JSON.stringify(v));
        } catch {}
      onResult(r.url);
    });
  }

  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="w-full rounded-xl bg-[#f2f2f7] py-2 text-[13px] font-medium text-[#1d1d1f] hover:bg-[#e9e9eb]">
        Ret selv i en anden AI (ChatGPT, Gemini, Photoshop …)
      </button>
    );
  return (
    <div className="space-y-2 rounded-xl bg-[#f7f7f9] p-3">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold">Ret selv i en anden AI</span>
        <button type="button" className="text-[12px] text-[#8e8e93] hover:text-[#1d1d1f]" onClick={() => setOpen(false)}>
          Skjul
        </button>
      </div>
      <ol className="list-decimal space-y-1 pl-4 text-[12px] leading-snug text-[#6e6e73]">
        <li>{is360 ? "Drej og zoom hen til det, der skal rettes, og hent udsnittet." : "Hent billedet."}</li>
        <li>Ret det i fx ChatGPT, Gemini, FLUX eller Photoshop. Bed AI&apos;en beholde formatet og beskæringen præcis.</li>
        <li>Upload det rettede - det sættes ind præcis dér, det kom fra, og resten af billedet beholder sin fulde skarphed.</li>
      </ol>
      <div className="space-y-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[#8e8e93]">Sæt det rettede ind</span>
        <div className="flex rounded-lg bg-white p-0.5 text-[12px] font-medium ring-1 ring-black/[.06]">
          {(
            [
              ["hele", "Hele udsnittet"],
              ["aendret", "Kun det ændrede"],
            ] as const
          ).map(([m, label]) => (
            <button key={m} type="button" onClick={() => setMode(m)} className={`flex-1 rounded-md py-1 ${mode === m ? "bg-[#1d1d1f] text-white" : "text-[#6e6e73]"}`}>
              {label}
            </button>
          ))}
        </div>
        <p className="text-[11px] leading-snug text-[#8e8e93]">
          {mode === "hele"
            ? "Bruger hele det rettede billede - til rengøring, farver og lys. Kanterne tones blødt over i resten af billedet."
            : "Bruger kun de steder, hvor noget tydeligt er ændret (fx noget tilføjet eller fjernet) - resten forbliver lige så skarpt som originalen."}
        </p>
        {last && !pending && (
          <button type="button" className="text-[12px] font-medium text-[#0071e3] hover:underline" onClick={() => upload(last, mode)}>
            Sæt det sidst uploadede ind igen som &quot;{mode === "hele" ? "Hele udsnittet" : "Kun det ændrede"}&quot;
          </button>
        )}
      </div>
      <div className="flex gap-2">
        <button type="button" disabled={pending} onClick={download} className="flex-1 rounded-lg bg-white py-2 text-[13px] font-medium ring-1 ring-black/[.08] hover:bg-[#fafafa] disabled:opacity-40">
          {pending ? "…" : is360 ? "Hent udsnit" : "Hent billedet"}
        </button>
        <button type="button" disabled={pending || (is360 && !saved && !hasCut(slug, base))} onClick={() => file.current?.click()} className="flex-1 rounded-lg bg-[#1d1d1f] py-2 text-[13px] font-medium text-white disabled:opacity-40">
          {pending ? "Sætter ind…" : "Upload det rettede"}
        </button>
        <input
          ref={file}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) upload(f);
          }}
        />
      </div>
      {is360 && (saved || hasCut(slug, base)) && <p className="text-[11px] text-[#8e8e93]">Udsnittet er husket - du må gerne dreje rundt, det rettede sættes ind dér, hvor du hentede det.</p>}
    </div>
  );
}

function hasCut(slug: string, base: string): boolean {
  try {
    return Boolean(localStorage.getItem(cutKey(slug, base)));
  } catch {
    return false;
  }
}
