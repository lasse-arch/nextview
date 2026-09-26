"use client";

import { useState, useTransition } from "react";
import { sendCustomerReportsNowAction } from "@/lib/actions/customer-reports";
import { useToast } from "@/components/toast";
import { StatsCustomerRow, type StatsCustomerRowData } from "./stats-customer-row";

/**
 * Wraps the "Live kunder" table in one client component so checkbox
 * selection can be shared across every row (each StatsCustomerRow otherwise
 * manages only its own local state) - lets an admin queue several, or all,
 * visitor-stats reports in one "Send nu" click instead of one row at a time.
 */
export function LiveCustomersTable({ rows }: { rows: StatsCustomerRowData[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sendingAll, startSendAll] = useTransition();
  const showToast = useToast();

  const allIds = rows.map((r) => r.dealId);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(allIds));
  }

  function toggleOne(dealId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(dealId)) next.delete(dealId);
      else next.add(dealId);
      return next;
    });
  }

  function sendSelected() {
    const ids = [...selected];
    if (ids.length === 0) return;
    startSendAll(async () => {
      try {
        const result = await sendCustomerReportsNowAction(ids);
        if (!result.ok) {
          showToast(result.error);
          return;
        }
        showToast(
          `${result.queued} rapport${result.queued === 1 ? "" : "er"} sat i kø for afsendelse${
            result.skipped > 0 ? `, ${result.skipped} sprunget over (intet MP-Skin nummer)` : ""
          }.`
        );
        setSelected(new Set());
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Der opstod en fejl.");
      }
    });
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          {selected.size > 0 ? `${selected.size} valgt` : "Vælg en eller flere kunder for at sende samlet"}
        </p>
        <button
          type="button"
          disabled={selected.size === 0 || sendingAll}
          onClick={sendSelected}
          className="shrink-0 whitespace-nowrap rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-40"
        >
          {sendingAll ? "Sender…" : `Send nu (${selected.size})`}
        </button>
      </div>

      <div className="overflow-hidden rounded-md border border-slate-100">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] text-sm">
            <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2 font-medium">
                  <div className="flex items-center gap-2">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Vælg alle" />
                    <span>Kunde</span>
                  </div>
                </th>
                <th className="px-3 py-2 font-medium">MP-Skin nummer</th>
                <th className="px-3 py-2 font-medium">CC</th>
                <th className="px-3 py-2 font-medium">Interval</th>
                <th className="px-3 py-2 font-medium">Sprog</th>
                <th className="px-3 py-2 font-medium">Næste afsendelse</th>
                <th className="px-3 py-2 font-medium">Sidst sendt</th>
                <th className="sticky right-0 z-10 bg-slate-50 px-3 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <StatsCustomerRow
                  key={row.dealId}
                  {...row}
                  selected={selected.has(row.dealId)}
                  onToggleSelected={() => toggleOne(row.dealId)}
                />
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-slate-400">
                    Ingen live kunder endnu.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
