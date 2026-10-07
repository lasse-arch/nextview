"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clearTestInvoices } from "@/lib/actions/invoices";

/** Removes the "TEST" drafts from Testtilstand - see clearTestInvoices. */
export function ClearTestInvoicesButton() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (
            !window.confirm(
              "Slet alle testkladder (dem med TEST-mærke) - både i Arpo og kladderne i Dinero? Rigtige fakturaer røres ikke."
            )
          )
            return;
          setMessage(null);
          startTransition(async () => {
            try {
              const result = await clearTestInvoices();
              setMessage(
                `${result.deleted} testkladde(r) slettet i Arpo, ${result.deletedInDinero} kladde(r) slettet i Dinero.` +
                  (result.keptBooked > 0
                    ? ` ${result.keptBooked} var blevet bogført i Dinero og er ikke rørt - tjek dem i Dinero.`
                    : "")
              );
              router.refresh();
            } catch (err) {
              setMessage(err instanceof Error ? err.message : "Der opstod en fejl.");
            }
          });
        }}
        className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-50"
      >
        {pending ? "Sletter…" : "Slet testkladder"}
      </button>
      {message && <span className="text-sm text-slate-600">{message}</span>}
    </div>
  );
}
