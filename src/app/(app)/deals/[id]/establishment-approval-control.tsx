"use client";

import { useTransition } from "react";
import { approveEstablishment, holdEstablishmentForApproval } from "@/lib/actions/establishment-approval";
import { formatDKK } from "@/lib/labels";
import { useToast } from "@/components/toast";

/**
 * The setup fee's "on signing" vs. "when the customer is happy" choice on a
 * deal (see Deal.establishmentAwaitingApproval) - shown until the setup fee
 * has been invoiced.
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
          Faktureres ikke automatisk - først når produktet er leveret, og kunden er tilfreds.
        </p>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!confirm(`Er kunden tilfreds? Etableringen (${formatDKK(fee)}) faktureres så ved næste fakturakørsel.`)) return;
            run(() => approveEstablishment(dealId), "Etableringen faktureres ved næste fakturakørsel");
          }}
          className="mt-2 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {pending ? "Gemmer…" : "✓ Kunden er tilfreds - fakturér etablering"}
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
          if (!confirm("Vent med at fakturere etableringen, til produktet er leveret, og kunden er tilfreds?")) return;
          run(() => holdEstablishmentForApproval(dealId), "Etableringen venter nu på kundens godkendelse");
        }}
        className="rounded-md border border-slate-300 px-2 py-1 font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
      >
        Vent til kunden er tilfreds
      </button>
    </div>
  );
}
