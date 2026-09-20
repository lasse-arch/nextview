"use client";

import { useTransition } from "react";
import { deleteInvoiceDraft } from "@/lib/actions/invoices";
import { useToast } from "@/components/toast";

export function DeleteInvoiceButton({ invoiceId }: { invoiceId: string }) {
  const [pending, startTransition] = useTransition();
  const showToast = useToast();

  return (
    <button
      type="button"
      disabled={pending}
      title="Fjerner kun fra CRM'et - rører ikke en evt. rigtig kladde i Dinero"
      onClick={() => {
        if (!window.confirm("Fjern denne faktura fra CRM'et? Sletter ikke en evt. rigtig kladde i Dinero.")) return;
        startTransition(async () => {
          try {
            await deleteInvoiceDraft(invoiceId);
            showToast("Faktura fjernet");
          } catch (err) {
            showToast(err instanceof Error ? err.message : "Der opstod en fejl.");
          }
        });
      }}
      className="shrink-0 whitespace-nowrap rounded-md border border-slate-300 px-2 py-0.5 text-[11px] font-medium text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
    >
      {pending ? "Fjerner…" : "Fjern"}
    </button>
  );
}
