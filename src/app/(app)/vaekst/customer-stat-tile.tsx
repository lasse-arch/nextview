"use client";

import { useState } from "react";
import Link from "next/link";
import { stageLabels } from "@/lib/labels";

export type StatCustomer = { id: string; name: string; stage: string };

/**
 * Same stat tile as the plain one elsewhere on this page, but with a
 * "Rapport" toggle that expands into the actual list of customers behind
 * the number - a count on its own ("27 aktive kunder") doesn't say who
 * they are, and this is the one page admins actually want that answer on.
 */
export function CustomerStatTile({
  label,
  value,
  sub,
  customers,
}: {
  label: string;
  value: string;
  sub?: string;
  customers: StatCustomer[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="shrink-0 text-[11px] font-medium text-blue-600 hover:underline"
        >
          {open ? "Skjul" : "Rapport"}
        </button>
      </div>
      <div className="mt-1 text-xl font-semibold text-slate-900">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-400">{sub}</div>}

      {open && (
        <div className="mt-3 max-h-64 space-y-1 overflow-y-auto border-t border-slate-100 pt-2">
          {customers.map((c) => (
            <Link
              key={c.id}
              href={`/deals/${c.id}`}
              className="flex items-center justify-between gap-2 rounded px-1 py-1 text-sm text-slate-700 hover:bg-slate-50 hover:underline"
            >
              <span className="truncate">{c.name}</span>
              <span className="shrink-0 text-xs font-normal text-slate-400 no-underline">
                {stageLabels[c.stage] ?? c.stage}
              </span>
            </Link>
          ))}
          {customers.length === 0 && <p className="px-1 py-1 text-sm text-slate-400">Ingen kunder.</p>}
        </div>
      )}
    </div>
  );
}
