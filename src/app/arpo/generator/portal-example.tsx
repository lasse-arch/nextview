"use client";

import { useState } from "react";

/*
 * Generator → Kundeportal: the customer portal as a new customer gets it - one
 * of our showcase tours with made-up numbers (lib/portal-example.ts) - to show
 * in a meeting or on a screen share. Nothing of a real customer's is shown.
 */
export function PortalExample({ tours }: { tours: { slug: string; name: string }[] }) {
  const [slug, setSlug] = useState(tours[0]?.slug ?? "");
  const url = (side?: string) => `/kunde?som=eksempel&tour=${encodeURIComponent(slug)}${side ? `&side=${side}` : ""}`;
  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Eksempel på kundeportalen</h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          Sådan ser kunden sin tour, sine tal og koden til hjemmesiden - vist med en af vores eksempel-tours og opdigtede tal. Godt til at vise på mødet eller dele skærm. Ingen rigtig kundes tal, kontrakt eller brugere vises.
        </p>
      </div>
      {tours.length === 0 ? (
        <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-500">Ingen tours er slået til som eksempel endnu - slå &quot;Kan sendes som eksempel&quot; til på en udgivet tour (Del og udgiv).</p>
      ) : (
        <>
          <label className="block max-w-sm text-sm">
            <span className="mb-1 block font-medium text-slate-700">Vis med touren</span>
            <select value={slug} onChange={(e) => setSlug(e.target.value)} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2">
              {tours.map((t) => (
                <option key={t.slug} value={t.slug}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            <a href={url()} target="_blank" rel="noopener" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
              Åbn kundeportalen ↗
            </a>
            {[
              ["tal", "Tallene"],
              ["hjemmeside", "Koden til hjemmesiden"],
              ["tips", "Tips"],
            ].map(([side, label]) => (
              <a key={side} href={url(side)} target="_blank" rel="noopener" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:border-slate-400">
                {label} ↗
              </a>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
