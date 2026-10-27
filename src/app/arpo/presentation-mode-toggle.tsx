"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setPresentationMode } from "@/lib/actions/presentation-mode";

export function PresentationModeToggle({ enabled }: { enabled: boolean }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <button
      type="button"
      title={enabled ? "Vis følsomme tal igen" : "Skjul følsomme tal (til fremvisning for kunder)"}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await setPresentationMode(!enabled);
          router.refresh();
        })
      }
      className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
        enabled
          ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
          : "border-slate-300 text-slate-500 hover:bg-slate-50"
      }`}
    >
      {enabled ? "🙈 Følsomme tal skjult" : "👁 Skjul følsomme tal"}
    </button>
  );
}
