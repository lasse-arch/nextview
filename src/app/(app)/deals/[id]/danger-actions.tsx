"use client";

import { useTransition } from "react";
import { markDealLost, deleteDeal } from "@/lib/actions/deals";
import { useToast } from "@/components/toast";

export function DealDangerActions({
  dealId,
  stage,
  isAdmin,
}: {
  dealId: string;
  stage: string;
  isAdmin: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const showToast = useToast();

  return (
    <div className="flex items-center gap-2">
      {stage !== "LOST" && (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await markDealLost(dealId);
              showToast("Deal markeret som tabt");
            })
          }
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          Markér som tabt
        </button>
      )}
      {isAdmin && (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!confirm("Er du sikker på at du vil slette denne deal permanent? Det kan ikke fortrydes.")) return;
            startTransition(() => deleteDeal(dealId));
          }}
          className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          Slet deal
        </button>
      )}
    </div>
  );
}
