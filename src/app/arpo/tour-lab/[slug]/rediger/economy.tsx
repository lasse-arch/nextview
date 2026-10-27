"use client";

import { Group } from "./ui";

/*
 * "Tid og pris": what the customer's tour has taken - hours (filming, filled
 * in on the deal, and editing in Arpo, measured per person) and what Claude
 * cost. Nothing else.
 */

export type TourEconomy = {
  filmingMinutes: number | null;
  work: { name: string; seconds: number }[];
  ai: { calls: number; usd: number };
  dealId: string | null;
};

/** Dollars to kroner - a rough rate, it's an estimate. */
const DKK_PER_USD = 6.9;
const hours = (s: number) => `${(s / 3600).toLocaleString("da-DK", { maximumFractionDigits: 1 })} t`;

export function EconomyPanel({ economy }: { economy: TourEconomy }) {
  const editSeconds = economy.work.reduce((sum, w) => sum + w.seconds, 0);
  const filmSeconds = (economy.filmingMinutes ?? 0) * 60;
  return (
    <>
      <Group>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[13px] font-medium text-[#6e6e73]">Timer på kunden</div>
            <div className="text-[36px] font-semibold leading-tight tracking-tight tabular-nums">{hours(editSeconds + filmSeconds)}</div>
            <div className="text-[12px] text-[#8e8e93]">filming + redigering</div>
          </div>
          <div>
            <div className="text-[13px] font-medium text-[#6e6e73]">nextviewAI</div>
            <div className="text-[36px] font-semibold leading-tight tracking-tight tabular-nums">{Math.round(economy.ai.usd * DKK_PER_USD).toLocaleString("da-DK")} kr.</div>
            <div className="text-[12px] text-[#8e8e93]">
              ${economy.ai.usd.toFixed(2)} · {economy.ai.calls} kald
            </div>
          </div>
        </div>
      </Group>

      <Group title="Timer">
        <div className="flex justify-between text-[14px]">
          <span>Filming</span>
          {economy.filmingMinutes != null ? (
            <span className="tabular-nums">{hours(filmSeconds)}</span>
          ) : economy.dealId ? (
            <a href={`/arpo/deals/${economy.dealId}`} className="text-[#ff9500] hover:underline">
              Mangler - udfyld på dealen
            </a>
          ) : (
            <span className="text-[#8e8e93]">Knyt touren til en kunde</span>
          )}
        </div>
        {economy.work.map((w) => (
          <div key={w.name} className="flex justify-between text-[14px]">
            <span>Redigering · {w.name}</span>
            <span className="tabular-nums">{hours(w.seconds)}</span>
          </div>
        ))}
        {!economy.work.length && <p className="text-[13px] text-[#8e8e93]">Ingen redigering målt endnu.</p>}
        <p className="text-[11px] leading-snug text-[#8e8e93]">Redigering måles, mens nogen arbejder i editoren (siden er åben, og der er aktivitet inden for 2 minutter). Filmtiden udfyldes på dealen og skal være der, før den kan sættes Live.</p>
      </Group>
    </>
  );
}
