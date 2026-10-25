"use client";

import { useState, useTransition } from "react";
import { setTourHourlyCost } from "@/lib/actions/tours";
import { Field, Group, input } from "./ui";

/*
 * "Tid og pris": what the tour has cost us - filming (filled in on the deal),
 * editing in Arpo (measured per person) and Claude - against what the
 * customer pays, so we can see whether we make money on each customer.
 */

export type TourEconomy = {
  hourlyCost: number;
  filmingMinutes: number | null;
  work: { name: string; seconds: number }[];
  ai: { calls: number; usd: number };
  deal: { id: string; monthly: number | null; months: number | null; establishment: number | null } | null;
};

/** Dollars to kroner - a rough rate, it's an estimate. */
const DKK_PER_USD = 6.9;
const kr = (n: number) => `${Math.round(n).toLocaleString("da-DK")} kr.`;
const hours = (s: number) => `${(s / 3600).toLocaleString("da-DK", { maximumFractionDigits: 1 })} t`;

export function EconomyPanel({ economy }: { economy: TourEconomy }) {
  const [rate, setRate] = useState(String(economy.hourlyCost));
  const [pending, start] = useTransition();
  const hourly = Number(rate) || 0;
  const editSeconds = economy.work.reduce((sum, w) => sum + w.seconds, 0);
  const filmSeconds = (economy.filmingMinutes ?? 0) * 60;
  const claudeKr = economy.ai.usd * DKK_PER_USD;
  const cost = ((editSeconds + filmSeconds) / 3600) * hourly + claudeKr;
  const d = economy.deal;
  const revenue = d ? (d.establishment ?? 0) + (d.monthly ?? 0) * (d.months ?? 0) : null;
  const result = revenue != null ? revenue - cost : null;

  return (
    <>
      <Group>
        <div className="text-[13px] font-medium text-[#6e6e73]">Brugt på touren</div>
        <div className="text-[40px] font-semibold leading-none tracking-tight tabular-nums">{kr(cost)}</div>
        <p className="text-[13px] text-[#6e6e73]">
          {hours(editSeconds + filmSeconds)} à {kr(hourly)} + Claude {kr(claudeKr)}
        </p>
        {result != null && (
          <div className={`rounded-xl px-3 py-2.5 ${result >= 0 ? "bg-[#34c759]/12" : "bg-[#ff3b30]/10"}`}>
            <div className={`text-[20px] font-semibold tabular-nums ${result >= 0 ? "text-[#248a3d]" : "text-[#d70015]"}`}>
              {result >= 0 ? "+" : ""}
              {kr(result)}
            </div>
            <div className="text-[12px] text-[#6e6e73]">
              tilbage af kontrakten på {kr(revenue!)} ({d!.establishment ? `etablering ${kr(d!.establishment)} + ` : ""}
              {d!.monthly ? `${kr(d!.monthly)}/md. × ${d!.months ?? 0} md.` : "ingen månedlig pris"})
            </div>
          </div>
        )}
        {!d && <p className="text-[12px] text-[#8e8e93]">Knyt touren til en kunde (under Generelt) for at se, om vi tjener penge på den.</p>}
      </Group>

      <Group title="Tid">
        <div className="flex justify-between text-[14px]">
          <span>Filming</span>
          {economy.filmingMinutes != null ? (
            <span className="tabular-nums">{hours(filmSeconds)}</span>
          ) : d ? (
            <a href={`/deals/${d.id}`} className="text-[#ff9500] hover:underline">
              Mangler - udfyld på dealen
            </a>
          ) : (
            <span className="text-[#8e8e93]">-</span>
          )}
        </div>
        {economy.work.map((w) => (
          <div key={w.name} className="flex justify-between text-[14px]">
            <span>Redigering · {w.name}</span>
            <span className="tabular-nums">{hours(w.seconds)}</span>
          </div>
        ))}
        {!economy.work.length && <p className="text-[13px] text-[#8e8e93]">Ingen redigering målt endnu.</p>}
        <p className="text-[11px] leading-snug text-[#8e8e93]">Redigering måles, mens nogen arbejder i editoren (siden er åben, og der er aktivitet inden for 2 minutter).</p>
      </Group>

      <Group title="Claude">
        <div className="flex justify-between text-[14px]">
          <span>
            {economy.ai.calls} {economy.ai.calls === 1 ? "kald" : "kald"}
          </span>
          <span className="tabular-nums">
            ${economy.ai.usd.toFixed(2)} ≈ {kr(claudeKr)}
          </span>
        </div>
      </Group>

      <Group title="Timepris">
        <Field title="Hvad en time koster os (kr.)" hint="Løn og alt andet pr. time - bruges til alle tours.">
          <div className="flex gap-2">
            <input className={input} inputMode="numeric" value={rate} onChange={(e) => setRate(e.target.value.replace(/[^\d]/g, ""))} />
            <button type="button" disabled={pending || Number(rate) === economy.hourlyCost} className="flex-none rounded-xl bg-[#0071e3] px-4 text-[14px] font-medium text-white disabled:opacity-40" onClick={() => start(async () => void (await setTourHourlyCost(Number(rate))))}>
              Gem
            </button>
          </div>
        </Field>
      </Group>
    </>
  );
}
