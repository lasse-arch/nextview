"use client";

import { useTransition } from "react";
import { markCommissionPaid } from "@/lib/actions/deals";

export function MarkPaidButton({ commissionId }: { commissionId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => markCommissionPaid(commissionId))}
      className="mt-2 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
    >
      {pending ? "Markerer…" : "Markér som udbetalt"}
    </button>
  );
}
