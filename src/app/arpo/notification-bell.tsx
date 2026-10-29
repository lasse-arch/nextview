"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { openBell, type BellItem } from "@/lib/actions/notifications";

/*
 * The bell by Nyheder: a customer's feedback on a tour in review, an
 * approval … The badge is what's new since you last opened it; opening it
 * lists the latest and marks them seen.
 */

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "lige nu";
  if (m < 60) return `${m} min siden`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} t siden`;
  return new Date(iso).toLocaleDateString("da-DK", { day: "numeric", month: "short" });
};

export function NotificationBell({ unreadCount }: { unreadCount: number }) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(unreadCount);
  const [items, setItems] = useState<BellItem[] | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        title="Notifikationer"
        aria-expanded={open}
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next)
            openBell()
              .then((list) => {
                setItems(list);
                setUnread(0);
              })
              .catch(() => setItems([]));
        }}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900"
      >
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-50 w-[340px] max-w-[calc(100vw-24px)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="border-b border-slate-100 px-4 py-2.5 text-[13px] font-semibold text-slate-900">Notifikationer</div>
          <div className="max-h-[420px] overflow-y-auto">
            {items == null ? (
              <p className="px-4 py-6 text-center text-[13px] text-slate-400">Henter …</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-6 text-center text-[13px] text-slate-400">Ingen notifikationer endnu. Her kommer fx feedback fra kunder på tours til gennemgang.</p>
            ) : (
              items.map((n) => (
                <Link key={n.id} href={n.href} onClick={() => setOpen(false)} className={`flex gap-3 border-b border-slate-50 px-4 py-3 hover:bg-slate-50 ${n.unread ? "bg-blue-50/50" : ""}`}>
                  <span className={`mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-full text-[13px] ${n.kind === "approved" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                    {n.kind === "approved" ? "✓" : "✎"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium text-slate-900">
                      {n.title}
                      {n.count > 1 && <span className="ml-1 text-slate-400">· {n.count}</span>}
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-[12px] leading-snug text-slate-500">{n.text}</span>
                    <span className="mt-1 block text-[11px] text-slate-400">{ago(n.at)}</span>
                  </span>
                  {n.unread && <span className="mt-2 h-2 w-2 flex-none rounded-full bg-blue-500" />}
                </Link>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
