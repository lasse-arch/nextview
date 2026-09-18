"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  bulkUpdateSaleAmount,
  bulkUpdateBindingMonths,
  bulkAddProduct,
  bulkDuplicateDeals,
  bulkSetOwner,
  bulkSetSoldProduct,
  bulkStripUrlFromField,
  type StrippableField,
} from "@/lib/actions/bulk-deals";
import { stageLabels, importTypeLabels, formatDKK, formatDate, dealName, totalContractValue } from "@/lib/labels";
import { useToast } from "@/components/toast";

const PRODUCTS = ["Visitkort", "Drone-optagelse", "Nextview360 Tour", "Hjemmeside"];

const STRIPPABLE_FIELD_LABELS: Record<StrippableField, string> = {
  address: "Adresse",
  contactEmail: "E-mail",
  contactName: "Kontaktperson",
  displayName: "Kaldenavn",
};

export type ListDeal = {
  id: string;
  companyName: string;
  displayName: string | null;
  contactName: string | null;
  churnedAt: Date | null;
  owner: { name: string };
  stage: string;
  saleAmount: number | null;
  bindingMonths: number | null;
  establishmentFee: number | null;
  importType: string;
  createdAt: Date;
};

export function DealsListTable({ deals, users }: { deals: ListDeal[]; users: { id: string; name: string }[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saleAmountInput, setSaleAmountInput] = useState("");
  const [bindingMonthsInput, setBindingMonthsInput] = useState("");
  const [productType, setProductType] = useState(PRODUCTS[0]);
  const [productAmount, setProductAmount] = useState("");
  const [productFree, setProductFree] = useState(false);
  const [ownerInput, setOwnerInput] = useState("");
  const [soldProducts, setSoldProducts] = useState<string[]>([]);
  const [stripField, setStripField] = useState<StrippableField>("address");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const showToast = useToast();

  const allSelected = deals.length > 0 && selected.size === deals.length;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(deals.map((d) => d.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function runBulkAction<T>(action: () => Promise<T>, onSuccess: (result: T) => void) {
    startTransition(async () => {
      try {
        const result = await action();
        onSuccess(result);
        setSelected(new Set());
        router.refresh();
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Handlingen fejlede.");
      }
    });
  }

  function applySaleAmount() {
    if (!saleAmountInput) return;
    const ids = Array.from(selected);
    runBulkAction(
      () => bulkUpdateSaleAmount(ids, saleAmountInput),
      (result) => {
        showToast(`Salgsbeløb sat på ${result.updated} deals`);
        setSaleAmountInput("");
      }
    );
  }

  function applyBindingMonths() {
    if (!bindingMonthsInput) return;
    const ids = Array.from(selected);
    runBulkAction(
      () => bulkUpdateBindingMonths(ids, bindingMonthsInput),
      (result) => {
        showToast(`Binding sat på ${result.updated} deals`);
        setBindingMonthsInput("");
      }
    );
  }

  function duplicateSelected() {
    const ids = Array.from(selected);
    runBulkAction(
      () => bulkDuplicateDeals(ids),
      (result) => showToast(`${result.duplicated} deal(s) duplikeret`)
    );
  }

  function applyProduct() {
    const ids = Array.from(selected);
    runBulkAction(
      () => bulkAddProduct(ids, productType, productAmount, productFree),
      (result) => {
        showToast(`${productType} tilføjet til ${result.updated} deals`);
        setProductAmount("");
        setProductFree(false);
      }
    );
  }

  function applyOwner() {
    if (!ownerInput) return;
    const ids = Array.from(selected);
    runBulkAction(
      () => bulkSetOwner(ids, ownerInput),
      (result) => {
        showToast(`Ejer sat på ${result.updated} deals`);
        setOwnerInput("");
      }
    );
  }

  function applySoldProducts() {
    const ids = Array.from(selected);
    runBulkAction(
      () => bulkSetSoldProduct(ids, soldProducts),
      (result) => {
        showToast(`Produkt(er) sat på ${result.updated} deals`);
        setSoldProducts([]);
      }
    );
  }

  function applyStripUrl() {
    const ids = Array.from(selected);
    runBulkAction(
      () => bulkStripUrlFromField(ids, stripField),
      (result) => showToast(`Link fjernet fra ${result.updated} deals`)
    );
  }

  return (
    <div className="mt-4 space-y-3">
      {selected.size > 0 && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <span className="text-sm font-medium text-slate-700">{selected.size} valgt</span>

          <div className="flex items-end gap-2">
            <div>
              <label className="block text-xs font-medium text-slate-500">Sæt salgsbeløb (DKK/måned)</label>
              <input
                type="number"
                min="0"
                step="1"
                value={saleAmountInput}
                onChange={(e) => setSaleAmountInput(e.target.value)}
                className="mt-1 w-32 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
            <button
              type="button"
              disabled={pending || !saleAmountInput}
              onClick={applySaleAmount}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              Anvend
            </button>
          </div>

          <div className="h-8 w-px bg-slate-200" />

          <div className="flex items-end gap-2">
            <div>
              <label className="block text-xs font-medium text-slate-500">Sæt binding (mdr)</label>
              <input
                type="number"
                min="1"
                step="1"
                value={bindingMonthsInput}
                onChange={(e) => setBindingMonthsInput(e.target.value)}
                className="mt-1 w-24 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
            <button
              type="button"
              disabled={pending || !bindingMonthsInput}
              onClick={applyBindingMonths}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              Anvend
            </button>
          </div>

          <div className="h-8 w-px bg-slate-200" />

          <div className="flex items-end gap-2">
            <div>
              <label className="block text-xs font-medium text-slate-500">Tilføj produkt</label>
              <select
                value={productType}
                onChange={(e) => setProductType(e.target.value)}
                className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              >
                {PRODUCTS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500">Beløb</label>
              <input
                type="number"
                min="0"
                step="1"
                disabled={productFree}
                value={productAmount}
                onChange={(e) => setProductAmount(e.target.value)}
                className="mt-1 w-24 rounded-md border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-100"
              />
            </div>
            <label className="flex items-center gap-1.5 pb-2 text-xs font-medium text-slate-600">
              <input type="checkbox" checked={productFree} onChange={(e) => setProductFree(e.target.checked)} />
              Gratis
            </label>
            <button
              type="button"
              disabled={pending}
              onClick={applyProduct}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              Anvend
            </button>
          </div>

          <div className="h-8 w-px bg-slate-200" />

          <div className="flex items-end gap-2">
            <div>
              <label className="block text-xs font-medium text-slate-500">Sæt ejer</label>
              <select
                value={ownerInput}
                onChange={(e) => setOwnerInput(e.target.value)}
                className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              >
                <option value="">Vælg ejer…</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              disabled={pending || !ownerInput}
              onClick={applyOwner}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              Anvend
            </button>
          </div>

          <div className="h-8 w-px bg-slate-200" />

          <div className="flex items-end gap-2">
            <div>
              <label className="block text-xs font-medium text-slate-500">Sæt produkt(er) (erstatter)</label>
              <select
                multiple
                size={4}
                value={soldProducts}
                onChange={(e) => setSoldProducts(Array.from(e.target.selectedOptions, (o) => o.value))}
                className="mt-1 w-40 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              >
                {PRODUCTS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              disabled={pending}
              onClick={applySoldProducts}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              Anvend
            </button>
          </div>

          <div className="h-8 w-px bg-slate-200" />

          <div className="flex items-end gap-2">
            <div>
              <label className="block text-xs font-medium text-slate-500">Fjern links (https) fra felt</label>
              <select
                value={stripField}
                onChange={(e) => setStripField(e.target.value as StrippableField)}
                className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              >
                {Object.entries(STRIPPABLE_FIELD_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              disabled={pending}
              onClick={applyStripUrl}
              className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              Fjern
            </button>
          </div>

          <div className="h-8 w-px bg-slate-200" />

          <button
            type="button"
            disabled={pending}
            onClick={duplicateSelected}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Dupliker valgte
          </button>

          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="ml-auto text-xs text-slate-400 hover:text-slate-700"
          >
            Ryd valg
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="w-8 px-4 py-2">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} />
              </th>
              <th className="px-4 py-2 font-medium">Firma</th>
              <th className="px-4 py-2 font-medium">Ejer</th>
              <th className="px-4 py-2 font-medium">Stadie</th>
              <th className="px-4 py-2 font-medium">Solgt for</th>
              <th className="px-4 py-2 font-medium">Import</th>
              <th className="px-4 py-2 font-medium">Oprettet</th>
            </tr>
          </thead>
          <tbody>
            {deals.map((deal) => (
              <tr key={deal.id} className={`border-t border-slate-100 hover:bg-slate-50 ${selected.has(deal.id) ? "bg-blue-50/50" : ""}`}>
                <td className="px-4 py-1.5">
                  <input type="checkbox" checked={selected.has(deal.id)} onChange={() => toggleOne(deal.id)} />
                </td>
                <td className="px-4 py-1.5">
                  <Link href={`/deals/${deal.id}`} className="font-medium text-slate-900 hover:underline">
                    {dealName(deal)}
                  </Link>
                  {deal.contactName && <span className="ml-2 text-xs text-slate-400">{deal.contactName}</span>}
                  {deal.churnedAt && (
                    <span className="ml-2 rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                      Inaktiv
                    </span>
                  )}
                </td>
                <td className="px-4 py-1.5 text-slate-600">{deal.owner.name}</td>
                <td className="px-4 py-1.5 text-slate-600">{stageLabels[deal.stage]}</td>
                <td className="money px-4 py-1.5 text-slate-600">
                  {formatDKK(totalContractValue(deal) + (deal.establishmentFee ?? 0))}
                </td>
                <td className="px-4 py-1.5 text-slate-600">{importTypeLabels[deal.importType]}</td>
                <td className="px-4 py-1.5 text-slate-600">{formatDate(deal.createdAt)}</td>
              </tr>
            ))}
            {deals.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  Ingen deals fundet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
