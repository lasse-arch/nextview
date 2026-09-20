"use client";

import { useTransition } from "react";
import { markEstablishmentSentManuallyAction } from "@/lib/actions/invoices";
import { useToast } from "@/components/toast";

export function MarkSentManuallyButton({ dealId }: { dealId: string }) {
  const [pending, startTransition] = useTransition();
  const showToast = useToast();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!window.confirm("Marker etablering som sendt manuelt? Systemet opretter herefter aldrig selv en kladde for den.")) return;
        startTransition(async () => {
          try {
            const result = await markEstablishmentSentManuallyAction(dealId);
            showToast(result.ok ? "Etablering markeret som sendt manuelt" : result.error);
          } catch (err) {
            showToast(err instanceof Error ? err.message : "Der opstod en fejl.");
          }
        });
      }}
      className="flex w-[140px] items-center justify-center rounded-md border border-slate-300 px-2 py-1.5 text-center text-xs font-medium leading-tight text-slate-600 hover:bg-slate-50 disabled:opacity-50"
    >
      {pending ? "Markerer…" : "Etablering sendt manuelt"}
    </button>
  );
}
