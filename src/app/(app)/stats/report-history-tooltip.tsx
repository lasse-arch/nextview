"use client";

import { useState } from "react";
import { formatDate } from "@/lib/labels";

export type ReportHistoryEntry = {
  sentAt: string;
  method: "MANUAL" | "AUTOMATIC";
  status: "PENDING" | "SENT" | "FAILED";
};

/** Hover tooltip listing earlier report sends for a customer, styled like the
 * dashboard's other dark-box tooltips. Only rendered when there's more than
 * one send to actually show history for. */
export function ReportHistoryTooltip({
  label,
  history,
}: {
  label: React.ReactNode;
  history: ReportHistoryEntry[];
}) {
  const [hovered, setHovered] = useState(false);
  const earlier = history.slice(1);

  if (earlier.length === 0) return <>{label}</>;

  return (
    <span
      className="relative inline-block"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {label}
      {hovered && (
        <div className="pointer-events-none absolute left-0 top-full z-10 mt-1 min-w-[13rem] rounded-md bg-slate-900 px-3 py-2 text-xs font-medium text-white shadow-lg">
          <p className="whitespace-nowrap text-slate-300">Tidligere afsendelser</p>
          <div className="mt-1 space-y-0.5 border-t border-slate-700 pt-1">
            {earlier.map((entry, i) => (
              <p key={i} className="flex justify-between gap-4 whitespace-nowrap">
                <span>{formatDate(entry.sentAt)}</span>
                <span className={entry.status === "FAILED" ? "text-red-400" : "text-slate-300"}>
                  {entry.status === "FAILED" ? "Fejlede" : entry.method === "AUTOMATIC" ? "Automatisk" : "Manuelt"}
                </span>
              </p>
            ))}
          </div>
        </div>
      )}
    </span>
  );
}
