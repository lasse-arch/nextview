"use client";

import { useState, useTransition } from "react";
import { markCommissionPaid, updateCommission } from "@/lib/actions/deals";
import { commissionFrequencyLabels, commissionStatusLabels, formatDKK, formatDate } from "@/lib/labels";
import { isCommissionOverdue } from "@/lib/commission";
import { useToast } from "@/components/toast";
import type { CommissionFrequency, CommissionStatus } from "@prisma/client";

type Commission = {
  id: string;
  seller: { name: string };
  rate: number;
  baseAmount: number;
  amount: number;
  frequency: CommissionFrequency;
  status: CommissionStatus;
  dueDate: Date | null;
  paidAt: Date | null;
};

function toDateInputValue(date: Date | null): string {
  if (!date) return "";
  return date.toISOString().slice(0, 10);
}

export function CommissionSection({
  dealId,
  commission,
  isAdmin,
}: {
  dealId: string;
  commission: Commission;
  isAdmin: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<CommissionStatus>(commission.status);
  const [pending, startTransition] = useTransition();
  const showToast = useToast();

  function markPaid() {
    startTransition(async () => {
      try {
        await markCommissionPaid(commission.id);
        showToast("Provision markeret som udbetalt");
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Kunne ikke markere som udbetalt.");
      }
    });
  }

  function save(formData: FormData) {
    startTransition(async () => {
      try {
        await updateCommission(commission.id, formData);
        showToast("Provision opdateret");
        setEditing(false);
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Kunne ikke gemme provision.");
      }
    });
  }

  if (editing) {
    return (
      <form action={save} className="mt-3 space-y-2.5 text-sm">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-slate-500">Sats (%)</label>
            <input
              name="rate"
              type="number"
              step="0.1"
              min="0"
              defaultValue={commission.rate}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500">Grundlag (DKK)</label>
            <input
              name="baseAmount"
              type="number"
              step="1"
              min="0"
              defaultValue={commission.baseAmount}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500">Provision (DKK)</label>
            <input
              name="amount"
              type="number"
              step="1"
              min="0"
              defaultValue={commission.amount}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500">Udbetaling</label>
            <select
              name="frequency"
              defaultValue={commission.frequency}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            >
              {Object.entries(commissionFrequencyLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500">Forfaldsdato</label>
            <input
              name="dueDate"
              type="date"
              defaultValue={toDateInputValue(commission.dueDate)}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500">Status</label>
            <select
              name="status"
              value={status}
              onChange={(e) => setStatus(e.target.value as CommissionStatus)}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            >
              {Object.entries(commissionStatusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          {status === "PAID" && (
            <div>
              <label className="block text-xs font-medium text-slate-500">Udbetalt dato</label>
              <input
                name="paidAt"
                type="date"
                defaultValue={toDateInputValue(commission.paidAt) || toDateInputValue(new Date())}
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
          )}
        </div>
        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            Gem
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            Annullér
          </button>
        </div>
      </form>
    );
  }

  return (
    <dl className="mt-3 space-y-2 text-sm">
      <div className="flex justify-between">
        <dt className="text-slate-500">Sælger</dt>
        <dd className="text-slate-800">{commission.seller.name}</dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-slate-500">Sats</dt>
        <dd className="text-slate-800">{commission.rate}%</dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-slate-500">Grundlag</dt>
        <dd className="money text-slate-800">{formatDKK(commission.baseAmount)}</dd>
      </div>
      <div className="flex justify-between font-medium">
        <dt className="text-slate-500">Provision</dt>
        <dd className="money text-slate-900">{formatDKK(commission.amount)}</dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-slate-500">Udbetaling</dt>
        <dd className="text-slate-800">{commissionFrequencyLabels[commission.frequency]}</dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-slate-500">Forfaldsdato</dt>
        <dd className={isCommissionOverdue(commission.dueDate, commission.paidAt) ? "font-medium text-red-600" : "text-slate-800"}>
          {formatDate(commission.dueDate)}
        </dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-slate-500">Status</dt>
        <dd className="text-slate-800">
          {commission.status === "PAID"
            ? commissionStatusLabels.PAID
            : isCommissionOverdue(commission.dueDate, commission.paidAt)
            ? commissionStatusLabels.DUE
            : commissionStatusLabels.PENDING}
        </dd>
      </div>
      {isAdmin && (
        <div className="flex gap-2 pt-1">
          {commission.status !== "PAID" && (
            <button
              type="button"
              disabled={pending}
              onClick={markPaid}
              className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {pending ? "Markerer…" : "Markér som udbetalt"}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setStatus(commission.status);
              setEditing(true);
            }}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            Rediger
          </button>
        </div>
      )}
    </dl>
  );
}
