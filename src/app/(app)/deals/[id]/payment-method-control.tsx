"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setDealPaymentMethod } from "@/lib/actions/betalingsservice";
import { useToast } from "@/components/toast";

/**
 * How this customer pays: a normal Dinero invoice, or Betalingsservice
 * (automatic payment once they've signed up with their bank, indbetalingskort
 * until then). Only quarterly invoices created after switching are collected
 * through Betalingsservice - the establishment fee, and any invoice already
 * sent, stays a normal invoice.
 */
export function PaymentMethodControl({
  dealId,
  method,
  customerNumber,
  mandateActive,
  pbsNumber,
  debtorGroupNumber,
}: {
  dealId: string;
  method: "INVOICE" | "BETALINGSSERVICE";
  customerNumber: string | null;
  mandateActive: boolean;
  pbsNumber: string | null;
  debtorGroupNumber: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const showToast = useToast();

  function change(next: "INVOICE" | "BETALINGSSERVICE") {
    if (next === method) return;
    startTransition(async () => {
      try {
        await setDealPaymentMethod(dealId, next);
        showToast(
          next === "BETALINGSSERVICE"
            ? "Kunden betaler nu via Betalingsservice - gælder fakturaer fra nu af."
            : "Kunden får nu almindelige fakturaer."
        );
        router.refresh();
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Kunne ikke ændre betalingsmetode.");
      }
    });
  }

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Betaling</span>
        <div className="inline-flex overflow-hidden rounded-md border border-slate-300 bg-white">
          {(
            [
              ["INVOICE", "Almindelig faktura"],
              ["BETALINGSSERVICE", "Betalingsservice"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              disabled={pending}
              onClick={() => change(value)}
              className={`px-2.5 py-1 text-xs font-medium disabled:opacity-50 ${
                method === value ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {method === "BETALINGSSERVICE" && (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              mandateActive ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
            }`}
          >
            {mandateActive ? "Automatisk betaling" : "Indbetalingskort"}
          </span>
        )}
      </div>
      {method === "BETALINGSSERVICE" && (
        <p className="mt-2 text-xs text-slate-500">
          Kvartalsfakturaerne opkræves via Betalingsservice - etableringen er altid en almindelig faktura. Kundenr.{" "}
          <span className="font-mono font-medium text-slate-700">{customerNumber ?? "-"}</span>
          {!mandateActive && (
            <>
              {" "}
              · Kunden kan tilmelde sig automatisk betaling i sin netbank med PBS-nr.{" "}
              <span className="font-mono">{pbsNumber ?? "(ikke angivet)"}</span>, debitorgruppe{" "}
              <span className="font-mono">{debtorGroupNumber ?? "(ikke angivet)"}</span> og kundenummeret.
            </>
          )}
        </p>
      )}
    </div>
  );
}
