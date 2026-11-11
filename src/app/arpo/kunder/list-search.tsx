"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/*
 * Kunder: the search over the list below - typing filters the rows of this
 * tab (name, town, industry, products), and says how many match in the other
 * tabs. "/" puts the cursor in it from anywhere on the page.
 */
export function ListSearch({ listId, others, initial = "", initialShown = null }: { listId: string; others: { key: string; label: string; href: string; texts: string[] }[]; /** The search brought along from another tab (?q=), already applied to the rows. */ initial?: string; initialShown?: number | null }) {
  const [q, setQ] = useState(initial);
  const [shown, setShown] = useState<number | null>(initialShown);
  const input = useRef<HTMLInputElement>(null);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hit = (text: string) => words.every((w) => text.includes(w));

  // The rows are drawn on the server: hidden here when they don't match - as the visitor types.
  function search(next: string) {
    setQ(next);
    const ws = next.toLowerCase().split(/\s+/).filter(Boolean);
    let n = 0;
    document.querySelectorAll<HTMLElement>(`#${listId} > li[data-q]`).forEach((li) => {
      const ok = !ws.length || ws.every((w) => (li.dataset.q ?? "").includes(w));
      li.hidden = !ok;
      if (ok) n++;
    });
    const empty = document.querySelector<HTMLElement>(`#${listId} > li[data-tom]`);
    if (empty) empty.hidden = !(ws.length && n === 0);
    setShown(ws.length ? n : null);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== "/" || (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))) return;
      e.preventDefault();
      input.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const elsewhere = words.length ? others.map((o) => ({ ...o, n: o.texts.filter(hit).length })).filter((o) => o.n > 0) : [];
  return (
    <div className="space-y-2">
      <label className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition focus-within:border-slate-400 sm:max-w-xl">
        <svg viewBox="0 0 20 20" className="h-4 w-4 flex-none text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="9" cy="9" r="6" />
          <path d="m14 14 4 4" strokeLinecap="round" />
        </svg>
        <input ref={input} value={q} onChange={(e) => search(e.target.value)} onKeyDown={(e) => e.key === "Escape" && search("")} placeholder="Søg i kunderne nedenfor…" aria-label="Søg i kunderne" className="min-w-0 flex-1 bg-transparent text-[15px] text-slate-900 outline-none placeholder:text-slate-400" />
        {q ? (
          <button type="button" onClick={() => search("")} aria-label="Ryd søgningen" className="text-slate-400 hover:text-slate-700">
            ×
          </button>
        ) : (
          <kbd className="hidden rounded-md border border-slate-200 px-1.5 py-0.5 text-[11px] font-medium text-slate-400 sm:inline">/</kbd>
        )}
      </label>
      {shown != null && (
        <p className="px-1 text-[13px] text-slate-500">
          {shown} {shown === 1 ? "kunde" : "kunder"} her
          {elsewhere.map((o) => (
            <span key={o.key}>
              {" · "}
              <Link href={`${o.href}${o.href.includes("?") ? "&" : "?"}q=${encodeURIComponent(q)}`} className="font-medium text-[#0071e3] hover:underline">
                {o.n} i {o.label}
              </Link>
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
