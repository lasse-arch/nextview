"use client";

import { useState } from "react";
import { formatDKK } from "@/lib/labels";
import type { MonthBar } from "@/lib/dashboard-data";

export function MonthlySalesChart({ salesData, establishmentData }: { salesData: MonthBar[]; establishmentData: MonthBar[] }) {
  const [showEstablishment, setShowEstablishment] = useState(false);
  const data = showEstablishment ? establishmentData : salesData;
  const max = Math.max(1, ...data.map((m) => m.value));

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="min-w-0 truncate text-sm font-semibold text-slate-900">
          {showEstablishment ? "Etablering" : "Salg"}, seneste 3 måneder
        </h2>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className={showEstablishment ? "text-slate-400" : "font-medium text-slate-700"}>Salg</span>
          <button
            type="button"
            role="switch"
            aria-checked={showEstablishment}
            onClick={() => setShowEstablishment((v) => !v)}
            className={`relative inline-block h-5 w-9 shrink-0 grow-0 rounded-full transition-colors ${
              showEstablishment ? "bg-blue-600" : "bg-slate-200"
            }`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                showEstablishment ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </button>
          <span className={`shrink-0 ${showEstablishment ? "font-medium text-slate-700" : "text-slate-400"}`}>
            Etablering
          </span>
        </div>
      </div>
      <div className="mt-4 flex h-32 items-end gap-3">
        {data.map((m) => (
          <div key={m.label} className="flex flex-1 flex-col items-center gap-1" title={formatDKK(m.value)}>
            <span className="money text-[11px] font-medium text-slate-600">{formatDKK(m.value)}</span>
            <div className="flex h-24 w-full items-end">
              <div
                className="w-full rounded-t-md bg-blue-600"
                style={{ height: `${Math.max(m.value > 0 ? 4 : 0, (m.value / max) * 100)}%` }}
              />
            </div>
            <span className="text-[11px] text-slate-400 capitalize">{m.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
