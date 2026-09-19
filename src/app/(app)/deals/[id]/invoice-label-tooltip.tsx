"use client";

import { useState } from "react";

/** Hover tooltip for an invoice's short label - shows the precise period and,
 * where available, the per-product breakdown, styled like the dashboard's
 * stat-tile tooltips (dark rounded box, label/value rows). */
export function InvoiceLabelTooltip({
  label,
  heading,
  rows,
}: {
  label: string;
  heading: string;
  rows: { label: string; value: string }[];
}) {
  const [hovered, setHovered] = useState(false);
  // A tooltip that would just repeat the label back (no product breakdown,
  // and the heading is the same text as the label - e.g. an establishment
  // line on a deal with no contractProducts snapshot to itemize) has nothing
  // to add, so skip the hover behavior entirely rather than show an empty-
  // looking popup.
  const hasExtraInfo = rows.length > 0 || heading !== label;

  if (!hasExtraInfo) {
    return <span className="text-slate-600">{label}</span>;
  }

  return (
    <span
      className="relative inline-block text-slate-600"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {label}
      {hovered && (
        <div className="pointer-events-none absolute left-0 top-full z-10 mt-1 min-w-[14rem] rounded-md bg-slate-900 px-3 py-2 text-xs font-medium text-white shadow-lg">
          <p className="whitespace-nowrap text-slate-300">{heading}</p>
          {rows.length > 0 && (
            <div className="mt-1 space-y-0.5 border-t border-slate-700 pt-1">
              {rows.map((row) => (
                <p key={row.label} className="flex justify-between gap-4 whitespace-nowrap">
                  <span className="text-slate-300">{row.label}</span>
                  <span className="money">{row.value}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </span>
  );
}
