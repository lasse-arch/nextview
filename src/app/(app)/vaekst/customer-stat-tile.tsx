"use client";

import { useState } from "react";
import Link from "next/link";
import { formatDKK, stageLabels } from "@/lib/labels";

/** `key` when one customer can have several rows (e.g. several unpaid invoices). */
export type StatCustomer = { key?: string; id: string; name: string; stage: string; note?: string; amount?: number };

/**
 * Same stat tile as the plain one elsewhere on this page, but with a
 * "Rapport" button that opens the customer list behind the number in a
 * modal - same pattern as the dashboard's "Solgt i alt" report
 * (sold-total-report-button.tsx), so a report always opens the same way
 * across the app instead of each page inventing its own.
 */
export function CustomerStatTile({
  label,
  value,
  sub,
  customers,
  money,
  noteHeader = "Stadie",
}: {
  label: string;
  value: string;
  sub?: string;
  customers: StatCustomer[];
  /** Amount value in the tile (money-styled) - rows with an amount get a Beløb column and a total. */
  money?: boolean;
  noteHeader?: string;
}) {
  const [open, setOpen] = useState(false);
  const hasAmounts = customers.some((c) => c.amount != null);
  const columns = hasAmounts ? 3 : 2;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="shrink-0 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-500 hover:bg-slate-50"
        >
          Rapport
        </button>
      </div>
      <div className={`mt-1 font-semibold text-slate-900 text-xl ${money ? "money" : ""}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-400">{sub}</div>}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div
            className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Rapport: {label}</h2>
              <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <tr className="border-b border-slate-200">
                    <th className="py-1.5 font-medium">Kunde</th>
                    <th className="py-1.5 text-right font-medium">{noteHeader}</th>
                    {hasAmounts && <th className="py-1.5 pl-4 text-right font-medium">Beløb</th>}
                  </tr>
                </thead>
                <tbody>
                  {customers.map((c) => (
                    <tr key={c.key ?? c.id} className="border-b border-slate-100">
                      <td className="py-1.5">
                        <Link href={`/deals/${c.id}`} className="text-blue-700 hover:underline">
                          {c.name}
                        </Link>
                      </td>
                      <td className="py-1.5 text-right text-slate-500">{c.note ?? stageLabels[c.stage] ?? c.stage}</td>
                      {hasAmounts && (
                        <td className="money whitespace-nowrap py-1.5 pl-4 text-right font-mono text-slate-900">
                          {c.amount != null ? formatDKK(c.amount) : ""}
                        </td>
                      )}
                    </tr>
                  ))}
                  {hasAmounts && customers.length > 0 && (
                    <tr>
                      <td colSpan={2} className="py-2 font-semibold text-slate-900">
                        I alt
                      </td>
                      <td className="money whitespace-nowrap py-2 pl-4 text-right font-mono font-semibold text-slate-900">
                        {formatDKK(customers.reduce((sum, c) => sum + (c.amount ?? 0), 0))}
                      </td>
                    </tr>
                  )}
                  {customers.length === 0 && (
                    <tr>
                      <td colSpan={columns} className="py-4 text-center text-slate-400">
                        Ingen kunder.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
