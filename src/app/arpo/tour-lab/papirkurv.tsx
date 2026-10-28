"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { restoreTour } from "@/lib/actions/tours";

/** Deleted tours, restorable for 30 days after they were deleted. */
export function Papirkurv({ rows }: { rows: { id: string; slug: string; name: string; deletedByName: string; createdAt: string; daysLeft: number }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (!rows.length) return null;
  return (
    <details className="rounded-2xl bg-white/60 px-4 py-3 ring-1 ring-black/[.05]">
      <summary className="cursor-pointer select-none text-[14px] text-[#6e6e73]">Papirkurv ({rows.length})</summary>
      <ul className="mt-3 divide-y divide-black/[.06]">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-[15px] font-medium text-[#1d1d1f]">{r.name}</p>
              <p className="text-[12px] text-[#8e8e93]">
                Slettet af {r.deletedByName} {new Date(r.createdAt).toLocaleDateString("da-DK", { day: "numeric", month: "short" })} · slettes helt om {r.daysLeft} dage
              </p>
            </div>
            <button
              type="button"
              disabled={pending}
              className="rounded-full bg-white px-4 py-1.5 text-[13px] font-medium text-[#0071e3] ring-1 ring-black/[.08] hover:bg-[#f5f5f7] disabled:opacity-40"
              onClick={() =>
                start(async () => {
                  setError(null);
                  const res = await restoreTour(r.id);
                  if (!res.ok) return setError(res.error);
                  router.refresh();
                })
              }
            >
              Gendan
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-[12px] text-[#ff3b30]">{error}</p>}
    </details>
  );
}
