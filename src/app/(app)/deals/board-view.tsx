"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { updateDealStage, setMeetingDateAndStage, addQuickNote } from "@/lib/actions/deals";
import { stageLabels, stageOrder, formatDKK, dealName, totalContractValue } from "@/lib/labels";
import { useToast } from "@/components/toast";
import type { DealStage } from "@prisma/client";

export type BoardDeal = {
  id: string;
  companyName: string;
  displayName: string | null;
  contactName: string | null;
  ownerName: string;
  ownerAvatarUrl: string | null;
  saleAmount: number | null;
  bindingMonths: number | null;
  establishmentFee: number | null;
  stage: DealStage;
  isChurned: boolean;
};

function ownerInitials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const CONTRACT_MANAGED_STAGES: DealStage[] = ["CONTRACT_SENT", "CONTRACT_SIGNED"];

function toDateTimeLocalDefault(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  d.setSeconds(0, 0);
  return d.toISOString().slice(0, 16);
}

export function DealsBoard({ initialDeals, isAdmin }: { initialDeals: BoardDeal[]; isAdmin: boolean }) {
  const [deals, setDeals] = useState(initialDeals);
  const [error, setError] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [meetingPromptDealId, setMeetingPromptDealId] = useState<string | null>(null);
  const [meetingDateInput, setMeetingDateInput] = useState(toDateTimeLocalDefault());
  const [quickNoteDealId, setQuickNoteDealId] = useState<string | null>(null);
  const [quickNoteText, setQuickNoteText] = useState("");
  const [, startTransition] = useTransition();
  const showToast = useToast();

  function moveDealLocally(dealId: string, newStage: DealStage) {
    setDeals((prev) => prev.map((d) => (d.id === dealId ? { ...d, stage: newStage } : d)));
  }

  function handleDrop(newStage: DealStage) {
    if (!draggingId) return;
    const deal = deals.find((d) => d.id === draggingId);
    setDraggingId(null);
    if (!deal || deal.stage === newStage) return;

    if (!isAdmin && CONTRACT_MANAGED_STAGES.includes(newStage)) {
      setError("Denne fase styres automatisk via PandaDoc-kontrakten på dealens side.");
      return;
    }

    if (newStage === "MEETING_BOOKED") {
      setMeetingDateInput(toDateTimeLocalDefault());
      setMeetingPromptDealId(deal.id);
      return;
    }

    const previousStage = deal.stage;
    setError(null);
    moveDealLocally(deal.id, newStage);

    startTransition(async () => {
      try {
        await updateDealStage(deal.id, newStage);
        showToast("Deal flyttet");
      } catch (err) {
        moveDealLocally(deal.id, previousStage);
        setError(err instanceof Error ? err.message : "Kunne ikke flytte dealen.");
      }
    });
  }

  function confirmMeetingDate() {
    const dealId = meetingPromptDealId;
    if (!dealId || !meetingDateInput) return;
    const deal = deals.find((d) => d.id === dealId);
    if (!deal) return;

    const previousStage = deal.stage;
    setMeetingPromptDealId(null);
    setError(null);
    moveDealLocally(dealId, "MEETING_BOOKED");

    startTransition(async () => {
      try {
        await setMeetingDateAndStage(dealId, new Date(meetingDateInput).toISOString());
        showToast("Møde booket");
      } catch (err) {
        moveDealLocally(dealId, previousStage);
        setError(err instanceof Error ? err.message : "Kunne ikke booke mødet.");
      }
    });
  }

  function submitQuickNote() {
    const dealId = quickNoteDealId;
    const body = quickNoteText.trim();
    if (!dealId || !body) return;

    setQuickNoteDealId(null);
    setQuickNoteText("");

    startTransition(async () => {
      try {
        await addQuickNote(dealId, body);
        showToast("Note tilføjet");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Kunne ikke gemme noten.");
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

      {meetingPromptDealId && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40">
          <div className="w-80 rounded-lg bg-white p-4 shadow-xl">
            <h3 className="text-sm font-semibold text-slate-900">Hvornår er mødet booket?</h3>
            <input
              type="datetime-local"
              value={meetingDateInput}
              onChange={(e) => setMeetingDateInput(e.target.value)}
              autoFocus
              className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setMeetingPromptDealId(null)}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
              >
                Annullér
              </button>
              <button
                type="button"
                onClick={confirmMeetingDate}
                disabled={!meetingDateInput}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                Book møde
              </button>
            </div>
          </div>
        </div>
      )}

      {quickNoteDealId && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40">
          <div className="w-80 rounded-lg bg-white p-4 shadow-xl">
            <h3 className="text-sm font-semibold text-slate-900">Skriv en hurtig note</h3>
            <textarea
              value={quickNoteText}
              onChange={(e) => setQuickNoteText(e.target.value)}
              autoFocus
              rows={4}
              placeholder="Hvad skal huskes om denne deal?"
              className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setQuickNoteDealId(null);
                  setQuickNoteText("");
                }}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
              >
                Annullér
              </button>
              <button
                type="button"
                onClick={submitQuickNote}
                disabled={!quickNoteText.trim()}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                Gem note
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-3 overflow-x-auto pb-4">
        {columns.map(({ stage, deals: colDeals }) => {
          const total = colDeals.reduce((sum, d) => sum + totalContractValue(d) + (d.establishmentFee ?? 0), 0);
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
                  <span className="money">{formatDKK(total)}</span> · {colDeals.length}
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
                      title={dealName(deal)}
                    >
                      {dealName(deal)}
                      {deal.isChurned && <span className="ml-1 text-[10px] font-normal text-slate-400">(inaktiv)</span>}
                    </Link>
                    <div className="mt-0.5 flex items-center justify-between text-[11px] text-slate-500">
                      <span className="flex min-w-0 items-center gap-1">
                        {deal.ownerAvatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={deal.ownerAvatarUrl}
                            alt={deal.ownerName}
                            className="h-4 w-4 flex-shrink-0 rounded-full object-cover"
                          />
                        ) : (
                          <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-slate-300 text-[8px] font-semibold text-white">
                            {ownerInitials(deal.ownerName)}
                          </span>
                        )}
                        <span className="truncate">{deal.ownerName}</span>
                      </span>
                      <span className="money flex-shrink-0 font-medium text-slate-700">
                        {formatDKK(totalContractValue(deal) + (deal.establishmentFee ?? 0))}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setQuickNoteText("");
                        setQuickNoteDealId(deal.id);
                      }}
                      className="mt-1 text-[10px] text-blue-600 hover:underline"
                    >
                      + Quick-note
                    </button>
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
