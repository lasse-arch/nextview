"use client";

import { useState } from "react";

type Item = { id: string; productType: string; url: string | null; imageUrl: string | null };

/**
 * One product pill on the Live kunder list - a plain link/label pill as
 * before, except when the item has an uploaded photo (currently only
 * Visitkort), in which case hovering shows it as a preview.
 */
export function DealItemPill({ item }: { item: Item }) {
  const [hovered, setHovered] = useState(false);

  const pill = item.url ? (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
    >
      {item.productType} ↗
    </a>
  ) : (
    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
      {item.productType}
    </span>
  );

  if (!item.imageUrl) return pill;

  return (
    <span
      className="relative inline-block"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {pill}
      {hovered && (
        <div className="pointer-events-none absolute left-1/2 top-full z-10 mt-1.5 -translate-x-1/2 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.imageUrl} alt={item.productType} className="max-h-40 max-w-[220px] rounded-md object-contain" />
        </div>
      )}
    </span>
  );
}
