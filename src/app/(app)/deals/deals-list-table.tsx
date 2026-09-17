"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { bulkUpdateSaleAmount, bulkAddProduct, bulkDuplicateDeals } from "@/lib/actions/bulk-deals";
import { stageLabels, importTypeLabels, formatDKK, formatDate, dealName, totalContractValue } from "@/lib/labels";
import { useToast } from "@/components/toast";

const PRODUCTS = ["Visitkort", "Drone-optagelse", "Matterport", "Hjemmeside"];

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

export function DealsListTable({ deals }: { deals: ListDeal[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saleAmountInput, setSaleAmountInput] = useState("");
  const [productType, setProductType] = useState(PRODUCTS[0]);
  const [productAmount, setProductAmount] = useState("");
  const [productFree, setProductFree] = useState(false);
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

  function applySaleAmount() {
    if (!saleAmountInput) return;
    startTransition(async () => {
      const ids = Array.from(selected);
      const result = await bulkUpdateSaleAmount(ids, saleAmountInput);
      showToast(`Salgsbeløb sat på ${result.updated} deals`);
      setSaleAmountInput("");
      setSelected(new Set());
      router.refresh();
    });
  }

  function duplicateSelected() {
    startTransition(async () => {
      const ids = Array.from(selected);
      const result = await bulkDuplicateDeals(ids);
      showToast(`${result.duplicated} deal(s) duplikeret`);
      setSelected(new Set());
      router.refresh();
    });
  }

  function applyProduct() {
    startTransition(async () => {
      const ids = Array.from(selected);
      const result = await bulkAddProduct(ids, productType, productAmount, productFree);
      showToast(`${productType} tilføjet til ${result.updated} deals`);
      setProductAmount("");
      setProductFree(false);
      setSelected(new Set());
      router.refresh();
    });
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
                <td className="px-4 py-1.5 text-slate-600">
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
