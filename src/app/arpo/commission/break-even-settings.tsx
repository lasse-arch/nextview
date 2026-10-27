"use client";

import { useState, useTransition } from "react";
import { saveBreakEvenSettings } from "@/lib/actions/break-even";
import { useToast } from "@/components/toast";

export function BreakEvenSettingsForm({ monthlyCost }: { monthlyCost: number }) {
  const [monthly, setMonthly] = useState(String(monthlyCost || ""));
  const [pending, start] = useTransition();
  const showToast = useToast();
  const changed = monthly !== String(monthlyCost || "");

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveBreakEvenSettings(monthly);
          showToast(r.error ?? "Gemt - tallene er regnet om");
        });
      }}
    >
      <label className="text-xs text-slate-500">
        Drift pr. kunde pr. md. (kr.)
        <input inputMode="numeric" value={monthly} onChange={(e) => setMonthly(e.target.value)} placeholder="fx 150" className="mt-1 block w-32 rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900" />
      </label>
      <button type="submit" disabled={pending || !changed} className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40">
        {pending ? "Gemmer…" : "Gem"}
      </button>
    </form>
  );
}
