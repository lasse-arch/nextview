"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { resolveDuplicate } from "@/lib/actions/deals";
import { stageLabels, formatDKK, formatDate, dealName } from "@/lib/labels";
import { useToast } from "@/components/toast";
import type { DealStage } from "@prisma/client";

export type DuplicateDealInfo = {
  id: string;
  companyName: string;
  displayName: string | null;
  stage: DealStage;
  saleAmount: number | null;
  createdAt: Date;
  owner: { name: string };
};

export type DuplicatePair = { newDeal: DuplicateDealInfo; existingDeal: DuplicateDealInfo };

function DealSummary({ deal }: { deal: DuplicateDealInfo }) {
  return (
    <div className="flex-1 rounded-md border border-slate-200 p-3 text-sm">
      <Link href={`/deals/${deal.id}`} className="font-medium text-slate-900 hover:underline">
        {dealName(deal)}
      </Link>
      <p className="mt-1 text-xs text-slate-500">
        {stageLabels[deal.stage]} · {deal.owner.name} · Oprettet {formatDate(deal.createdAt)}
      </p>
      {deal.saleAmount != null && (
        <p className="money mt-0.5 text-xs text-slate-500">{formatDKK(deal.saleAmount)}/md.</p>
      )}
    </div>
  );
}

export function DuplicateReviewSection({ pairs }: { pairs: DuplicatePair[] }) {
  const [resolved, setResolved] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const showToast = useToast();

  const remaining = pairs.filter((p) => !resolved.has(p.newDeal.id));
  if (remaining.length === 0) return null;

  function resolve(keepId: string, deleteId: string, pairKey: string) {
    startTransition(async () => {
      await resolveDuplicate(keepId, deleteId);
      setResolved((prev) => new Set(prev).add(pairKey));
      showToast("Dublet håndteret");
      router.refresh();
    });
  }

  return (
    <div className="mt-4 space-y-3 rounded-xl border border-amber-200 bg-amber-50/50 p-4">
      <h2 className="text-sm font-semibold text-amber-900">
        {remaining.length} mulige dublet(ter) fundet — vælg hvilken der skal beholdes
      </h2>
      {remaining.map((pair) => (
        <div key={pair.newDeal.id} className="flex flex-wrap items-stretch gap-2 rounded-lg bg-white p-3 shadow-sm">
          <DealSummary deal={pair.newDeal} />
          <div className="flex flex-col items-center justify-center gap-1 px-1 text-xs text-slate-400">
            <span>vs.</span>
          </div>
          <DealSummary deal={pair.existingDeal} />
          <div className="flex w-full items-center justify-end gap-2 pt-1">
            <button
              type="button"
              disabled={pending}
              onClick={() => resolve(pair.newDeal.id, pair.existingDeal.id, pair.newDeal.id)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              Behold ny (slet gammel)
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => resolve(pair.existingDeal.id, pair.newDeal.id, pair.newDeal.id)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              Behold gammel (slet ny)
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setResolved((prev) => new Set(prev).add(pair.newDeal.id))}
              className="text-xs text-slate-400 hover:text-slate-700"
            >
              Behold begge
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
