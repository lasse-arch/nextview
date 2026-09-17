"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { checkDealReadyForContract } from "@/lib/actions/docuseal";

export function SendContractButton({ dealId, isEdit }: { dealId: string; isEdit: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [cvrName, setCvrName] = useState<string | null>(null);

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
            setCvrName(result.cvrName);
          });
        }}
        className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {pending ? "Tjekker…" : isEdit ? "Ret og gensend kontrakt" : "Send kontrakt til underskrift"}
      </button>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {cvrName && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-base font-semibold text-slate-900">Opret kontrakt</h2>
            <p className="mt-2 text-sm text-slate-600">CVR-nummeret er verificeret til:</p>
            <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-900">
              {cvrName}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCvrName(null)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Annullér
              </button>
              <button
                type="button"
                onClick={() => router.push(`/deals/${dealId}/contract/new`)}
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                Fortsæt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
