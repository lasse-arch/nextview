"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createTourFromWebsite } from "@/lib/actions/tour-ai";
import { createTour } from "@/lib/actions/tours";
import { Choice, Field, input } from "./[slug]/rediger/ui";

/**
 * "Ny tour": Claude builds it from the customer's website (look, words,
 * actions - the red thread) and the existing MPSkins tour (rooms and links),
 * on top of an existing tour's features. Or a plain copy of a tour.
 */
export function NewTour({ tours }: { tours: { slug: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"claude" | "copy">("claude");
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [tourUrl, setTourUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [base, setBase] = useState(tours[0]?.slug ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="rounded-full bg-[#0071e3] px-4 py-2 text-[14px] font-medium text-white hover:bg-[#0077ed]">
        + Ny tour
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm" onClick={() => !pending && setOpen(false)}>
          <form
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[480px] space-y-4 rounded-[22px] bg-[#f5f5f7] p-5 shadow-[0_30px_80px_rgba(0,0,0,.3)]"
            style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif' }}
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              start(async () => {
                const r = mode === "claude" ? await createTourFromWebsite({ name, website, tourUrl, base, notes }) : await createTour(name, base);
                if (!r.ok) return setError(r.error);
                // Claude's account of what it built opens the editor's Claude chat.
                if ("reply" in r)
                  try {
                    sessionStorage.setItem(`tour-claude:${r.slug}`, String(r.reply));
                  } catch {}
                router.push(`/tour-lab/${r.slug}/rediger`);
              });
            }}
          >
            <div className="text-center">
              <h2 className="text-[19px] font-semibold tracking-tight">Ny tour</h2>
              <p className="text-[13px] text-[#6e6e73]">{mode === "claude" ? "Claude bygger den ud fra kundens hjemmeside og MPSkins-touren." : "En kopi af en tour, som du retter til."}</p>
            </div>
            <Choice
              value={mode}
              options={[
                ["claude", "Byg med Claude"],
                ["copy", "Kopiér en tour"],
              ]}
              onChange={setMode}
            />
            <div className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-black/[.04]">
              <Field title="Navn">
                <input autoFocus className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Fx Boxdepotet Vejle" />
              </Field>
              {mode === "claude" && (
                <>
                  <Field title="Kundens hjemmeside" hint="Farver, logo, skrift, tekster og booking-links hentes herfra - så touren hænger sammen med siden.">
                    <input className={input} value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="fx jalsa.dk" />
                  </Field>
                  <Field title="MPSkins-touren" hint="Rummene og linkene i dens menu bruges til den nye menu.">
                    <input className={input} value={tourUrl} onChange={(e) => setTourUrl(e.target.value)} placeholder="https://explore.nextview360.dk/da/tour/…" />
                  </Field>
                </>
              )}
              <Field title={mode === "claude" ? "Funktioner som" : "Kopi af"} hint={mode === "claude" ? "Menutype, start og funktioner tages fra denne tour - indholdet laves nyt." : undefined}>
                <select className={input} value={base} onChange={(e) => setBase(e.target.value)}>
                  {tours.map((t) => (
                    <option key={t.slug} value={t.slug}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </Field>
              {mode === "claude" && (
                <Field title="Noget Claude skal vide? (valgfrit)">
                  <textarea className={`${input} min-h-[60px] resize-y`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Fx målgruppen er forældre, og vigtigste handling er at booke en rundvisning." />
                </Field>
              )}
            </div>
            {error && <p className="px-1 text-[13px] text-[#ff3b30]">{error}</p>}
            {pending && mode === "claude" && <p className="px-1 text-center text-[13px] text-[#6e6e73]">Claude læser hjemmesiden og bygger touren - det tager typisk et minut…</p>}
            <div className="flex gap-2">
              <button type="button" disabled={pending} onClick={() => setOpen(false)} className="flex-1 rounded-xl bg-white py-2.5 text-[15px] font-medium ring-1 ring-black/[.06] disabled:opacity-50">
                Annullér
              </button>
              <button type="submit" disabled={pending || !name.trim() || (mode === "claude" && !tourUrl.trim())} className="flex-1 rounded-xl bg-[#0071e3] py-2.5 text-[15px] font-medium text-white disabled:opacity-40">
                {pending ? (mode === "claude" ? "Bygger…" : "Opretter…") : mode === "claude" ? "Byg touren" : "Opret"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
