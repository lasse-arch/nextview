"use client";

import { useState } from "react";
import type { TourStats } from "@/lib/tour-stats";
import { Group } from "./ui";

/*
 * "Resultater": what the tour brings the customer - the number to tell them
 * ("sent 34 visitors on to booking"), and what visitors look at on the way.
 */

const pct = (n: number) => `${Math.round(n * 100)} %`;
const duration = (s: number) => (s < 60 ? `${s} sek` : `${Math.floor(s / 60)} min ${s % 60 ? `${s % 60} sek` : ""}`.trim());
const dayLabel = (iso: string) => new Date(iso).toLocaleDateString("da-DK", { day: "numeric", month: "short" });

function Tile({ value, label, hint }: { value: string; label: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-[#f5f5f7] px-3 py-2.5">
      <div className="text-[20px] font-semibold tabular-nums tracking-tight">{value}</div>
      <div className="text-[12px] text-[#6e6e73]">{label}</div>
      {hint && <div className="text-[11px] text-[#8e8e93]">{hint}</div>}
    </div>
  );
}

/** A ranked list with a thin bar for each row's share of the top one. */
function Ranked({ rows, empty }: { rows: { label: string; count: number }[]; empty: string }) {
  if (!rows.length) return <p className="text-[13px] text-[#8e8e93]">{empty}</p>;
  const max = rows[0].count;
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex justify-between gap-3 text-[13px]">
            <span className="truncate">{r.label}</span>
            <span className="tabular-nums text-[#6e6e73]">{r.count}</span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-[#f2f2f7]">
            <div className="h-full rounded-full bg-[#0071e3]" style={{ width: `${(r.count / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ResultsPanel({ stats }: { stats: TourStats }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...stats.perDay.map((d) => d.visits));
  const conversion = stats.visits ? stats.leads / stats.visits : 0;
  const shown = hover != null ? stats.perDay[hover] : null;

  if (!stats.visits)
    return (
      <Group>
        <p className="text-[15px] font-medium">Ingen besøg endnu</p>
        <p className="text-[13px] leading-snug text-[#6e6e73]">
          Touren tæller selv besøg, klik på booking og kontakt, og hvad folk kigger på. Tallene kommer her, så snart touren bliver brugt (besøg fra forhåndsvisningen her tæller ikke med).
        </p>
      </Group>
    );

  return (
    <>
      <Group>
        <div className="text-[13px] font-medium text-[#6e6e73]">Seneste {stats.days} dage</div>
        <div>
          <div className="text-[44px] font-semibold leading-none tracking-tight tabular-nums">{stats.leads}</div>
          <p className="mt-1 text-[15px] leading-snug">
            besøgende gik videre til booking eller kontakt
            <span className="text-[#6e6e73]"> - {pct(conversion)} af alle besøg.</span>
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Tile value={String(stats.visits)} label="Besøg" />
          <Tile value={pct(stats.visits ? stats.engaged / stats.visits : 0)} label="Gik på opdagelse" />
          <Tile value={duration(stats.medianSeconds)} label="Typisk besøg" />
        </div>
        <p className="text-[11px] leading-snug text-[#8e8e93]">
          Booking eller kontakt = et klik på en knap ud af touren (fx Book bord), et opkald eller en mail fra touren. Selve bookingen sker hos kunden og kan ikke ses herfra endnu. {pct(stats.mobileShare)} af besøgene er fra mobil.
        </p>
      </Group>

      <Group title="Besøg pr. dag">
        <div className="text-[12px] text-[#6e6e73]">{shown ? `${dayLabel(shown.day)}: ${shown.visits} besøg, ${shown.leads} til booking/kontakt` : "Hold musen over en dag"}</div>
        <div className="flex h-28 items-end gap-[2px]" onMouseLeave={() => setHover(null)}>
          {stats.perDay.map((d, i) => (
            <div key={d.day} className="flex h-full flex-1 items-end" onMouseEnter={() => setHover(i)}>
              <div
                className={`w-full rounded-t-[4px] transition-colors ${hover === i ? "bg-[#0058b0]" : "bg-[#0071e3]"}`}
                style={{ height: d.visits ? `${Math.max(4, (d.visits / max) * 100)}%` : 0 }}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-between border-t border-black/[.06] pt-1 text-[11px] text-[#8e8e93]">
          <span>{dayLabel(stats.perDay[0].day)}</span>
          <span>I dag</span>
        </div>
      </Group>

      <Group title="Det, folk gik videre til">
        <Ranked rows={stats.actions.map((a) => ({ ...a, label: a.label === "phone" ? "Ringede" : a.label === "email" ? "Skrev en mail" : a.label }))} empty="Ingen klik på booking eller kontakt endnu." />
      </Group>
      <Group title="Mest valgte steder">
        <Ranked rows={stats.places} empty="Ingen har valgt steder i menuen endnu." />
      </Group>
      <Group title="Kom fra">
        <Ranked rows={stats.sources} empty="-" />
      </Group>
    </>
  );
}
