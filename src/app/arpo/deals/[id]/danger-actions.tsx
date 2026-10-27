"use client";

import { useState, useTransition } from "react";
import { markDealLost, deleteDeal, duplicateDeal } from "@/lib/actions/deals";
import { useToast } from "@/components/toast";
import { LostReasonDialog } from "@/components/lost-reason-dialog";

export function DealDangerActions({
  dealId,
  dealName,
  stage,
  canDelete,
  signed,
}: {
  dealId: string;
  dealName: string;
  stage: string;
  canDelete: boolean;
  /** Has signed - can't be deleted, only marked lost or inactive. */
  signed: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [askingReason, setAskingReason] = useState(false);
  const showToast = useToast();

  function markLost(reason: string) {
    startTransition(async () => {
      try {
        await markDealLost(dealId, reason);
        setAskingReason(false);
        showToast("Deal markeret som tabt");
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Der opstod en fejl.");
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => duplicateDeal(dealId))}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
      >
        Dupliker deal
      </button>
      {stage !== "LOST" && (
        <button
          type="button"
          disabled={pending}
          onClick={() => setAskingReason(true)}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          Markér som tabt
        </button>
      )}
      {askingReason && (
        <LostReasonDialog
          dealName={dealName}
          pending={pending}
          onCancel={() => setAskingReason(false)}
          onConfirm={markLost}
        />
      )}
      {canDelete && signed && (
        <span className="px-1 text-xs text-slate-400" title="Kunder, der har skrevet under, kan ikke slettes - brug Markér som tabt eller Inaktiv.">
          Kan ikke slettes (underskrevet)
        </span>
      )}
      {canDelete && !signed && (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!confirm("Slet denne deal? Den kan sættes tilbage under Deals → Slettede.")) return;
            startTransition(async () => {
              const r = await deleteDeal(dealId);
              if (r?.error) showToast(r.error);
            });
          }}
          className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          Slet deal
        </button>
      )}
    </div>
  );
}
