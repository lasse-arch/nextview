"use client";

import { useState } from "react";

export function StatTile({
  label,
  value,
  sub,
  tone = "default",
  money,
  tooltipRows,
  badge,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "good" | "critical";
  money?: boolean;
  tooltipRows?: { label: string; value: string }[];
  badge?: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  const valueColor = tone === "good" ? "text-emerald-700" : tone === "critical" ? "text-red-700" : "text-slate-900";
  const hasTooltip = Boolean(tooltipRows && tooltipRows.length > 0);

  return (
    <div
      className="relative rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      onMouseEnter={() => hasTooltip && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-h-[28px] flex-1 text-[11px] font-semibold uppercase leading-tight tracking-wide text-slate-500">
          {label}
        </div>
        {badge}
      </div>
      <div className={`mt-1 text-2xl font-semibold ${valueColor} ${money ? "money" : ""}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-400">{sub}</div>}
      {hasTooltip && hovered && (
        <div className="pointer-events-none absolute left-0 top-full z-10 mt-1 min-w-[12rem] rounded-md bg-slate-900 px-3 py-2 text-xs font-medium text-white shadow-lg">
          {tooltipRows!.map((row) => (
            <p key={row.label} className="flex justify-between gap-4 whitespace-nowrap">
              <span className="text-slate-300">{row.label}</span>
              <span className="money">{row.value}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
