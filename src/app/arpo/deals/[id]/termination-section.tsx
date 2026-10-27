"use client";

import { useState, useTransition } from "react";
import { terminateContract, withdrawTermination, setManualContractEndDate } from "@/lib/actions/deals";
import { formatDate } from "@/lib/labels";
import { useToast } from "@/components/toast";

function toDateInputValue(date: Date | null): string {
  if (!date) return "";
  return new Date(date).toISOString().slice(0, 10);
}

export function TerminationSection({
  dealId,
  noticePeriodMonths,
  terminationNoticeAt,
  contractEndDate,
  contractEndDateManual,
  isChurned,
  isAdmin,
}: {
  dealId: string;
  noticePeriodMonths: number;
  terminationNoticeAt: Date | null;
  contractEndDate: Date | null;
  contractEndDateManual: boolean;
  isChurned: boolean;
  isAdmin: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [editingEndDate, setEditingEndDate] = useState(false);
  const [terminateError, setTerminateError] = useState<string | null>(null);
  const [manualEndDateError, setManualEndDateError] = useState<string | null>(null);
  const showToast = useToast();

  if (isChurned) return null;

  function handleTerminateSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setTerminateError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        const result = await terminateContract(dealId, formData);
        if (!result.ok) {
          setTerminateError(result.error);
          return;
        }
        showToast("Opsigelse registreret");
      } catch (err) {
        setTerminateError(err instanceof Error ? err.message : "Der opstod en fejl.");
      }
    });
  }

  function handleManualEndDateSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setManualEndDateError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        const result = await setManualContractEndDate(dealId, formData);
        if (!result.ok) {
          setManualEndDateError(result.error);
          return;
        }
        setEditingEndDate(false);
        showToast("Ophørsdato rettet manuelt");
      } catch (err) {
        setManualEndDateError(err instanceof Error ? err.message : "Der opstod en fejl.");
      }
    });
  }

  function handleWithdraw() {
    startTransition(async () => {
      try {
        await withdrawTermination(dealId);
        showToast("Opsigelse fortrudt");
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Der opstod en fejl.");
      }
    });
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Opsigelse</h2>
      <p className="mt-1 text-xs text-slate-500">
        Kontrakten fornyes automatisk med endnu en fuld bindingsperiode, hvis den ikke opsiges med varsel inden
        udløb — der skal ikke nødvendigvis et nyt kontraktlink til. Opsiges den for sent til at nå varslet inden
        den aktuelle periode udløber, låses den til den næste periode i stedet.
      </p>

      {terminationNoticeAt ? (
        <div className="mt-4 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          <p>
            Opsagt {formatDate(terminationNoticeAt)} med {noticePeriodMonths} måneders varsel.
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-2">
            <span className="font-medium">Ophører: {formatDate(contractEndDate)}</span>
            {contractEndDateManual && (
              <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-medium text-amber-900">
                Rettet manuelt
              </span>
            )}
            {isAdmin && !editingEndDate && (
              <button
                type="button"
                onClick={() => setEditingEndDate(true)}
                className="text-xs font-medium text-amber-800 underline hover:text-amber-950"
              >
                Ret manuelt
              </button>
            )}
          </p>

          {editingEndDate && (
            <form onSubmit={handleManualEndDateSubmit} className="mt-2 flex flex-wrap items-end gap-2">
              <div>
                <label className="block text-xs font-medium text-amber-800">Ny ophørsdato *</label>
                <input
                  name="contractEndDate"
                  type="date"
                  required
                  defaultValue={toDateInputValue(contractEndDate)}
                  className="mt-1 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={pending}
                className="rounded-md bg-amber-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-900 disabled:opacity-50"
              >
                {pending ? "Gemmer…" : "Gem dato"}
              </button>
              <button
                type="button"
                onClick={() => setEditingEndDate(false)}
                className="text-xs font-medium text-amber-800 underline hover:text-amber-950"
              >
                Annullér
              </button>
              {manualEndDateError && <p className="w-full text-xs text-red-600">{manualEndDateError}</p>}
            </form>
          )}

          <button
            type="button"
            disabled={pending}
            onClick={handleWithdraw}
            className="mt-2 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
          >
            {pending ? "Gemmer…" : "Fortryd opsigelse"}
          </button>
        </div>
      ) : (
        <form onSubmit={handleTerminateSubmit} className="mt-4 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Opsigelsesdato *
              </label>
              <input
                name="noticeDate"
                type="date"
                required
                defaultValue={toDateInputValue(new Date())}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Opsigelsesvarsel (måneder) *
              </label>
              <input
                name="noticePeriodMonths"
                type="number"
                min="0"
                step="1"
                required
                defaultValue={noticePeriodMonths}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          {terminateError && <p className="text-sm text-red-600">{terminateError}</p>}
          <button
            type="submit"
            disabled={pending}
            className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            {pending ? "Gemmer…" : "Opsig kontrakt"}
          </button>
        </form>
      )}
    </section>
  );
}
