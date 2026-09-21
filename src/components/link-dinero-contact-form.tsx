"use client";

import { useState, useTransition } from "react";
import { linkDealToDineroContact } from "@/lib/actions/invoices";
import { useToast } from "@/components/toast";

export function LinkDineroContactForm({ dealId, currentGuid }: { dealId: string; currentGuid: string | null }) {
  const [value, setValue] = useState(currentGuid ?? "");
  const [pending, startTransition] = useTransition();
  const showToast = useToast();

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
      <label className="text-xs font-medium text-slate-500">Dinero kontakt-GUID</label>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Sæt for at genbruge en eksisterende Dinero-kontakt"
        className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs"
      />
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          startTransition(async () => {
            try {
              await linkDealToDineroContact(dealId, value);
              showToast(value.trim() ? "Kontakt koblet" : "Kobling fjernet");
            } catch (err) {
              showToast(err instanceof Error ? err.message : "Der opstod en fejl.");
            }
          });
        }}
        className="shrink-0 rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
      >
        {pending ? "Gemmer…" : "Gem"}
      </button>
    </div>
  );
}
