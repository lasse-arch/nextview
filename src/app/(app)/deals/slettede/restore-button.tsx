"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { restoreDeal } from "@/lib/actions/deal-archive";
import { useToast } from "@/components/toast";

export function RestoreButton({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  return (
    <button
      type="button"
      disabled={pending}
      title={`Sæt ${name} tilbage`}
      className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      onClick={() =>
        start(async () => {
          const r = await restoreDeal(id);
          if (!r.ok) return toast(r.error);
          router.push(`/deals/${r.dealId}`);
        })
      }
    >
      {pending ? "Sætter tilbage…" : "Gendan"}
    </button>
  );
}
