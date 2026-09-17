"use client";

import { useState, useTransition } from "react";
import { clearAllInvoices } from "@/lib/actions/invoices";

export function ClearInvoicesButton() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm("Slet alle fakturaer (inkl. importerede/historiske) fra alle deals? Kan ikke fortrydes.")) return;
          setMessage(null);
          startTransition(async () => {
            try {
              const result = await clearAllInvoices();
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
