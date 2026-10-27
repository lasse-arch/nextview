"use client";

import { useState, useTransition } from "react";
import { runInvoiceGenerationNow } from "@/lib/actions/invoices";

export function RunNowButton() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setMessage(null);
          startTransition(async () => {
            try {
              const result = await runInvoiceGenerationNow();
              const churnedNote = result.churned ? ` ${result.churned} kunde(r) blev markeret inaktive (opsigelsesvarsel udløbet).` : "";
              const paymentsNote =
                result.paymentsChecked && result.paymentsChecked > 0
                  ? ` Tjekkede betaling på ${result.paymentsChecked} kladde${result.paymentsChecked === 1 ? "" : "r"}${
                      result.paymentsNewlyPaid ? ` — ${result.paymentsNewlyPaid} nu markeret betalt.` : "."
                    }`
                  : "";
              if (!result.configured) {
                setMessage(`Dinero er ikke konfigureret endnu.${churnedNote}`);
              } else {
                setMessage(
                  `Tjekkede ${result.checked} forfaldne kvartaler — ${result.created} kladder oprettet, ${result.failed} fejlede.${churnedNote}${paymentsNote}`
                );
              }
            } catch (err) {
              setMessage(err instanceof Error ? err.message : "Der opstod en fejl.");
            }
          });
        }}
        className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {pending ? "Kører…" : "Kør nu"}
      </button>
      {message && <p className="mt-2 text-sm text-slate-600">{message}</p>}
    </div>
  );
}
