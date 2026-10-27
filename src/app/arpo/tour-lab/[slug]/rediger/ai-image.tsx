"use client";

import { useContext, useState, useSyncExternalStore, useTransition } from "react";
import { createPortal } from "react-dom";
import { editTourImage, imageAiReady, saveGeminiKey } from "@/lib/actions/tour-image-ai";
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
                const r = await editTourImage(slug, result ?? src, ask);
                if (!r.ok) {
                  if (r.error.startsWith("Gemini-nøglen")) setReady(false);
                  return setError(r.error);
                }
                setResult(r.url);
              })
            }
          >
            {pending ? "AI'en retter billedet… (10-30 sek.)" : result ? "Ret det nye videre" : "Ret billedet"}
          </button>
          {result && big && <Compare before={src} after={result} onClose={() => setBig(false)} />}
          {result && (
            <>
              <div className="grid grid-cols-2 gap-1.5">
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
        </>
      )}
      {error && <p className="text-[12px] text-[#ff3b30]">{error}</p>}
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
