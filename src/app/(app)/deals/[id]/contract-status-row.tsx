"use client";

import { useState } from "react";
import { formatDate } from "@/lib/labels";

export function ContractStatusRow({
  label,
  sentAt,
  viewedAt,
  signedAt,
}: {
  label: string;
  sentAt: Date | null;
  viewedAt: Date | null;
  signedAt: Date | null;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="relative flex justify-between"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <dt className="text-slate-500">Status</dt>
      <dd className="cursor-default font-medium text-slate-800">{label}</dd>
      {hovered && (
        <div className="pointer-events-none absolute right-0 top-full z-10 mt-1 whitespace-nowrap rounded-md bg-slate-900 px-3 py-2 text-xs font-medium text-white shadow-lg">
          <p>Sendt: {sentAt ? formatDate(sentAt) : "–"}</p>
          <p>Kunden åbnede: {viewedAt ? formatDate(viewedAt) : "Endnu ikke åbnet"}</p>
          <p>Kunden underskrev: {signedAt ? formatDate(signedAt) : "Endnu ikke underskrevet"}</p>
        </div>
      )}
    </div>
  );
}
