"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createTour } from "@/lib/actions/tours";

/** "Ny tour": a name and which existing tour to start from (its design, menu and features). */
export function NewTour({ tours }: { tours: { slug: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [copyOf, setCopyOf] = useState(tours[0]?.slug ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
        + Ny tour
      </button>
    );
  return (
    <form
      className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await createTour(name, copyOf);
          if (!r.ok) return setError(r.error);
          router.push(`/tour-lab/${r.slug}/rediger`);
        });
      }}
    >
      <label className="text-sm">
        <span className="block text-xs font-semibold uppercase text-slate-500">Navn</span>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-1.5" placeholder="Fx Boxdepotet Vejle" />
      </label>
      <label className="text-sm">
        <span className="block text-xs font-semibold uppercase text-slate-500">Start som kopi af</span>
        <select value={copyOf} onChange={(e) => setCopyOf(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-1.5">
          {tours.map((t) => (
            <option key={t.slug} value={t.slug}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={pending} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
        Opret
      </button>
      <button type="button" onClick={() => setOpen(false)} className="px-2 py-1.5 text-sm text-slate-500">
        Annullér
      </button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </form>
  );
}
