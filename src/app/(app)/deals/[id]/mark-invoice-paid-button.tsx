"use client";

import { useTransition } from "react";
import { markInvoicePaidManuallyAction } from "@/lib/actions/invoices";
import { useToast } from "@/components/toast";

/** Manually marks an invoice paid/unpaid without touching Dinero - for lines
 * sent entirely outside the system (e.g. "Etablering sendt manuelt"), which
 * have no real Dinero guid for "Tjek betaling" to check, and as a manual
 * override/undo alongside it either way. */
export function MarkInvoicePaidButton({ invoiceId, paid }: { invoiceId: string; paid: boolean }) {
  const [pending, startTransition] = useTransition();
  const showToast = useToast();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        const confirmText = paid ? "Fjern betalt-markeringen på denne faktura?" : "Marker denne faktura som betalt?";
        if (!window.confirm(confirmText)) return;
        startTransition(async () => {
          try {
            const result = await markInvoicePaidManuallyAction(invoiceId, !paid);
            if (!result.ok) showToast(result.error);
          } catch (err) {
            showToast(err instanceof Error ? err.message : "Der opstod en fejl.");
          }
        });
      }}
      className="rounded-md border border-slate-300 px-2 py-0.5 text-[11px] font-medium text-slate-500 hover:bg-slate-50 disabled:opacity-50"
    >
      {pending ? "Gemmer…" : paid ? "Fjern betalt" : "Marker betalt"}
    </button>
  );
}
