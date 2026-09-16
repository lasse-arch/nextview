"use client";

import { useTransition } from "react";
import { markDealInactive, reactivateDeal } from "@/lib/actions/deals";

export function InactiveToggleButton({ dealId, isChurned }: { dealId: string; isChurned: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => (isChurned ? reactivateDeal(dealId) : markDealInactive(dealId)))}
      className={
        isChurned
          ? "rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          : "rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
      }
    >
      {pending ? "Gemmer…" : isChurned ? "Genaktiver kunde" : "Markér som ikke aktiv"}
    </button>
  );
}
