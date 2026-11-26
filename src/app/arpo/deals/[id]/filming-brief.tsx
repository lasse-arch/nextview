"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveFilmingBrief } from "@/lib/actions/filming";
import { useToast } from "@/components/toast";

/**
 * "Optagelsesbrief": what the seller agreed with the customer for the one filming - drone or not, and where and
 * what to film. A warning (amber) until it's filled in, once the contract is signed. The filmer sees it on
 * "Mine filmninger".
 */
export function FilmingBrief({ dealId, drone, brief, savedAt, savedBy, required }: { dealId: string; drone: boolean | null; brief: string | null; savedAt: string | null; savedBy: string | null; required: boolean }) {
  const missing = drone === null || !brief;
  const [editing, setEditing] = useState(missing);
  const [d, setD] = useState<boolean | null>(drone);
  const [text, setText] = useState(brief ?? "");
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const warn = required && missing;

  function save() {
    start(async () => {
      const r = await saveFilmingBrief(dealId, { drone: d, brief: text });
      if (!r.ok) return toast(r.error);
      toast("Optagelsesbriefen er gemt - optageren kan se den under Mine filmninger.");
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <section className={`rounded-xl border p-4 shadow-sm ${warn ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">{warn ? "Udfyld optagelsesbriefen" : "Optagelsesbrief"}</h2>
          <p className={`mt-0.5 text-xs ${warn ? "text-amber-900" : "text-slate-500"}`}>
            {warn ? "Kontrakten er underskrevet. Skriv, hvad der er aftalt med kunden, så optageren ved, hvad der skal optages." : "Det, der er aftalt med kunden. Optageren ser det under Mine filmninger."}
          </p>
        </div>
        {!editing && (
          <button type="button" onClick={() => setEditing(true)} className="shrink-0 text-xs font-semibold text-slate-600 underline hover:text-slate-900">
            Ret
          </button>
        )}
      </div>
      {editing ? (
        <div className="mt-3 space-y-3">
          <div>
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Drone</span>
            <div className="mt-1.5 flex gap-2">
              {[
                [true, "Ja, med drone"],
                [false, "Nej"],
              ].map(([v, l]) => (
                <button
                  key={String(v)}
                  type="button"
                  onClick={() => setD(v as boolean)}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${d === v ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
                >
                  {l as string}
                </button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Hvad er aftalt med kunden</span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              maxLength={5000}
              placeholder="Hvor skal der filmes (rum, områder, udenfor), hvad er vigtigst for kunden, hvad må ikke komme med, hvad skal dronen vise ..."
              className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            />
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={save} disabled={pending} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50">
              {pending ? "Gemmer…" : "Gem briefen"}
            </button>
            {!missing && (
              <button type="button" onClick={() => setEditing(false)} className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
                Annullér
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-2 text-sm text-slate-800">
          <p>
            <span className="font-medium">Drone:</span> {drone ? "Ja" : "Nej"}
          </p>
          <p className="mt-1 whitespace-pre-line">{brief}</p>
          {savedAt && (
            <p className="mt-2 text-xs text-slate-400">
              Skrevet {savedAt}
              {savedBy ? ` af ${savedBy}` : ""}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
