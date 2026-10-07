"use client";

import { useState, useTransition } from "react";
import { clearAllInvoices } from "@/lib/actions/invoices";

const CONFIRM_WORD = "sletslet";

export function ClearInvoicesButton() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          const typed = window.prompt(
            'Slet alle fakturaer (inkl. importerede/historiske) fra alle deals? Kan ikke fortrydes.\n\nSkriv "sletslet" for at fortsætte.'
          );
          if (typed === null) return;
          if (typed.trim().toLowerCase() !== CONFIRM_WORD) {
            setMessage(`Ikke slettet - du skal skrive "${CONFIRM_WORD}".`);
            return;
          }
          setMessage(null);
          startTransition(async () => {
            try {
              const result = await clearAllInvoices(CONFIRM_WORD);
              setMessage(`${result.deleted} faktura(er) slettet.`);
            } catch (err) {
              setMessage(err instanceof Error ? err.message : "Der opstod en fejl.");
            }
          });
        }}
        className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
      >
        {pending ? "Sletter…" : "Ryd alle fakturaer"}
      </button>
      {message && <p className="mt-2 text-sm text-slate-600">{message}</p>}
    </div>
  );
}
