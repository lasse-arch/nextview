"use client";

import { useState, useTransition } from "react";
import { addDealItem, removeDealItem } from "@/lib/actions/deal-items";
import { formatDKK } from "@/lib/labels";
import { useToast } from "@/components/toast";

type DealItem = {
  id: string;
  location: string | null;
  productType: string;
  amount: number | null;
  isFree: boolean;
};

const PRODUCT_SUGGESTIONS = ["Hjemmeside", "Virtuel tour (Matterport)", "Drone", "Visitkort"];

function RemoveItemButton({ dealId, itemId }: { dealId: string; itemId: string }) {
  const [pending, startTransition] = useTransition();
  const showToast = useToast();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await removeDealItem(dealId, itemId);
          showToast("Fjernet");
        })
      }
      className="text-xs text-slate-400 hover:text-red-600 disabled:opacity-50"
    >
      {pending ? "…" : "Fjern"}
    </button>
  );
}

export function DealItemsSection({ dealId, items }: { dealId: string; items: DealItem[] }) {
  const [adding, setAdding] = useState(false);
  const [isFree, setIsFree] = useState(false);
  const addItemWithId = addDealItem.bind(null, dealId);

  const total = items.filter((i) => !i.isFree).reduce((sum, i) => sum + (i.amount ?? 0), 0);
  const freeCount = items.filter((i) => i.isFree).length;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Ydelser & steder</h2>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          {adding ? "Annullér" : "+ Tilføj"}
        </button>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Brug til at holde styr på flere lokationer og/eller flere ydelser (hjemmeside, virtuel tour, drone,
        visitkort m.m.) på samme kunde — inkl. hvad der er givet gratis.
      </p>

      {adding && (
        <form action={addItemWithId} className="mt-4 grid grid-cols-2 gap-3 rounded-md border border-slate-200 p-3 sm:grid-cols-4">
          <div>
            <label className="block text-xs font-medium text-slate-500">Sted (valgfri)</label>
            <input
              name="location"
              placeholder="F.eks. Hovedkontor"
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500">Ydelse/produkt *</label>
            <input
              name="productType"
              list="product-suggestions"
              required
              placeholder="F.eks. Drone"
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
            <datalist id="product-suggestions">
              {PRODUCT_SUGGESTIONS.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500">Beløb (DKK)</label>
            <input
              name="amount"
              type="number"
              min="0"
              step="1"
              disabled={isFree}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-100"
            />
          </div>
          <div className="flex items-end gap-2 pb-2">
            <input
              type="checkbox"
              name="isFree"
              id="item-is-free"
              checked={isFree}
              onChange={(e) => setIsFree(e.target.checked)}
            />
            <label htmlFor="item-is-free" className="text-xs font-medium text-slate-600">
              Givet gratis
            </label>
          </div>
          <button
            type="submit"
            className="col-span-2 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 sm:col-span-4"
          >
            Tilføj
          </button>
        </form>
      )}

      <ul className="mt-4 space-y-2">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex items-center justify-between rounded-md border border-slate-100 px-3 py-2 text-sm"
          >
            <div>
              <span className="font-medium text-slate-800">{item.productType}</span>
              {item.location && <span className="ml-2 text-xs text-slate-400">{item.location}</span>}
            </div>
            <div className="flex items-center gap-3">
              {item.isFree ? (
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  Gratis
                </span>
              ) : (
                <span className="text-slate-600">{formatDKK(item.amount)}</span>
              )}
              <RemoveItemButton dealId={dealId} itemId={item.id} />
            </div>
          </li>
        ))}
        {items.length === 0 && <p className="text-sm text-slate-400">Ingen tilføjelser endnu.</p>}
      </ul>

      {items.length > 0 && (
        <p className="mt-3 text-xs text-slate-500">
          I alt: {formatDKK(total)}
          {freeCount > 0 ? ` · ${freeCount} givet gratis` : ""}
        </p>
      )}
    </section>
  );
}
