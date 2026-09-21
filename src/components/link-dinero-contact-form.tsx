"use client";

import { useState, useTransition } from "react";
import { linkDealToDineroContact, findDineroContactsForDeal } from "@/lib/actions/invoices";
import { useToast } from "@/components/toast";

type Match = { contactGuid: string; name: string | null; email: string | null };

export function LinkDineroContactForm({ dealId, currentGuid }: { dealId: string; currentGuid: string | null }) {
  const [value, setValue] = useState(currentGuid ?? "");
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [pending, startTransition] = useTransition();
  const [searching, startSearch] = useTransition();
  const showToast = useToast();

  return (
    <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
      <div className="flex flex-wrap items-center gap-2">
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
          disabled={searching}
          onClick={() => {
            startSearch(async () => {
              try {
                const found = await findDineroContactsForDeal(dealId);
                setMatches(found);
                if (found.length === 0) showToast("Ingen Dinero-kontakter fundet på dealens CVR-nummer");
              } catch (err) {
                showToast(err instanceof Error ? err.message : "Der opstod en fejl.");
              }
            });
          }}
          className="shrink-0 rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {searching ? "Søger…" : "Find i Dinero"}
        </button>
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
      {matches && matches.length > 0 && (
        <ul className="space-y-1 rounded-md border border-slate-200 bg-slate-50 p-2">
          {matches.map((m) => (
            <li key={m.contactGuid} className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-slate-600">
                {m.name || "(intet navn)"} {m.email && <span className="text-slate-400">— {m.email}</span>}
              </span>
              <button
                type="button"
                onClick={() => {
                  setValue(m.contactGuid);
                  setMatches(null);
                }}
                className="shrink-0 rounded-md border border-slate-300 bg-white px-2 py-0.5 font-medium text-slate-600 hover:bg-slate-100"
              >
                Vælg
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
