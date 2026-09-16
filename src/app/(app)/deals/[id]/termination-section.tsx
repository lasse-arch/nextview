"use client";

import { useTransition } from "react";
import { terminateContract, withdrawTermination } from "@/lib/actions/deals";
import { formatDate } from "@/lib/labels";

function toDateInputValue(date: Date | null): string {
  if (!date) return "";
  return new Date(date).toISOString().slice(0, 10);
}

export function TerminationSection({
  dealId,
  noticePeriodMonths,
  terminationNoticeAt,
  contractEndDate,
  isChurned,
}: {
  dealId: string;
  noticePeriodMonths: number;
  terminationNoticeAt: Date | null;
  contractEndDate: Date | null;
  isChurned: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const terminateWithId = terminateContract.bind(null, dealId);

  if (isChurned) return null;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Opsigelse</h2>
      <p className="mt-1 text-xs text-slate-500">
        Kontrakten kører videre efter bindingsperioden, indtil den bliver opsagt med varsel — der skal ikke
        nødvendigvis et nyt kontraktlink til. Ophørsdato regnes som det seneste af bindingsperiodens udløb og
        opsigelsesdato + varsel.
      </p>

      {terminationNoticeAt ? (
        <div className="mt-4 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          <p>
            Opsagt {formatDate(terminationNoticeAt)} med {noticePeriodMonths} måneders varsel.
          </p>
          <p className="mt-1 font-medium">Ophører: {formatDate(contractEndDate)}</p>
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => withdrawTermination(dealId))}
            className="mt-2 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
          >
            {pending ? "Gemmer…" : "Fortryd opsigelse"}
          </button>
        </div>
      ) : (
        <form action={terminateWithId} className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500">Opsigelsesdato *</label>
              <input
                name="noticeDate"
                type="date"
                required
                defaultValue={toDateInputValue(new Date())}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500">Opsigelsesvarsel (måneder) *</label>
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
          <button
            type="submit"
            className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Opsig kontrakt
          </button>
        </form>
      )}
    </section>
  );
}
