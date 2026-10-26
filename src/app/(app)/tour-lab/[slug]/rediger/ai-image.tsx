"use client";

import { useContext, useState, useTransition } from "react";
import { editTourImage, imageAiReady, saveGeminiKey } from "@/lib/actions/tour-image-ai";
import { FilesContext, Icon, input } from "./ui";

const SPARK = '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/>';

const IDEAS = ["Gør græsset sommergrønt og himlen blå", "Fyld poolen med vand, og læg solsenge rundt om", "Gør lyset varmere, som en sommeraften", "Fjern bilerne på parkeringspladsen"];

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
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

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
        Ret med AI
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
          {result && (
            <>
              <div className="grid grid-cols-2 gap-1.5">
                <figure>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="aspect-[4/3] w-full rounded-lg object-cover ring-1 ring-black/[.06]" />
                  <figcaption className="mt-0.5 text-center text-[11px] text-[#8e8e93]">Nu</figcaption>
                </figure>
                <figure>
                  <a href={result} target="_blank" rel="noopener">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={result} alt="" className="aspect-[4/3] w-full rounded-lg object-cover ring-2 ring-[#d97757]" />
                  </a>
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
