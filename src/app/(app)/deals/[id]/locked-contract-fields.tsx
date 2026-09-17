"use client";

import { useState } from "react";
import { formatDKK, formatDate } from "@/lib/labels";

const SOLD_PRODUCT_OPTIONS = ["Visitkort", "Drone-optagelse", "Matterport", "Hjemmeside"];

function toDateInputValue(date: Date | null): string {
  if (!date) return "";
  return date.toISOString().slice(0, 10);
}

export function LockedContractFields({
  isAdmin,
  soldProduct,
  bindingMonths,
  saleAmount,
  soldAt,
  establishmentFee,
  liveAt,
}: {
  isAdmin: boolean;
  soldProduct: string | null;
  bindingMonths: number | null;
  saleAmount: number | null;
  soldAt: Date | null;
  establishmentFee: number | null;
  liveAt: Date | null;
}) {
  const [unlocked, setUnlocked] = useState(false);

  if (!unlocked) {
    return (
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-500">Solgt til (produkt/ydelse)</label>
          <p className="mt-1 text-sm text-slate-700">{soldProduct || "–"}</p>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500">Binding (måneder)</label>
          <p className="mt-1 text-sm text-slate-700">{bindingMonths ?? "–"}</p>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500">Månedspris (DKK)</label>
          <p className="money mt-1 text-sm text-slate-700">{formatDKK(saleAmount)}</p>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500">Solgt dato</label>
          <p className="mt-1 text-sm text-slate-700">{formatDate(soldAt)}</p>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500">Etableringspris (DKK)</label>
          <p className="money mt-1 text-sm text-slate-700">{formatDKK(establishmentFee)}</p>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500">Live dato (afleveret)</label>
          <p className="mt-1 text-sm text-slate-700">{formatDate(liveAt)}</p>
        </div>
        <p className="col-span-2 text-xs text-slate-400">
          Sættes automatisk via kontrakten.
          {isAdmin && (
            <button
              type="button"
              onClick={() => setUnlocked(true)}
              className="ml-2 font-medium text-slate-600 underline hover:text-slate-900"
            >
              Ret manuelt
            </button>
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <label className="block text-xs font-medium text-slate-500">Solgt til (produkt/ydelse)</label>
        <select
          name="soldProduct"
          multiple
          defaultValue={soldProduct ? soldProduct.split(", ") : []}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          {SOLD_PRODUCT_OPTIONS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500">Binding (måneder)</label>
        <input
          name="bindingMonths"
          type="number"
          min="0"
          defaultValue={bindingMonths ?? ""}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500">Månedspris (DKK)</label>
        <input
          name="saleAmount"
          type="number"
          min="0"
          step="1"
          defaultValue={saleAmount ?? ""}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500">Solgt dato</label>
        <input
          name="soldAt"
          type="date"
          defaultValue={toDateInputValue(soldAt)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500">Etableringspris (DKK)</label>
        <input
          name="establishmentFee"
          type="number"
          min="0"
          step="1"
          defaultValue={establishmentFee ?? ""}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500">Live dato (afleveret)</label>
        <input
          name="liveAt"
          type="date"
          defaultValue={toDateInputValue(liveAt)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <p className="col-span-2 text-xs text-amber-600">
        Du retter nu felterne manuelt i stedet for via kontrakten.{" "}
        <button
          type="button"
          onClick={() => setUnlocked(false)}
          className="font-medium underline hover:text-amber-800"
        >
          Fortryd
        </button>
      </p>
    </div>
  );
}
