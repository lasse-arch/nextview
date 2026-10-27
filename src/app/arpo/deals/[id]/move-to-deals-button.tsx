"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { moveLeadsToDeals } from "@/lib/actions/lead-inbox";
import { useToast } from "@/components/toast";

/** "Flyt til Deals" on a lead in Leadindbakken - see moveLeadsToDeals. */
export function MoveToDealsButton({ dealId }: { dealId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const showToast = useToast();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            await moveLeadsToDeals([dealId]);
            showToast("Flyttet til Deals.");
            router.refresh();
          } catch {
            showToast("Kunne ikke flytte - genindlæs siden og prøv igen.");
          }
        })
      }
      className="rounded-md border border-violet-300 bg-white px-2.5 py-1 text-xs font-medium text-violet-700 hover:bg-violet-50 disabled:opacity-50"
    >
      {pending ? "Flytter…" : "Flyt til Deals"}
    </button>
  );
}
