"use client";

import { useState } from "react";
import { formatDateTime, contractEventLabels } from "@/lib/labels";

export function ContractStatusRow({
  label,
  events,
}: {
  label: string;
  events: { type: string; occurredAt: Date }[];
}) {
  const [hovered, setHovered] = useState(false);
  const hasEvents = events.length > 0;

  return (
    <div
      className="relative flex justify-between"
      onMouseEnter={() => hasEvents && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <dt className="text-slate-500">Status</dt>
      <dd className="cursor-default font-medium text-slate-800">{label}</dd>
      {hasEvents && hovered && (
        <div className="pointer-events-none absolute right-0 top-full z-10 mt-1 whitespace-nowrap rounded-md bg-slate-900 px-3 py-2 text-xs font-medium text-white shadow-lg">
          {events.map((e, i) => (
            <p key={i} className="flex justify-between gap-4">
              <span className="text-slate-300">{contractEventLabels[e.type] ?? e.type}</span>
              <span>{formatDateTime(e.occurredAt)}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
