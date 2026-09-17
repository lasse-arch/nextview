"use client";

import { useState, useTransition } from "react";
import { addDealItem, removeDealItem, updateDealItemUrl } from "@/lib/actions/deal-items";
import { formatDKK } from "@/lib/labels";
import { useToast } from "@/components/toast";

type DealItem = {
  id: string;
  location: string | null;
  productType: string;
  amount: number | null;
  isFree: boolean;
  url: string | null;
};

const PRODUCT_SUGGESTIONS = ["Visitkort", "Drone-optagelse", "Matterport", "Hjemmeside"];

/** Products where we deliver a link the customer/team should be able to open directly. */
function needsLink(productType: string): boolean {
  const p = productType.trim().toLowerCase();
  return p.includes("matterport") || p.includes("hjemmeside") || p.includes("tour");
}

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

function ItemLink({ dealId, item }: { dealId: string; item: DealItem }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(item.url ?? "");
  const [pending, startTransition] = useTransition();
  const showToast = useToast();

  if (!needsLink(item.productType) && !item.url) return null;

  if (editing) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            await updateDealItemUrl(dealId, item.id, value);
            showToast("Link gemt");
            setEditing(false);
          });
        }}
        className="flex items-center gap-1.5"
      >
        <input
          type="url"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="https://…"
          autoFocus
          className="w-48 rounded-md border border-slate-300 px-2 py-1 text-xs"
        />
        <button type="submit" disabled={pending} className="text-xs font-medium text-slate-600 hover:text-slate-900">
          Gem
        </button>
      </form>
    );
  }

  return item.url ? (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="text-xs font-medium text-blue-600 hover:underline"
    >
      Åbn link
    </a>
  ) : (
    <button type="button" onClick={() => setEditing(true)} className="text-xs font-medium text-amber-600 hover:underline">
      + Tilføj link
    </button>
  );
}

export function DealItemsSection({ dealId, items }: { dealId: string; items: DealItem[] }) {
  const [adding, setAdding] = useState(false);
  const [isFree, setIsFree] = useState(false);
  const [productType, setProductType] = useState("");
  const addItemWithId = addDealItem.bind(null, dealId);

  const total = items.filter((i) => !i.isFree).reduce((sum, i) => sum + (i.amount ?? 0), 0);
  const freeCount = items.filter((i) => i.isFree).length;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Ydelser</h2>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          {adding ? "Annullér" : "+ Tilføj"}
        </button>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Hvilke ydelser denne deal har — fyldes automatisk ud fra kontrakten, når den underskrives (inkl. hvad
        der er givet gratis). Tilføj selv hvis noget mangler.
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
              value={productType}
              onChange={(e) => setProductType(e.target.value)}
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
          {needsLink(productType) && (
            <div className="col-span-2 sm:col-span-4">
              <label className="block text-xs font-medium text-slate-500">
                Link til {productType.trim()} (så vi kan finde den igen og vise kunden)
              </label>
              <input
                name="url"
                type="url"
                placeholder="https://…"
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
          )}
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
              <ItemLink dealId={dealId} item={item} />
              {item.isFree ? (
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  Gratis
                </span>
              ) : (
                <span className="money text-slate-600">{formatDKK(item.amount)}</span>
              )}
              <RemoveItemButton dealId={dealId} itemId={item.id} />
            </div>
          </li>
        ))}
        {items.length === 0 && <p className="text-sm text-slate-400">Ingen tilføjelser endnu.</p>}
      </ul>

      {items.length > 0 && (
        <p className="mt-3 text-xs text-slate-500">
          I alt: <span className="money">{formatDKK(total)}</span>
          {freeCount > 0 ? ` · ${freeCount} givet gratis` : ""}
        </p>
      )}
    </section>
  );
}
