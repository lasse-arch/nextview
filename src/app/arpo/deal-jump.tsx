"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { findDeals, type DealHit } from "@/lib/actions/deal-search";

/**
 * "Søg deal" at the top of Arpo: type a few letters (name, person, e-mail,
 * phone, CVR) and jump straight to the deal - no going via Deals. ↑/↓ and
 * Enter work, Esc closes, and ⌘K / Ctrl+K puts the cursor in it from anywhere.
 */
export function DealJump() {
  const router = useRouter();
  const box = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<DealHit[]>([]);
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(0);
  const [looking, setLooking] = useState(false);
  const asked = useRef(0);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        box.current?.focus();
        box.current?.select();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  function search(value: string) {
    setQ(value);
    setOpen(true);
    setAt(0);
    const n = ++asked.current;
    if (value.trim().length < 2) return setHits([]);
    setLooking(true);
    window.setTimeout(() => {
      if (n !== asked.current) return;
      findDeals(value)
        .then((r) => {
          if (n !== asked.current) return;
          setHits(r);
          setLooking(false);
        })
        .catch(() => setLooking(false));
    }, 180);
  }

  function go(h: DealHit) {
    setOpen(false);
    setQ("");
    setHits([]);
    box.current?.blur();
    router.push(`/arpo/deals/${h.id}`);
  }

  return (
    <div className="relative mr-auto w-full max-w-sm">
      <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        ref={box}
        value={q}
        onChange={(e) => search(e.target.value)}
        onFocus={() => q && setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setAt((a) => Math.min(a + 1, hits.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setAt((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && hits[at]) {
            e.preventDefault();
            go(hits[at]);
          } else if (e.key === "Escape") {
            setOpen(false);
            box.current?.blur();
          }
        }}
        placeholder="Søg deal …"
        aria-label="Søg deal"
        className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-12 text-[13px] text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
      />
      <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-slate-200 px-1.5 text-[10px] text-slate-400 sm:block">⌘K</kbd>
      {open && q.trim().length >= 2 && (
        <ul className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          {hits.length ? (
            hits.map((h, i) => (
              <li key={h.id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setAt(i)}
                  onClick={() => go(h)}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left ${i === at ? "bg-slate-100" : ""}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium text-slate-900">{h.name}</span>
                    {h.sub && <span className="block truncate text-[11px] text-slate-500">{h.sub}</span>}
                  </span>
                  <span className="flex-none rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">{h.stage}</span>
                </button>
              </li>
            ))
          ) : (
            <li className="px-3 py-2 text-[12px] text-slate-500">{looking ? "Søger …" : "Ingen deals fundet."}</li>
          )}
        </ul>
      )}
    </div>
  );
}
