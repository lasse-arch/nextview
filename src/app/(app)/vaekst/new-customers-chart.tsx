"use client";

import { useState } from "react";
import { formatDKK } from "@/lib/labels";

type MonthBar = { label: string; count: number; newMRR: number };

export function NewCustomersChart({
  bySignedDate,
  byLiveDate,
}: {
  bySignedDate: MonthBar[];
  byLiveDate: MonthBar[];
}) {
  const [basis, setBasis] = useState<"signed" | "live">("signed");
  const data = basis === "signed" ? bySignedDate : byLiveDate;
  const monthlyMax = Math.max(1, ...data.map((m) => m.count));

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-900">Nye kunder pr. måned (12 mdr)</h2>
        <div className="flex rounded-md border border-slate-300 text-xs">
          <button
            type="button"
            onClick={() => setBasis("signed")}
            className={`rounded-l-md px-2.5 py-1.5 font-medium ${
              basis === "signed" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            Solgt kunde (underskrevet)
          </button>
          <button
            type="button"
            onClick={() => setBasis("live")}
            className={`rounded-r-md px-2.5 py-1.5 font-medium ${
              basis === "live" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            Kunder live (afleveret)
          </button>
        </div>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {basis === "signed"
          ? "Talt efter datoen kontrakten blev underskrevet/solgt."
          : "Talt efter datoen kunden faktisk blev sat live/afleveret."}
      </p>
      <div className="mt-4 flex h-40 items-end gap-1.5">
        {data.map((m) => (
          <div key={m.label} className="flex flex-1 flex-col items-center gap-1" title={`${m.count} nye · ${formatDKK(m.newMRR)} ny MRR`}>
            <span className="text-[10px] font-medium text-slate-600">{m.count}</span>
            <div className="flex h-28 w-full items-end">
              <div
                className="w-full rounded-t-md bg-blue-600"
                style={{ height: `${Math.max(m.count > 0 ? 4 : 0, (m.count / monthlyMax) * 100)}%` }}
              />
            </div>
            <span className="text-[10px] text-slate-400 capitalize">{m.label.split(" ")[0]}</span>
          </div>
        ))}
      </div>
      <table className="mt-4 w-full text-xs">
        <thead className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="py-1 font-medium">Måned</th>
            <th className="py-1 text-right font-medium">Nye</th>
            <th className="py-1 text-right font-medium">Ny MRR</th>
          </tr>
        </thead>
        <tbody>
          {data.map((m) => (
            <tr key={m.label} className="border-t border-slate-100">
              <td className="py-1 capitalize text-slate-700">{m.label}</td>
              <td className="py-1 text-right text-slate-600">{m.count}</td>
              <td className="money py-1 text-right text-slate-600">{formatDKK(m.newMRR)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
