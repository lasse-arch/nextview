"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setCommissionExcluded } from "@/lib/actions/deals";
import { useToast } from "@/components/toast";

export function CommissionExcludedToggle({ dealId, excluded }: { dealId: string; excluded: boolean }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const showToast = useToast();

  function toggle() {
    startTransition(async () => {
      try {
        await setCommissionExcluded(dealId, !excluded);
        showToast(excluded ? "Deal er igen med i provisionsordningen" : "Deal er nu undtaget fra provision");
        router.refresh();
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Kunne ikke ændre provisionsstatus.");
      }
    });
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={toggle}
      className={`rounded-md border px-2.5 py-1 text-xs font-medium disabled:opacity-50 ${
        excluded
          ? "border-slate-900 bg-slate-900 text-white hover:bg-slate-800"
          : "border-slate-300 text-slate-500 hover:bg-slate-50"
      }`}
    >
      {excluded ? "Undtaget fra provision" : "Undtag fra provision"}
    </button>
  );
}
