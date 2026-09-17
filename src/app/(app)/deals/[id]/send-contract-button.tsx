"use client";

import { useTransition, useState } from "react";
import { sendContractViaSignWell } from "@/lib/actions/signwell";

export function SendContractButton({ dealId }: { dealId: string }) {
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
            try {
              await sendContractViaSignWell(dealId);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Der opstod en fejl.");
            }
          });
        }}
        className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {pending ? "Sender…" : "Send kontrakt til underskrift"}
      </button>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
