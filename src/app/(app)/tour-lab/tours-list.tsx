"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

/*
 * All tours as one list - built for hundreds of customers: search, a few
 * filters, sorting, and a compact row per tour (like Finder or Mail) instead
 * of big cards.
 */

export type TourRow = {
  slug: string;
  name: string;
  customer: string | null;
  dealId: string | null;
  image: string;
  logo: boolean;
  background: string;
  published: boolean;
  updatedAt: string;
  visits: number;
  leads: number;
};

type Filter = "alle" | "udgivet" | "kladde" | "uden";
type Sort = "aendret" | "navn" | "resultat";

const when = (iso: string) => new Date(iso).toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" });

export function ToursList({ rows }: { rows: TourRow[] }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("alle");
  const [sort, setSort] = useState<Sort>("aendret");

  const counts = useMemo(
    () => ({ alle: rows.length, udgivet: rows.filter((r) => r.published).length, kladde: rows.filter((r) => !r.published).length, uden: rows.filter((r) => !r.dealId).length }),
    [rows]
  );
  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return rows
      .filter((r) => (filter === "udgivet" ? r.published : filter === "kladde" ? !r.published : filter === "uden" ? !r.dealId : true))
      .filter((r) => words.every((w) => `${r.name} ${r.customer ?? ""} ${r.slug}`.toLowerCase().includes(w)))
      .sort((a, b) => (sort === "navn" ? a.name.localeCompare(b.name, "da") : sort === "resultat" ? b.leads - a.leads || b.visits - a.visits : b.updatedAt.localeCompare(a.updatedAt)));
  }, [rows, q, filter, sort]);

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-[0_1px_3px_rgba(0,0,0,.06)] ring-1 ring-black/[.05]">
      <div className="flex flex-wrap items-center gap-3 border-b border-black/[.06] px-4 py-3">
        <div className="relative min-w-[220px] flex-1">
          <svg viewBox="0 0 24 24" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8e8e93]" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Søg tour eller kunde"
            className="w-full rounded-[10px] border-0 bg-[#f2f2f7] py-2 pl-9 pr-3 text-[15px] placeholder:text-[#8e8e93] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
          />
        </div>
        <div className="flex rounded-[9px] bg-[#e9e9eb] p-[2px]">
          {(
            [
              ["alle", "Alle"],
              ["udgivet", "Udgivet"],
              ["kladde", "Kladder"],
              ["uden", "Uden kunde"],
            ] as [Filter, string][]
          ).map(([f, text]) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-[7px] px-3 py-[5px] text-[13px] font-medium transition ${filter === f ? "bg-white shadow-[0_3px_8px_rgba(0,0,0,.12)]" : "text-[#1d1d1f]/70 hover:text-[#1d1d1f]"}`}
            >
              {text} <span className="text-[#8e8e93]">{counts[f]}</span>
            </button>
          ))}
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="rounded-[10px] border-0 bg-[#f2f2f7] px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#0071e3]">
          <option value="aendret">Senest ændret</option>
          <option value="navn">Navn A-Å</option>
          <option value="resultat">Flest til booking</option>
        </select>
      </div>

      <div className="hidden grid-cols-[minmax(0,2.4fr)_minmax(0,1.6fr)_110px_150px_110px_70px] gap-4 border-b border-black/[.06] px-4 py-2 text-[12px] font-medium text-[#8e8e93] md:grid">
        <span>Tour</span>
        <span>Kunde</span>
        <span>Status</span>
        <span>Til booking · besøg (30 d)</span>
        <span>Ændret</span>
        <span />
      </div>
      <ul className="divide-y divide-black/[.05]">
        {shown.map((r) => (
          <li key={r.slug} className="group relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-2.5 hover:bg-[#f9f9fb] md:grid-cols-[minmax(0,2.4fr)_minmax(0,1.6fr)_110px_150px_110px_70px]">
            <Link href={`/tour-lab/${r.slug}/rediger`} className="flex min-w-0 items-center gap-3 after:absolute after:inset-0">
              <span className="relative h-10 w-16 flex-none overflow-hidden rounded-md" style={{ background: r.background }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.image} alt="" loading="lazy" className={r.logo ? "absolute inset-0 m-auto max-h-[55%] max-w-[75%] object-contain" : "h-full w-full object-cover"} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-medium">{r.name}</span>
                <span className="block truncate text-[12px] text-[#8e8e93] md:hidden">{r.customer ?? "Ingen kunde"}</span>
              </span>
            </Link>
            <span className="hidden truncate text-[14px] md:block">
              {r.dealId ? (
                <Link href={`/deals/${r.dealId}`} className="relative z-10 hover:text-[#0071e3] hover:underline">
                  {r.customer}
                </Link>
              ) : (
                <span className="text-[#8e8e93]">Ingen kunde</span>
              )}
            </span>
            <span className="hidden md:block">
              <span className={`rounded-full px-2 py-0.5 text-[12px] font-medium ${r.published ? "bg-[#34c759]/15 text-[#248a3d]" : "bg-black/[.05] text-[#6e6e73]"}`}>{r.published ? "Udgivet" : "Kladde"}</span>
            </span>
            <span className="hidden text-[14px] tabular-nums md:block">
              {r.visits ? (
                <>
                  <b className="font-semibold">{r.leads}</b> <span className="text-[#8e8e93]">· {r.visits}</span>
                </>
              ) : (
                <span className="text-[#c7c7cc]">-</span>
              )}
            </span>
            <span className="hidden text-[13px] text-[#6e6e73] md:block">{when(r.updatedAt)}</span>
            <a href={`/tour-lab/${r.slug}`} target="_blank" rel="noopener" className="relative z-10 justify-self-end rounded-full px-2.5 py-1 text-[13px] text-[#0071e3] opacity-0 hover:bg-[#0071e3]/10 group-hover:opacity-100">
              Åbn ↗
            </a>
          </li>
        ))}
      </ul>
      {shown.length === 0 && <p className="px-4 py-10 text-center text-[14px] text-[#8e8e93]">Ingen tours matcher.</p>}
    </div>
  );
}
