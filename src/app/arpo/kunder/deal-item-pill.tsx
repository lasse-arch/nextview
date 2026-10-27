"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Item = { id: string; productType: string; url: string | null; imageUrl: string | null };

/**
 * One product pill on the Live kunder list - a plain link/label pill as
 * before, except when the item has an uploaded photo (currently only
 * Visitkort): clicking it opens a large, full-screen preview instead of a
 * small hover popup, since the whole point of this page is showing things
 * to other people in a meeting - a hover state that vanishes the moment the
 * cursor moves isn't usable for that. Rendered via a portal straight to
 * <body> so it can't be clipped by the list's own `overflow-hidden`.
 */
export function DealItemPill({ item }: { item: Item }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  if (item.url) {
    return (
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
      >
        {item.productType} ↗
      </a>
    );
  }

  if (!item.imageUrl) {
    return (
      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
        {item.productType}
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500 hover:bg-slate-200"
      >
        {item.productType} 🔍
      </button>
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-8"
            onClick={() => setOpen(false)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.imageUrl}
              alt={item.productType}
              className="max-h-[90vh] max-w-[92vw] rounded-lg shadow-2xl"
            />
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Luk"
              className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-lg text-slate-700 shadow-lg hover:bg-white"
            >
              ✕
            </button>
          </div>,
          document.body
        )}
    </>
  );
}
