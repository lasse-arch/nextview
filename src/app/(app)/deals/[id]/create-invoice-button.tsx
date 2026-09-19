"use client";

import { useTransition } from "react";
import { createInvoiceForDeal } from "@/lib/actions/invoices";
import { useToast } from "@/components/toast";

export function CreateInvoiceButton({ dealId }: { dealId: string }) {
  const [pending, startTransition] = useTransition();
  const showToast = useToast();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await createInvoiceForDeal(dealId);
          if (!result.configured) {
            showToast("Dinero er ikke konfigureret endnu.");
          } else if (result.checked === 0) {
            showToast("Ingen forfaldne kladder lige nu.");
          } else {
            showToast(`${result.created} kladde${result.created === 1 ? "" : "r"} oprettet${result.failed > 0 ? `, ${result.failed} fejlede` : ""}.`);
          }
        })
      }
      className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
    >
      {pending ? "Opretter…" : "Opret faktura-kladde"}
    </button>
  );
}
