"use client";

import { useTransition } from "react";
import { createInvoiceForDeal, previewInvoiceForCurrentDeal } from "@/lib/actions/invoices";
import { useToast } from "@/components/toast";
import { formatDKK } from "@/lib/labels";

export function CreateInvoiceButton({ dealId }: { dealId: string }) {
  const [pending, startTransition] = useTransition();
  const showToast = useToast();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            const preview = await previewInvoiceForCurrentDeal(dealId);
            if (!preview.ok) {
              showToast(preview.error);
              return;
            }

            if (preview.value.length > 0) {
              const lines = preview.value.map((line) => `${line.label}: ${formatDKK(line.amount)}`).join("\n");
              const confirmed = window.confirm(
                `Vil du sende faktura ud på dette beløb for denne periode?\n\n${lines}`
              );
              if (!confirmed) return;
            }

            const result = await createInvoiceForDeal(dealId);
            if (!result.configured) {
              showToast("Dinero er ikke konfigureret endnu.");
            } else if (result.checked === 0) {
              showToast(
                result.nextDueDateLabel
                  ? `Ingen forfaldne kladder lige nu — næste kladde oprettes tidligst d. ${result.nextDueDateLabel}.`
                  : "Ingen forfaldne kladder lige nu."
              );
            } else {
              showToast(`${result.created} faktura${result.created === 1 ? "" : "er"} sendt${result.failed > 0 ? `, ${result.failed} fejlede` : ""}.`);
            }
          } catch (err) {
            showToast(err instanceof Error ? err.message : "Der opstod en fejl.");
          }
        })
      }
      className="flex w-[140px] items-center justify-center rounded-md border border-slate-300 px-2 py-1.5 text-center text-xs font-medium leading-tight text-slate-600 hover:bg-slate-50 disabled:opacity-50"
    >
      {pending ? "Opretter…" : "Opret faktura-kladde"}
    </button>
  );
}
