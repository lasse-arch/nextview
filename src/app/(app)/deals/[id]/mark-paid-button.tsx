"use client";

import { useTransition } from "react";
import { markCommissionPaid } from "@/lib/actions/deals";
import { useToast } from "@/components/toast";

export function MarkPaidButton({ commissionId }: { commissionId: string }) {
  const [pending, startTransition] = useTransition();
  const showToast = useToast();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await markCommissionPaid(commissionId);
          showToast("Provision markeret som udbetalt");
        })
      }
      className="mt-2 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
    >
      {pending ? "Markerer…" : "Markér som udbetalt"}
    </button>
  );
}
