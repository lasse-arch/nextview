"use client";

import { useState, useTransition } from "react";
import { linkStandaloneContractToDeal, deleteStandaloneContract } from "@/lib/actions/standalone-contracts";
import { dealName } from "@/lib/labels";
import { useToast } from "@/components/toast";

type LinkableDeal = { id: string; companyName: string; displayName: string | null };

export function LinkContractRow({ contractId, deals }: { contractId: string; deals: LinkableDeal[] }) {
  const [dealId, setDealId] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const showToast = useToast();

  return (
    <div className="flex items-center gap-2">
      <select
        value={dealId}
        onChange={(e) => setDealId(e.target.value)}
        className="rounded-md border border-slate-300 px-2 py-1.5 text-xs"
      >
        <option value="">Vælg deal...</option>
        {deals.map((d) => (
          <option key={d.id} value={d.id}>
            {dealName(d)}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={pending || !dealId}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await linkStandaloneContractToDeal(contractId, dealId);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            showToast("Kontrakt kædet sammen med deal");
          });
        }}
        className="rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        Kæd sammen
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirm("Slet denne kontrakt permanent? Det kan ikke fortrydes.")) return;
          startTransition(async () => {
            const result = await deleteStandaloneContract(contractId);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            showToast("Kontrakt slettet");
          });
        }}
        className="rounded-md border border-red-200 px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
      >
        Slet
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
