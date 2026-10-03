"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatDKK, formatDate, invoiceStatusLabel } from "@/lib/labels";

export type BetalingRow = {
  dealId: string;
  name: string;
  liveAt: string | null;
  invoiceCount: number;
  unpaidAmount: number;
  lastPaidAt: string | null;
  lastInvoiceStatus: string | null;
  lastInvoiceFailureReason: string | null;
  status: "BETALT" | "MANGLER_BETALING" | "INGEN_FAKTURA" | "GRATIS";
};

const STATUS_LABELS: Record<BetalingRow["status"], string> = {
  BETALT: "Betalt",
  MANGLER_BETALING: "Mangler betaling",
  INGEN_FAKTURA: "Ingen faktura endnu",
  GRATIS: "Gratis",
};

const STATUS_BADGE_CLASS: Record<BetalingRow["status"], string> = {
  BETALT: "bg-emerald-50 text-emerald-700",
  MANGLER_BETALING: "bg-red-50 text-red-700",
  INGEN_FAKTURA: "bg-amber-50 text-amber-700",
  GRATIS: "bg-slate-100 text-slate-500",
};

type SortKey = "name" | "liveAt" | "invoiceCount" | "unpaidAmount" | "status" | "lastPaidAt";

const COLUMNS: { key: SortKey; label: string; align?: "right" }[] = [
  { key: "name", label: "Kunde" },
  { key: "liveAt", label: "Live dato" },
  { key: "invoiceCount", label: "Fakturaer", align: "right" },
  { key: "unpaidAmount", label: "Udestående", align: "right" },
  { key: "status", label: "Status" },
  { key: "lastPaidAt", label: "Sidst betalt" },
];

function compare(a: BetalingRow, b: BetalingRow, key: SortKey): number {
  switch (key) {
    case "name":
      return a.name.localeCompare(b.name, "da");
    case "liveAt":
      return (a.liveAt ? new Date(a.liveAt).getTime() : 0) - (b.liveAt ? new Date(b.liveAt).getTime() : 0);
    case "invoiceCount":
      return a.invoiceCount - b.invoiceCount;
    case "unpaidAmount":
      return a.unpaidAmount - b.unpaidAmount;
    case "status":
      return STATUS_LABELS[a.status].localeCompare(STATUS_LABELS[b.status], "da");
    case "lastPaidAt":
      return (a.lastPaidAt ? new Date(a.lastPaidAt).getTime() : 0) - (b.lastPaidAt ? new Date(b.lastPaidAt).getTime() : 0);
  }
}

export function BetalingTable({ rows }: { rows: BetalingRow[] }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | BetalingRow["status"]>("ALL");
  // Defaults to "most owed first" - the thing most worth looking at when
  // this page is opened cold, rather than an arbitrary alphabetical start.
  const [sortKey, setSortKey] = useState<SortKey>("unpaidAmount");
  const [sortDesc, setSortDesc] = useState(true);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDesc((d) => !d);
    } else {
      setSortKey(key);
      setSortDesc(true);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "ALL" && r.status !== statusFilter) return false;
      if (q && !r.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, statusFilter]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => compare(a, b, sortKey) * (sortDesc ? -1 : 1));
    return copy;
  }, [filtered, sortKey, sortDesc]);

  const totals = useMemo(() => {
    return {
      unpaidTotal: rows.reduce((sum, r) => sum + r.unpaidAmount, 0),
      missingInvoice: rows.filter((r) => r.status === "INGEN_FAKTURA").length,
      owing: rows.filter((r) => r.status === "MANGLER_BETALING").length,
    };
  }, [rows]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Søg på kunde…"
          className="w-full max-w-xs rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
        <div className="flex rounded-md border border-slate-300 text-xs">
          {(["ALL", "MANGLER_BETALING", "INGEN_FAKTURA", "BETALT", "GRATIS"] as const).map((key, i, arr) => (
            <button
              key={key}
              type="button"
              onClick={() => setStatusFilter(key)}
              className={`px-2.5 py-1.5 font-medium ${i === 0 ? "rounded-l-md" : ""} ${
                i === arr.length - 1 ? "rounded-r-md" : ""
              } ${statusFilter === key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
            >
              {key === "ALL" ? "Alle" : STATUS_LABELS[key]}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-400">
          {totals.owing} mangler betaling · {totals.missingInvoice} uden faktura · {formatDKK(totals.unpaidTotal)} udestående i alt
        </span>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              {COLUMNS.map((col) => (
                <th key={col.key} className={`px-3 py-2 font-medium ${col.align === "right" ? "text-right" : ""}`}>
                  <button
                    type="button"
                    onClick={() => toggleSort(col.key)}
                    className="inline-flex items-center gap-1 hover:text-slate-800"
                  >
                    {col.label}
                    {sortKey === col.key && <span className="text-slate-400">{sortDesc ? "↓" : "↑"}</span>}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={row.dealId} className="border-t border-slate-100">
                <td className="px-3 py-2">
                  <Link href={`/deals/${row.dealId}`} className="font-medium text-slate-900 hover:underline">
                    {row.name}
                  </Link>
                </td>
                <td className="px-3 py-2 text-slate-600">{formatDate(row.liveAt)}</td>
                <td className="px-3 py-2 text-right text-slate-600">{row.invoiceCount}</td>
                <td className={`money px-3 py-2 text-right font-medium ${row.unpaidAmount > 0 ? "text-red-600" : "text-slate-600"}`}>
                  {formatDKK(row.unpaidAmount)}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASS[row.status]}`}
                    title={row.lastInvoiceStatus ? invoiceStatusLabel({ status: row.lastInvoiceStatus, failureReason: row.lastInvoiceFailureReason }) : undefined}
                  >
                    {STATUS_LABELS[row.status]}
                  </span>
                </td>
                <td className="px-3 py-2 text-slate-600">{formatDate(row.lastPaidAt)}</td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="px-3 py-6 text-center text-slate-400">
                  Ingen kunder matcher.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
