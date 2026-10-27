"use client";

import { useTransition } from "react";
import { retryInvoiceDraft } from "@/lib/actions/invoices";
import { useToast } from "@/components/toast";

export function RetryInvoiceButton({ invoiceId }: { invoiceId: string }) {
  const [pending, startTransition] = useTransition();
  const showToast = useToast();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await retryInvoiceDraft(invoiceId);
          showToast(result.success ? "Kladde oprettet" : result.error ?? "Kunne ikke oprette kladden");
        })
      }
      className="rounded-md border border-slate-300 px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
    >
      {pending ? "Prøver…" : "Prøv igen"}
    </button>
  );
}
