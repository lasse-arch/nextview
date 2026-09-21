"use client";

import { useState, useTransition } from "react";
import {
  linkDealToDineroContact,
  findDineroContactsForDeal,
  resolveDineroContactNumber,
} from "@/lib/actions/invoices";
import { useToast } from "@/components/toast";

type Match = { contactGuid: string; linkedDealName: string | null };

export function LinkDineroContactForm({ dealId, currentGuid }: { dealId: string; currentGuid: string | null }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(currentGuid ?? "");
  const [urlInput, setUrlInput] = useState("");
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [pending, startTransition] = useTransition();
  const [searching, startSearch] = useTransition();
  const [resolving, startResolve] = useTransition();
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
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs font-medium text-slate-500">Link/nummer fra Dinero</label>
        <input
          type="text"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder="Indsæt kontaktens URL fra Dinero, fx app.dinero.dk/.../contacts/1037433153"
          className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs"
        />
        <button
          type="button"
          disabled={resolving}
          onClick={() => {
            startResolve(async () => {
              try {
                const guid = await resolveDineroContactNumber(urlInput);
                if (!guid) {
                  showToast("Ingen kontakt fundet med det nummer");
                  return;
                }
                setValue(guid);
                showToast("Fundet - tryk Gem for at koble");
              } catch (err) {
                showToast(err instanceof Error ? err.message : "Der opstod en fejl.");
              }
            });
          }}
          className="shrink-0 rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {resolving ? "Slår op…" : "Slå op"}
        </button>
      </div>
      <p className="text-xs text-slate-400">
        Eller tryk &quot;Find i Dinero&quot; for at søge på dealens eget CVR-nummer - feltet nedenfor skal ikke
        udfyldes først, det er kun der GUID&apos;en ender når du vælger en match (eller indsætter en selv).
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
