"use client";

import { useState, useTransition } from "react";
import { linkDealToDineroContact, findDineroContactsForDeal } from "@/lib/actions/invoices";
import { useToast } from "@/components/toast";

type Match = {
  contactGuid: string;
  name: string | null;
  email: string | null;
  linkedDealName: string | null;
  isCurrentLink: boolean;
};

export function LinkDineroContactForm({ dealId, currentGuid }: { dealId: string; currentGuid: string | null }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(currentGuid ?? "");
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [pending, startTransition] = useTransition();
  const [searching, startSearch] = useTransition();
  const showToast = useToast();

  if (!open) {
    return (
      <div className="mt-3 border-t border-slate-100 pt-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-xs font-medium text-slate-400 hover:text-slate-600"
        >
          {currentGuid ? "Koblet til eksisterende Dinero-kontakt (redigér)…" : "Kobl til eksisterende Dinero-kontakt…"}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
      <p className="text-xs text-slate-400">
        Tryk &quot;Find i Dinero&quot; for at søge på dealens eget CVR-nummer - feltet nedenfor skal ikke udfyldes
        først, det er kun der GUID&apos;en ender når du vælger en match (eller indsætter en selv).
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs font-medium text-slate-500">Dinero kontakt-GUID</label>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Udfyldes automatisk når du vælger en match herunder"
          className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs"
        />
        <button
          type="button"
          disabled={searching}
          onClick={() => {
            startSearch(async () => {
              const result = await findDineroContactsForDeal(dealId);
              if (!result.ok) {
                showToast(result.error);
                return;
              }
              setMatches(result.value);
              if (result.value.length === 0) showToast("Ingen Dinero-kontakter fundet på dealens CVR-nummer");
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
              const result = await linkDealToDineroContact(dealId, value);
              showToast(result.ok ? (value.trim() ? "Kontakt koblet" : "Kobling fjernet") : result.error);
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
                <span className="font-medium">{m.name || "(intet navn)"}</span>
                {m.email && <span className="text-slate-400"> — {m.email}</span>}
                {m.isCurrentLink && <span className="ml-1 font-medium text-blue-600">(dealens nuværende kobling)</span>}
                <br />
                <span className="font-mono text-[11px] text-slate-400">{m.contactGuid}</span>
                <br />
                {m.linkedDealName ? (
                  <span>
                    Bruges allerede af deal: <span className="font-medium">{m.linkedDealName}</span>
                  </span>
                ) : (
                  <span className="text-slate-400">Ikke koblet til nogen deal i CRM&apos;et endnu</span>
                )}
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
