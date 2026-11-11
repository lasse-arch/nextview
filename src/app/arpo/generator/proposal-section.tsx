"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createProposal, deleteProposal, type ProposalRow } from "@/lib/actions/tour-proposal";

/*
 * Generator → Mail → "Få et oplæg til touren": the customer's website in,
 * nextviewAI's idea for their tour out - one picture in their own colours and
 * the idea in a few sentences (lib/tour-proposal.ts). It opens as a page with
 * a link for the customer and a mail to copy.
 */

const STEPS = ["Læser hjemmesiden …", "Finder farverne og logoet …", "Finder de vigtigste steder …", "Vælger funktionerne …", "Tegner velkomsten …"];

export function ProposalSection({ recent }: { recent: ProposalRow[] }) {
  const router = useRouter();
  const [site, setSite] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [busy, start] = useTransition();
  const [, remove] = useTransition();

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setStep((s) => Math.min(STEPS.length - 1, s + 1)), 8000);
    return () => clearInterval(t);
  }, [busy]);

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">🗺️ Få et oplæg til touren</h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">Skriv kundens hjemmeside. nextviewAI laver en idé til deres tour: et billede af velkomsten i deres egne farver og logo, med deres egne steder, og idéen i få sætninger med tre funktioner. Du får et link til kunden og en mail at sende det med.</p>
      </div>
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (busy) return;
          setError(null);
          setStep(0);
          start(async () => {
            const r = await createProposal(site, notes);
            if (r.ok) router.push(`/arpo/generator/oplaeg/${r.id}`);
            else setError(r.error);
          });
        }}
      >
        <input value={site} onChange={(e) => setSite(e.target.value)} placeholder="Kundens hjemmeside, fx aalborgzoo.dk" className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm" maxLength={300} required />
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Noter fra samtalen (valgfri)" className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm" maxLength={1500} />
        <button type="submit" disabled={busy} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
          {busy ? "Laver oplægget …" : "Lav oplæg"}
        </button>
      </form>
      {busy && (
        <div className="flex items-center gap-3 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-900">
          <span className="h-4 w-4 flex-none animate-spin rounded-full border-2 border-blue-300 border-t-blue-700" aria-hidden />
          {STEPS[step]} <span className="text-blue-700/70">(ca. 1 minut)</span>
        </div>
      )}
      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {recent.length > 0 && (
        <details className="border-t border-slate-100 pt-3">
          <summary className="cursor-pointer select-none text-[13px] font-medium text-slate-600">Teamets oplæg ({recent.length})</summary>
          <ul className="mt-2 space-y-1">
            {recent.map((p) => (
              <li key={p.id} className="flex items-center gap-2 text-[13px]">
                <a href={`/arpo/generator/oplaeg/${p.id}`} className="min-w-0 truncate font-medium text-slate-800 hover:underline">
                  {p.customer}
                </a>
                <span className="flex-none text-slate-400">
                  · {p.createdByName ?? "-"}, {new Date(p.createdAt).toLocaleDateString("da-DK", { day: "numeric", month: "short", timeZone: "Europe/Copenhagen" })}
                </span>
                {p.mine && (
                  <button
                    type="button"
                    className="ml-auto flex-none text-slate-400 hover:text-red-600"
                    title="Slet oplægget og dets link"
                    onClick={() =>
                      remove(async () => {
                        const r = await deleteProposal(p.id);
                        if (!r.ok) setError(r.error ?? "Kunne ikke slette.");
                        else router.refresh();
                      })
                    }
                  >
                    Slet
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
