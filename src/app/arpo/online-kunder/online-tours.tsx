"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { INDUSTRIES } from "@/lib/industries";
import { setDealIndustry } from "@/lib/actions/industry";
import type { OnlineTour } from "@/lib/online-tours";

export type { OnlineTour };

/** The tours as cards like on nextview360.dk, filtered by industry and name - "Fremvis" opens one big, right here. */
export function OnlineTours({ tours, isAdmin }: { tours: OnlineTour[]; isAdmin: boolean }) {
  const [industry, setIndustry] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<{ t: OnlineTour; variant: number } | null>(null);

  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const t of tours) c.set(t.industry, (c.get(t.industry) ?? 0) + 1);
    return INDUSTRIES.filter((i) => c.has(i)).map((i) => [i, c.get(i)!] as const);
  }, [tours]);
  const shown = tours.filter((t) => (!industry || t.industry === industry) && (!q.trim() || `${t.name} ${t.customer} ${t.city ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Online kunder</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">Alle tours, der er online. Vælg en branche, og tryk &quot;Fremvis&quot; for at vise touren i stort format - lige til et møde.</p>
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Søg på navn eller by…" className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm sm:w-64" />
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        <Chip active={!industry} onClick={() => setIndustry(null)} label="Alle" count={tours.length} />
        {counts.map(([i, n]) => (
          <Chip key={i} active={industry === i} onClick={() => setIndustry(industry === i ? null : i)} label={i} count={n} />
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-400">Ingen tours matcher.</p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((t) => (
            <Card key={t.key} t={t} isAdmin={isAdmin} onOpen={(variant = 0) => setOpen({ t, variant })} />
          ))}
        </div>
      )}

      {open && <Viewer t={open.t} first={open.variant} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Chip({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${active ? "bg-[#1d2a4d] text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"}`}
    >
      {label} <span className={active ? "text-white/60" : "text-slate-400"}>{count}</span>
    </button>
  );
}

function Card({ t, isAdmin, onOpen }: { t: OnlineTour; isAdmin: boolean; onOpen: (variant?: number) => void }) {
  const [img, setImg] = useState(true);
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/80 transition hover:shadow-md">
      <button type="button" onClick={() => onOpen()} className="group relative aspect-[16/10] overflow-hidden bg-gradient-to-br from-[#1d2a4d] to-[#2c4a8a]" aria-label={`Fremvis ${t.name}`}>
        {img && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={t.thumb} alt="" loading="lazy" onError={() => setImg(false)} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
        )}
        {!img && <span className="absolute inset-0 flex items-center justify-center text-4xl font-semibold text-white/30">360°</span>}
        <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/25 group-hover:opacity-100">
          <span className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#1d2a4d] shadow">▶ Fremvis</span>
        </span>
      </button>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[.08em] text-[#2c4a8a]">{t.industry}</p>
          {t.ours && <span className="rounded-full bg-[#34c759]/12 px-2 py-0.5 text-[10px] font-semibold text-[#1d7a33]">Ny tour</span>}
        </div>
        <h3 className="text-[17px] font-semibold leading-snug text-slate-900">{t.name}</h3>
        {t.city && <p className="text-sm text-slate-500">{t.city}</p>}
        {t.variants.length > 1 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {t.variants.map((v, i) => (
              <button key={v.key} type="button" onClick={() => onOpen(i)} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200">
                {v.label}
              </button>
            ))}
          </div>
        )}
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
          <button type="button" onClick={() => onOpen()} className="rounded-full bg-[#1d2a4d] px-4 py-2 text-sm font-semibold text-white hover:bg-[#26365f]">
            Fremvis
          </button>
          <a href={t.url} target="_blank" rel="noopener" className="rounded-full px-3 py-2 text-sm font-medium text-[#0071e3] hover:bg-[#0071e3]/10">
            Ny fane ↗
          </a>
          {t.dealId && (
            <Link href={`/arpo/kunder/${t.dealId}`} className="ml-auto text-xs text-slate-400 hover:text-slate-600">
              Kunden
            </Link>
          )}
        </div>
        {/* Only admins can set the industry (the action checks it too). */}
        {isAdmin && t.dealId && (editing ? (
          <select
            autoFocus
            disabled={pending}
            value={t.industrySet ? t.industry : ""}
            onBlur={() => setEditing(false)}
            onChange={(e) => start(async () => {
              await setDealIndustry(t.dealId!, e.target.value);
              setEditing(false);
            })}
            className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600"
          >
            <option value="">Gæt ud fra navnet ({t.industry})</option>
            {INDUSTRIES.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        ) : (
          <button type="button" onClick={() => setEditing(true)} className="mt-1 self-start text-[11px] text-slate-400 hover:text-slate-600">
            Ret branche
          </button>
        ))}
      </div>
    </article>
  );
}

/** The tour big, over the page - like the tour windows on nextview360.dk. Esc closes it. */
function Viewer({ t, first, onClose }: { t: OnlineTour; first: number; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const [at, setAt] = useState(first);
  const url = t.variants[at]?.url ?? t.url;
  const full = url.startsWith("/") ? `${window.location.origin}${url}` : url;
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", key);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0b1220]/80 p-0 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-label={t.name} onClick={onClose}>
      <div className="mx-auto flex h-full w-full max-w-[1600px] flex-col overflow-hidden bg-white shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">{t.name}</p>
            <p className="truncate text-xs text-slate-500">
              {t.industry}
              {t.city ? ` · ${t.city}` : ""}
            </p>
          </div>
          {t.variants.length > 1 && (
            <div className="hidden rounded-full bg-slate-100 p-0.5 sm:flex">
              {t.variants.map((v, i) => (
                <button key={v.key} type="button" onClick={() => setAt(i)} className={`rounded-full px-3 py-1 text-[13px] font-medium ${i === at ? "bg-white shadow-sm" : "text-slate-600"}`}>
                  {v.label}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(full).then(() => (setCopied(true), setTimeout(() => setCopied(false), 1500)))}
            className="hidden rounded-full px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 sm:block"
          >
            {copied ? "Kopieret ✓" : "Kopiér link"}
          </button>
          <a href={full} target="_blank" rel="noopener" className="rounded-full px-3 py-1.5 text-sm font-medium text-[#0071e3] hover:bg-[#0071e3]/10">
            Ny fane ↗
          </a>
          <button type="button" onClick={onClose} aria-label="Luk" className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-lg text-slate-700 hover:bg-slate-200">
            ×
          </button>
        </div>
        <iframe key={url} src={url} title={t.name} className="h-full w-full flex-1 border-0" allow="fullscreen; xr-spatial-tracking; gyroscope; accelerometer; autoplay" allowFullScreen />
      </div>
    </div>
  );
}
