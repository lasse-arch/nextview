"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { TourCustomer } from "@/lib/actions/tour-ai";
import { assignDealTour } from "@/lib/actions/tours";
import { NewTour } from "./new-tour";

/*
 * All tours as one list - built for hundreds of customers: search, the flow
 * (Ikke startet → Startet → Gennemgang → Live) as filters and a bar on each
 * row, sorting, and a compact row per tour (like Finder or Mail) instead of
 * big cards. Customers who bought a tour that isn't in Arpo yet are rows too,
 * with "Opret tour".
 */

export type Stage = "ikke" | "startet" | "gennemgang" | "live";
const STAGES: [Stage, string][] = [
  ["ikke", "Ikke startet"],
  ["startet", "Startet"],
  ["gennemgang", "Gennemgang"],
  ["live", "Live"],
];
const STAGE_COLOR: Record<Stage, string> = { ikke: "#8e8e93", startet: "#0071e3", gennemgang: "#ff9500", live: "#34c759" };

export type TourRow = {
  slug: string;
  name: string;
  customer: string | null;
  dealId: string | null;
  image: string;
  logo: boolean;
  background: string;
  stage: Stage;
  /** Gennemgang: the customer (or we) approved it. */
  approved: boolean;
  published: boolean;
  updatedAt: string;
  visits: number;
  leads: number;
  /** A customer with no tour in Arpo yet (the row opens "Ny tour" for them). */
  newTour?: TourCustomer;
  /** A customer without a tour: "solgt", "optagelse 12. nov." or "filmet 3. nov.". */
  note?: string;
  /** The developer it's given to, and when it should be done (YYYY-MM-DD). */
  assignee?: string | null;
  /** A customer without a tour: the developer it's given to (the tour becomes theirs when it's made). */
  assigneeId?: string | null;
  deadline?: string | null;
};

type Developer = { id: string; name: string };

/** "Giv til udvikler" on a customer without a tour: who makes it, and by when. */
function GiveToDeveloper({ row, developers, onClose }: { row: TourRow; developers: Developer[]; onClose: () => void }) {
  const router = useRouter();
  const [who, setWho] = useState(row.assigneeId ?? "");
  const [deadline, setDeadline] = useState(row.deadline ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = (userId: string, date: string) =>
    start(async () => {
      const r = await assignDealTour(row.dealId!, userId || null, userId && date ? date : null);
      if (!r.ok) return setError(r.error);
      router.refresh();
      onClose();
    });
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div>
          <h2 className="text-[17px] font-semibold tracking-tight">Giv til udvikler</h2>
          <p className="text-[13px] leading-snug text-[#6e6e73]">{row.name} - udvikleren ser kunden i sin liste og opretter selv touren, når scanningen er klar.</p>
        </div>
        <label className="block space-y-1">
          <span className="block text-[13px] font-medium text-[#6e6e73]">Udvikler</span>
          <select value={who} onChange={(e) => setWho(e.target.value)} className="w-full rounded-[10px] border-0 bg-[#f2f2f7] px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-[#0071e3]">
            <option value="">Ingen - kun admin</option>
            {developers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        {developers.length === 0 && <p className="text-[12px] text-[#8e8e93]">Ingen har rollen Udvikler endnu - giv den under Brugere.</p>}
        {who && (
          <label className="block space-y-1">
            <span className="block text-[13px] font-medium text-[#6e6e73]">Deadline (valgfri)</span>
            <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="w-full rounded-[10px] border-0 bg-[#f2f2f7] px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-[#0071e3]" />
          </label>
        )}
        {error && <p className="text-[13px] text-[#ff3b30]">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-[15px] text-[#0071e3] hover:bg-[#0071e3]/5">
            Annullér
          </button>
          <button type="button" disabled={pending} onClick={() => save(who, deadline)} className="rounded-xl bg-[#0071e3] px-5 py-2 text-[15px] font-medium text-white disabled:opacity-50">
            {pending ? "Gemmer…" : "Gem"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** "Deadline 12. nov." - red when it has passed (and the tour isn't live), orange the last 3 days. */
function DeadlineChip({ deadline, live }: { deadline: string; live: boolean }) {
  const days = Math.round((Date.parse(`${deadline}T00:00:00Z`) - Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)) / 86_400_000);
  const color = live ? "#8e8e93" : days < 0 ? "#ff3b30" : days <= 3 ? "#ff9500" : "#6e6e73";
  const label = new Date(`${deadline}T12:00:00Z`).toLocaleDateString("da-DK", { day: "numeric", month: "short" });
  return <span style={{ color }}>Deadline {label}{!live && days < 0 ? " · overskredet" : ""}</span>;
}

type Filter = "alle" | Stage | "uden";
type Sort = "status" | "aendret" | "navn" | "resultat";

/** Where a tour is in the flow: four steps, filled up to its own. */
function FlowBar({ stage, note }: { stage: Stage; note?: string }) {
  const at = STAGES.findIndex(([s]) => s === stage);
  return (
    <span className="block">
      <span className="flex gap-[3px]">
        {STAGES.map(([s], i) => (
          <i key={s} className="h-[5px] flex-1 rounded-full" style={{ background: i <= at ? STAGE_COLOR[stage] : "#e5e5ea" }} />
        ))}
      </span>
      <span className="mt-1 block text-[12px] font-medium" style={{ color: STAGE_COLOR[stage] }}>
        {STAGES[at][1]}
        {note && <span className="font-normal text-[#8e8e93]"> · {note}</span>}
      </span>
    </span>
  );
}

const noteOf = (r: TourRow) =>
  r.newTour
    ? r.stage === "live"
      ? "tour på explore"
      : r.note
    : r.stage === "gennemgang" && r.approved
      ? "godkendt"
      : r.stage !== "live" && r.published
        ? "udgivet, ikke på Cloudflare endnu"
        : undefined;

const when = (iso: string) => new Date(iso).toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" });

/** `portal`: the customer opens in the customer portal as the customer sees it (for developers, who don't see deals) instead of the deal. */
/** `developers`: given to an admin, who can give customers without a tour to one of them. */
export function ToursList({ rows, tours, portal = false, developers }: { rows: TourRow[]; tours: { slug: string; name: string }[]; portal?: boolean; developers?: Developer[] }) {
  const [giving, setGiving] = useState<TourRow | null>(null);
  const customerHref = (dealId: string | null) => (portal ? `/kunde?som=${dealId}` : `/arpo/deals/${dealId}`);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("alle");
  const [sort, setSort] = useState<Sort>("status");
  /** "Opret tour" on a customer's row: the new-tour steps, with the customer picked. */
  const [making, setMaking] = useState<TourCustomer | null>(null);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { alle: rows.length, ikke: 0, startet: 0, gennemgang: 0, live: 0, uden: rows.filter((r) => !r.dealId).length };
    for (const r of rows) c[r.stage]++;
    return c;
  }, [rows]);
  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const order = (r: TourRow) => STAGES.findIndex(([s]) => s === r.stage);
    return rows
      .filter((r) => (filter === "alle" ? true : filter === "uden" ? !r.dealId : r.stage === filter))
      .filter((r) => words.every((w) => `${r.name} ${r.customer ?? ""} ${r.slug}`.toLowerCase().includes(w)))
      .sort((a, b) =>
        sort === "navn"
          ? a.name.localeCompare(b.name, "da")
          : sort === "resultat"
          ? b.leads - a.leads || b.visits - a.visits
          : sort === "status"
          ? order(a) - order(b) || b.updatedAt.localeCompare(a.updatedAt)
          : b.updatedAt.localeCompare(a.updatedAt)
      );
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
        <div className="flex max-w-full overflow-x-auto rounded-[9px] bg-[#e9e9eb] p-[2px] [scrollbar-width:none]">
          {([["alle", "Alle"], ...STAGES, ["uden", "Uden kunde"]] as [Filter, string][]).map(([f, text]) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`flex-none whitespace-nowrap rounded-[7px] px-3 py-[5px] text-[13px] font-medium transition ${filter === f ? "bg-white shadow-[0_3px_8px_rgba(0,0,0,.12)]" : "text-[#1d1d1f]/70 hover:text-[#1d1d1f]"}`}
            >
              {text} <span className="text-[#8e8e93]">{counts[f]}</span>
            </button>
          ))}
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="rounded-[10px] border-0 bg-[#f2f2f7] px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#0071e3]">
          <option value="status">Status (flowet)</option>
          <option value="aendret">Senest ændret</option>
          <option value="navn">Navn A-Å</option>
          <option value="resultat">Flest til booking</option>
        </select>
      </div>

      <div className="hidden grid-cols-[minmax(0,2.4fr)_minmax(0,1.6fr)_170px_150px_110px_90px] gap-4 border-b border-black/[.06] px-4 py-2 text-[12px] font-medium text-[#8e8e93] md:grid">
        <span>Tour</span>
        <span>Kunde</span>
        <span>Status</span>
        <span>Til booking · besøg (30 d)</span>
        <span>Ændret</span>
        <span />
      </div>
      <ul className="divide-y divide-black/[.05]">
        {shown.map((r) =>
          r.newTour ? (
            <li key={r.slug} className="group relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-2.5 hover:bg-[#f9f9fb] md:grid-cols-[minmax(0,2.4fr)_minmax(0,1.6fr)_170px_150px_110px_90px]">
              <span className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-16 flex-none items-center justify-center rounded-md border border-dashed border-[#c7c7cc] text-[15px] font-semibold text-[#8e8e93]">{r.name.slice(0, 1).toUpperCase()}</span>
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-medium text-[#6e6e73]">{r.name}</span>
                  <span className="block truncate text-[12px] text-[#8e8e93]">Ingen tour i Arpo endnu</span>
                  {(r.assignee || r.deadline) && (
                    <span className="block truncate text-[12px] text-[#6e6e73]">
                      {r.assignee && <span>Til {r.assignee}</span>}
                      {r.assignee && r.deadline && " · "}
                      {r.deadline && <DeadlineChip deadline={r.deadline} live={false} />}
                    </span>
                  )}
                </span>
              </span>
              <span className="hidden truncate text-[14px] md:block">
                <Link href={customerHref(r.dealId)} target={portal ? "_blank" : undefined} className="hover:text-[#0071e3] hover:underline">
                  {r.customer}
                </Link>
              </span>
              <span className="hidden md:block">
                <FlowBar stage={r.stage} note={noteOf(r)} />
              </span>
              <span className="hidden text-[14px] text-[#c7c7cc] md:block">-</span>
              <span className="hidden text-[13px] text-[#6e6e73] md:block">{r.updatedAt.startsWith("1970") ? "" : when(r.updatedAt)}</span>
              <span className="flex flex-col items-end gap-1 justify-self-end">
                <button type="button" onClick={() => setMaking(r.newTour!)} className="whitespace-nowrap rounded-full bg-[#0071e3] px-3 py-1 text-[13px] font-medium text-white hover:bg-[#0077ed]">
                  Opret tour
                </button>
                {developers && r.dealId && (
                  <button type="button" onClick={() => setGiving(r)} className="whitespace-nowrap px-1 text-[12px] font-medium text-[#0071e3] hover:underline">
                    {r.assignee ? "Skift udvikler" : "Giv til udvikler"}
                  </button>
                )}
              </span>
            </li>
          ) : (
          <li key={r.slug} className="group relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-2.5 hover:bg-[#f9f9fb] md:grid-cols-[minmax(0,2.4fr)_minmax(0,1.6fr)_170px_150px_110px_90px]">
            <Link href={`/arpo/tour-lab/${r.slug}/rediger`} className="flex min-w-0 items-center gap-3 after:absolute after:inset-0">
              <span className="relative h-10 w-16 flex-none overflow-hidden rounded-md" style={{ background: r.background }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.image} alt="" loading="lazy" className={r.logo ? "absolute inset-0 m-auto max-h-[55%] max-w-[75%] object-contain" : "h-full w-full object-cover"} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-medium">{r.name}</span>
                <span className="block truncate text-[12px] text-[#8e8e93] md:hidden">{r.customer ?? "Ingen kunde"}</span>
                {(r.assignee || r.deadline) && (
                  <span className="block truncate text-[12px] text-[#6e6e73]">
                    {r.assignee && <span>{r.assignee}</span>}
                    {r.assignee && r.deadline && " · "}
                    {r.deadline && <DeadlineChip deadline={r.deadline} live={r.stage === "live"} />}
                  </span>
                )}
              </span>
            </Link>
            <span className="hidden truncate text-[14px] md:block">
              {r.dealId ? (
                <Link href={customerHref(r.dealId)} target={portal ? "_blank" : undefined} className="relative z-10 hover:text-[#0071e3] hover:underline">
                  {r.customer}
                </Link>
              ) : (
                <span className="text-[#8e8e93]">Ingen kunde</span>
              )}
            </span>
            <span className="hidden md:block">
              <FlowBar stage={r.stage} note={noteOf(r)} />
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
            <a href={`/arpo/tour-lab/${r.slug}`} target="_blank" rel="noopener" className="relative z-10 justify-self-end rounded-full px-2.5 py-1 text-[13px] text-[#0071e3] opacity-0 hover:bg-[#0071e3]/10 group-hover:opacity-100">
              Åbn ↗
            </a>
          </li>
          )
        )}
      </ul>
      {shown.length === 0 && <p className="px-4 py-10 text-center text-[14px] text-[#8e8e93]">Ingen tours matcher.</p>}
      {making && <NewTour key={making.id} tours={tours} forDeal={making} onClose={() => setMaking(null)} />}
      {giving && developers && <GiveToDeveloper row={giving} developers={developers} onClose={() => setGiving(null)} />}
    </div>
  );
}
