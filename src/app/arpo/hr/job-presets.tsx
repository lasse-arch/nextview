"use client";

import { JOB_PRESETS } from "@/lib/hr";

/**
 * Sælger, Filmer, Udvikler, Praktikant: a click fills in the form's "title" and "duties" fields (found by name in the
 * same form), and `onPick` lets a controlled form (the wizard) take them too.
 */
export function JobPresets({ onPick }: { onPick?: (p: { title: string; duties: string }) => void }) {
  return (
    <div className="col-span-2 flex flex-wrap items-center gap-2 sm:col-span-4">
      <span className="text-xs text-slate-500">Vælg en stilling:</span>
      {JOB_PRESETS.map((p) => (
        <button
          key={p.title}
          type="button"
          className="rounded-full border border-slate-300 bg-white px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50"
          onClick={(e) => {
            const form = e.currentTarget.closest("form");
            for (const [name, value] of [["title", p.title], ["duties", p.duties]] as const) {
              const el = form?.elements.namedItem(name);
              if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) el.value = value;
            }
            onPick?.(p);
          }}
        >
          {p.title}
        </button>
      ))}
    </div>
  );
}
