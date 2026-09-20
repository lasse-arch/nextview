"use client";

import { useTransition } from "react";
import { checkInvoicePaymentAction } from "@/lib/actions/invoices";
import { useToast } from "@/components/toast";

export function CheckPaymentButton({ invoiceId }: { invoiceId: string }) {
  const [pending, startTransition] = useTransition();
  const showToast = useToast();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            const result = await checkInvoicePaymentAction(invoiceId);
            if (!result.ok) showToast(result.error);
            else
              showToast(
                `${result.paid ? "Fakturaen er betalt" : "Ikke betalt endnu"} (Dinero status: ${result.rawStatus ?? "ukendt"})`
              );
          } catch (err) {
            showToast(err instanceof Error ? err.message : "Der opstod en fejl.");
          }
        })
      }
      className="shrink-0 whitespace-nowrap rounded-md border border-slate-300 px-2 py-0.5 text-[11px] font-medium text-slate-500 hover:bg-slate-50 disabled:opacity-50"
    >
      {pending ? "Tjekker…" : "Tjek betaling"}
    </button>
  );
}
