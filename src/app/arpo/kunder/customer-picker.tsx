"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PickerCustomer } from "@/lib/customer-cards";

/*
 * "Vælg kunde" - like Wolt's venue picker: type a few letters, and the
 * customers come up with their tour's photo, address and what they have.
 * ↑ ↓ and Enter work, and "/" opens it from anywhere on the page.
 */

const STATE: Record<PickerCustomer["state"], [string, string] | null> = {
  live: null,
  coming: ["Ikke live endnu", "bg-[#ff9500]/12 text-[#9a5b00]"],
  stopped: ["Stoppet", "bg-slate-100 text-slate-500"],
};

export function Thumb({ src, name, size = "md" }: { src: string | null; name: string; size?: "sm" | "md" | "lg" }) {
  const [ok, setOk] = useState(Boolean(src));
  const box = size === "lg" ? "h-14 w-20 rounded-xl" : size === "md" ? "h-11 w-11 rounded-lg" : "h-7 w-7 rounded-md";
  const initials = name
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <span className={`relative flex shrink-0 items-center justify-center overflow-hidden bg-gradient-to-br from-[#1d2a4d] to-[#3a5aa0] ${box}`}>
      {ok && src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" onError={() => setOk(false)} className="h-full w-full object-cover" />
      ) : (
        <span className={`font-semibold text-white/85 ${size === "sm" ? "text-[10px]" : "text-sm"}`}>{initials}</span>
      )}
    </span>
  );
}

export function CustomerPicker({ customers, current, variant = "crumb" }: { customers: PickerCustomer[]; current?: PickerCustomer | null; variant?: "crumb" | "hero" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [at, setAt] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);

  const hits = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const all = words.length ? customers.filter((c) => words.every((w) => `${c.name} ${c.address ?? ""} ${c.industry}`.toLowerCase().includes(w))) : customers;
    // Names that start with what's typed first.
    return words.length ? [...all].sort((a, b) => Number(!a.name.toLowerCase().startsWith(words[0])) - Number(!b.name.toLowerCase().startsWith(words[0]))) : all;
  }, [customers, q]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key === "/" && !open && !(t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable))) {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    };
    const click = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    window.addEventListener("keydown", key);
    window.addEventListener("mousedown", click);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("mousedown", click);
    };
  }, [open]);

  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-i="${at}"]`)?.scrollIntoView({ block: "nearest" });
  }, [at]);

  const go = (c: PickerCustomer) => {
    setOpen(false);
    setQ("");
    router.push(`/arpo/kunder/${c.id}`);
  };

  return (
    <div ref={box} className="relative">
      {variant === "hero" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-left text-[15px] text-slate-400 shadow-sm transition hover:border-slate-300 hover:shadow sm:max-w-xl"
        >
          <SearchIcon />
          <span className="flex-1">Find en kunde…</span>
          <kbd className="hidden rounded-md border border-slate-200 px-1.5 py-0.5 text-[11px] font-medium text-slate-400 sm:inline">/</kbd>
        </button>
      ) : (
        <button type="button" onClick={() => setOpen((o) => !o)} className="flex max-w-[70vw] items-center gap-2 rounded-lg px-2 py-1 text-sm font-medium text-slate-800 hover:bg-slate-100">
          {current ? <Thumb src={current.thumb} name={current.name} size="sm" /> : null}
          <span className="truncate">{current?.name ?? "Vælg kunde"}</span>
          <span className="text-slate-400">⌃⌄</span>
        </button>
      )}

      {open && (
        <div className={`absolute z-40 mt-2 w-[min(440px,calc(100vw-2rem))] overflow-hidden rounded-2xl bg-white shadow-[0_12px_40px_rgba(15,23,42,.18)] ring-1 ring-black/[.06] ${variant === "hero" ? "left-0 top-0 mt-0" : "left-0"}`}>
          <div className="flex items-center gap-2 border-b border-slate-100 px-3.5 py-3">
            <SearchIcon />
            <input
              autoFocus
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setAt(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setAt((i) => Math.min(hits.length - 1, i + 1));
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setAt((i) => Math.max(0, i - 1));
                }
                if (e.key === "Enter" && hits[at]) go(hits[at]);
              }}
              placeholder="Søg på navn, by eller branche"
              className="flex-1 bg-transparent text-[15px] text-slate-900 outline-none placeholder:text-slate-400"
            />
            {q && (
              <button type="button" onClick={() => setQ("")} aria-label="Ryd" className="flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100">
                ×
              </button>
            )}
          </div>
          <ul ref={list} className="max-h-[min(460px,60vh)] overflow-y-auto py-1.5">
            {hits.length === 0 && <li className="px-4 py-6 text-center text-sm text-slate-400">Ingen kunder matcher.</li>}
            {hits.slice(0, 80).map((c, i) => (
              <li key={c.id}>
                <button
                  type="button"
                  data-i={i}
                  onMouseEnter={() => setAt(i)}
                  onClick={() => go(c)}
                  className={`flex w-full items-center gap-3 px-3.5 py-2.5 text-left ${i === at ? "bg-slate-50" : ""}`}
                >
                  <Thumb src={c.thumb} name={c.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium text-slate-900">{c.name}</span>
                    <span className="block truncate text-xs text-slate-500">{c.address || c.industry}</span>
                    <span className="mt-1 flex flex-wrap gap-1">
                      {STATE[c.state] && <span className={`rounded px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide ${STATE[c.state]![1]}`}>{STATE[c.state]![0]}</span>}
                      {c.products.slice(0, 3).map((p) => (
                        <span key={p} className="rounded border border-slate-300 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                          {p.replace(/^Nextview360\s*/i, "")}
                        </span>
                      ))}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="9" cy="9" r="6" />
      <path d="m14 14 4 4" strokeLinecap="round" />
    </svg>
  );
}
