"use client";

import { useTransition } from "react";
import { holdEstablishmentForApproval, releaseEstablishmentHold } from "@/lib/actions/establishment-approval";
import { formatDKK } from "@/lib/labels";
import { useToast } from "@/components/toast";

/**
 * The setup fee's "on signing" vs. "once the customer has approved" choice
 * on a deal (see Deal.establishmentAwaitingApproval) - shown until the setup
 * fee has been invoiced or the deal is Live (Live = approved).
 */
export function EstablishmentApprovalControl({
  dealId,
  fee,
  awaiting,
}: {
  dealId: string;
  fee: number;
  awaiting: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const showToast = useToast();

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, done: string) {
    startTransition(async () => {
      const result = await action();
      showToast(result.ok ? done : result.error);
    });
  }

  if (awaiting) {
    return (
      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
        <p className="font-medium text-amber-900">Etablering ({formatDKK(fee)}) afventer kundens godkendelse</p>
        <p className="mt-0.5 text-xs text-amber-800">
          Faktureres, når dealen sættes Live - det gør I, når kunden har godkendt produktet.
        </p>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!confirm("Fakturér etableringen som normalt i stedet (efter underskrift)?")) return;
            run(() => releaseEstablishmentHold(dealId), "Etableringen faktureres som normalt");
          }}
          className="mt-2 text-xs font-medium text-amber-800 underline hover:text-amber-950 disabled:opacity-50"
        >
          Fakturér alligevel som normalt
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
      <span>Etablering ({formatDKK(fee)}) faktureres automatisk efter underskrift.</span>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirm("Vent med at fakturere etableringen, til kunden har godkendt produktet (dealen sættes Live)?")) return;
          run(() => holdEstablishmentForApproval(dealId), "Etableringen faktureres, når dealen sættes Live");
        }}
        className="rounded-md border border-slate-300 px-2 py-1 font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
      >
        Vent til kunden har godkendt
      </button>
    </div>
  );
}
