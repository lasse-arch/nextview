"use client";

import { useTransition } from "react";
import { resendEInvoiceAction } from "@/lib/actions/invoices";
import { useToast } from "@/components/toast";

/** An EAN customer's invoice Dinero didn't send: send it as an e-invoice (the contact's receiver type is set on the way). */
export function ResendEInvoiceButton({ invoiceId }: { invoiceId: string }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await resendEInvoiceAction(invoiceId).catch(() => ({ ok: false as const, error: "Der skete en fejl - prøv igen." }));
          toast(r.ok ? "Sendt som e-faktura" : r.error);
        })
      }
      className="shrink-0 whitespace-nowrap rounded-md bg-slate-900 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-slate-800 disabled:opacity-50"
    >
      {pending ? "Sender…" : "Send som e-faktura"}
    </button>
  );
}
