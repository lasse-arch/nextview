"use client";

import { useTransition } from "react";
import { markDealInactive, reactivateDeal } from "@/lib/actions/deals";
import { useToast } from "@/components/toast";

export function InactiveToggleButton({ dealId, isChurned }: { dealId: string; isChurned: boolean }) {
  const [pending, startTransition] = useTransition();
  const showToast = useToast();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            await (isChurned ? reactivateDeal(dealId) : markDealInactive(dealId));
            showToast(isChurned ? "Kunde genaktiveret" : "Kunde markeret som ikke aktiv");
          } catch (err) {
            showToast(err instanceof Error ? err.message : "Der opstod en fejl.");
          }
        })
      }
      className={
        isChurned
          ? "rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          : "rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
      }
    >
      {pending ? "Gemmer…" : isChurned ? "Genaktiver kunde" : "Markér som ikke aktiv"}
    </button>
  );
}
