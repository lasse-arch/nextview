"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { checkDealReadyForContract } from "@/lib/actions/docuseal";

export function SendContractButton({ dealId, isEdit }: { dealId: string; isEdit: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await checkDealReadyForContract(dealId);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            const confirmed = window.confirm(
              `Vil du lave en kontrakt til dette CVR-nr: ${result.cvrName}?`
            );
            if (confirmed) router.push(`/deals/${dealId}/contract/new`);
          });
        }}
        className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {pending ? "Tjekker…" : isEdit ? "Ret og gensend kontrakt" : "Send kontrakt til underskrift"}
      </button>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
