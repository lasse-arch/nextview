"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { updateDealStage } from "@/lib/actions/deals";
import { stageLabels, stageOrder, formatDKK } from "@/lib/labels";
import type { DealStage } from "@prisma/client";

export type BoardDeal = {
  id: string;
  companyName: string;
  contactName: string | null;
  ownerName: string;
  saleAmount: number | null;
  stage: DealStage;
  isChurned: boolean;
};

const CONTRACT_MANAGED_STAGES: DealStage[] = ["CONTRACT_SENT", "CONTRACT_SIGNED"];

export function DealsBoard({ initialDeals }: { initialDeals: BoardDeal[] }) {
  const [deals, setDeals] = useState(initialDeals);
  const [error, setError] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function moveDealLocally(dealId: string, newStage: DealStage) {
    setDeals((prev) => prev.map((d) => (d.id === dealId ? { ...d, stage: newStage } : d)));
  }

  function handleDrop(newStage: DealStage) {
    if (!draggingId) return;
    const deal = deals.find((d) => d.id === draggingId);
    setDraggingId(null);
    if (!deal || deal.stage === newStage) return;

    if (CONTRACT_MANAGED_STAGES.includes(newStage)) {
      setError("Denne fase styres automatisk via PandaDoc-kontrakten på dealens side.");
      return;
    }

    const previousStage = deal.stage;
    setError(null);
    moveDealLocally(deal.id, newStage);

    startTransition(async () => {
      try {
        await updateDealStage(deal.id, newStage);
      } catch (err) {
        moveDealLocally(deal.id, previousStage);
        setError(err instanceof Error ? err.message : "Kunne ikke flytte dealen.");
      }
    });
  }

  const columns = stageOrder.map((stage) => ({
    stage,
    deals: deals.filter((d) => d.stage === stage),
  }));

  return (
    <div>
      {error && (
        <div className="mb-3 rounded-md bg-amber-50 px-4 py-2 text-sm text-amber-800">
          {error}{" "}
          <button onClick={() => setError(null)} className="ml-2 underline">
            Luk
          </button>
        </div>
      )}
      <div className="flex gap-3 overflow-x-auto pb-4">
        {columns.map(({ stage, deals: colDeals }) => {
          const total = colDeals.reduce((sum, d) => sum + (d.saleAmount ?? 0), 0);
          const managed = CONTRACT_MANAGED_STAGES.includes(stage);
          return (
            <div
              key={stage}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(stage)}
              className="flex h-[calc(100vh-260px)] w-48 flex-shrink-0 flex-col rounded-lg bg-slate-100"
            >
              <div className="px-2 py-1.5">
                <h3 className="truncate text-xs font-semibold text-slate-800">{stageLabels[stage]}</h3>
                <p className="text-[11px] text-slate-500">
                  {formatDKK(total)} · {colDeals.length}
                  {managed && " · PandaDoc"}
                </p>
              </div>
              <div className="flex-1 space-y-1.5 overflow-y-auto px-1.5 pb-1.5">
                {colDeals.map((deal) => (
                  <div
                    key={deal.id}
                    draggable
                    onDragStart={() => setDraggingId(deal.id)}
                    onDragEnd={() => setDraggingId(null)}
                    className={`cursor-grab rounded-md border px-2 py-1.5 shadow-sm active:cursor-grabbing ${
                      deal.isChurned ? "border-slate-200 bg-slate-50 opacity-60" : "border-slate-200 bg-white"
                    }`}
                  >
                    <Link
                      href={`/deals/${deal.id}`}
                      className="block truncate text-xs font-medium text-slate-900 hover:underline"
                      title={deal.companyName}
                    >
                      {deal.companyName}
                      {deal.isChurned && <span className="ml-1 text-[10px] font-normal text-slate-400">(inaktiv)</span>}
                    </Link>
                    <div className="mt-0.5 flex items-center justify-between text-[11px] text-slate-500">
                      <span className="truncate">{deal.ownerName}</span>
                      <span className="flex-shrink-0 font-medium text-slate-700">{formatDKK(deal.saleAmount)}</span>
                    </div>
                  </div>
                ))}
                {colDeals.length === 0 && (
                  <div className="rounded-md border border-dashed border-slate-300 p-2 text-center text-[11px] text-slate-400">
                    Ingen deals
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
