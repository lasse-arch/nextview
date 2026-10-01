"use client";

import { useState, useTransition } from "react";
import { sendCustomerReportsNowAction } from "@/lib/actions/customer-reports";
import { useToast } from "@/components/toast";
import { startDownloadJob } from "./download-job-store";
import { DownloadJobsCorner } from "./download-jobs-corner";
import { StatsCustomerRow, type StatsCustomerRowData } from "./stats-customer-row";

/**
 * Wraps the "Live kunder" table in one client component so checkbox
 * selection can be shared across every row (each StatsCustomerRow otherwise
 * manages only its own local state) - lets an admin queue several, or all,
 * visitor-stats reports in one "Send nu" click instead of one row at a time.
 */
export function LiveCustomersTable({ rows }: { rows: StatsCustomerRowData[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [sendingAll, startSendAll] = useTransition();
  const [downloading, startDownload] = useTransition();
  const showToast = useToast();

  const query = search.trim().toLowerCase();
  const visibleRows = query ? rows.filter((r) => r.name.toLowerCase().includes(query)) : rows;

  const allIds = visibleRows.map((r) => r.dealId);
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

  function downloadSelected() {
    const ids = [...selected];
    if (ids.length === 0) return;
    startDownload(async () => {
      const result = await startDownloadJob(ids, false, `${ids.length} valgte kunder`, showToast);
      if (!result.ok) showToast(result.error);
    });
  }

  /** Downloads every live customer that actually has an MP-Skin nummer, as
   * one merged PDF - a dedicated one-click action rather than requiring
   * "select all" first. Each deal now needs its own real Matterport
   * browser-scrape (much slower than the old bulk system), so this runs as a
   * background job (see download-job-store.ts) instead of a single blocking
   * request, with its progress shown in the corner widget. */
  function downloadAll() {
    const ids = rows.filter((r) => r.mpSkinId).map((r) => r.dealId);
    if (ids.length === 0) return;
    startDownload(async () => {
      const result = await startDownloadJob(ids, false, `Alle live kunder (${ids.length})`, showToast);
      if (!result.ok) showToast(result.error);
    });
  }

  const eligibleCount = rows.filter((r) => r.mpSkinId).length;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-500">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              aria-label="Vælg alle"
              disabled={allIds.length === 0}
            />
            {selected.size > 0 ? `${selected.size} valgt` : "Vælg alle"}
          </label>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Søg efter kunde…"
            className="w-48 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs"
          />
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            disabled={eligibleCount === 0 || downloading}
            onClick={downloadAll}
            title="Download én samlet PDF med alle live kunder der har et MP-Skin nummer"
            className="whitespace-nowrap rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            {downloading ? "Henter…" : `Download alle (${eligibleCount})`}
          </button>
          <button
            type="button"
            disabled={selected.size === 0 || downloading}
            onClick={downloadSelected}
            className="whitespace-nowrap rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            {downloading ? "Henter…" : `Download PDF (${selected.size})`}
          </button>
          <button
            type="button"
            disabled={selected.size === 0 || sendingAll}
            onClick={sendSelected}
            className="whitespace-nowrap rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-40"
          >
            {sendingAll ? "Sender…" : `Send nu (${selected.size})`}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {visibleRows.map((row) => (
          <StatsCustomerRow
            key={row.dealId}
            {...row}
            selected={selected.has(row.dealId)}
            onToggleSelected={() => toggleOne(row.dealId)}
          />
        ))}
        {rows.length === 0 && (
          <p className="rounded-md border border-slate-100 px-3 py-6 text-center text-slate-400">
            Ingen live kunder endnu.
          </p>
        )}
        {rows.length > 0 && visibleRows.length === 0 && (
          <p className="rounded-md border border-slate-100 px-3 py-6 text-center text-slate-400">
            Ingen kunder matcher &quot;{search}&quot;.
          </p>
        )}
      </div>

      <DownloadJobsCorner />
    </div>
  );
}
