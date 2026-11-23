"use client";

import { SCENARIOS, SCENARIO_KEYS, backcastMonth, yearRows, type Assumptions, type MonthResult, type ScenarioKey } from "@/lib/forecast";
import type { ForecastHistory, LockedForecast } from "@/lib/forecast-data";
import { count, kr, monthLong } from "./format";

type Vals = { meetings?: number; newCustomers?: number; soldValue?: number; establishment?: number; revenue?: number; cashIn?: number; customers?: number; mrr?: number };
const ROWS: [keyof Vals, string, "n" | "kr"][] = [
  ["meetings", "Møder", "n"],
  ["newCustomers", "Nye kunder", "n"],
  ["soldValue", "Solgt for", "kr"],
  ["establishment", "Etablering", "kr"],
  ["revenue", "Omsætning", "kr"],
  ["cashIn", "Kommer ind på kontoen", "kr"],
  ["customers", "Kunder ved udgangen", "n"],
  ["mrr", "Månedsbetaling ved udgangen", "kr"],
];

/*
 * Prognose for one month (Sidste måned / Denne måned / Næste måned):
 * a month that's over against what its meetings should have given (and the
 * saved forecast), this month so far against the forecast for all of it, and
 * a month ahead in the three scenarios.
 */
export function MonthPanel({
  month,
  nowYm,
  history,
  assumptions,
  results,
  locked,
}: {
  month: string;
  nowYm: string;
  history: ForecastHistory;
  assumptions: Assumptions;
  results: Record<ScenarioKey, MonthResult[]>;
  locked: LockedForecast | null;
}) {
  const year = Number(month.slice(0, 4));
  const kind = month < nowYm ? "past" : month === nowYm ? "now" : "future";
  const actual = history.actual.find((a) => a.ym === month);
  const rowOf = (s: ScenarioKey): Vals | undefined => yearRows(year, nowYm, history.actual, results[s]).find((r) => r.ym === month);
  const lockedMonth = locked?.months.find((m) => m.ym === month);

  let cols: { label: string; sub?: string; vals: Vals | undefined; strong?: boolean; diff?: boolean }[] = [];
  let lead = "";
  if (kind === "past") {
    const model = backcastMonth(month, history.actual, assumptions);
    const lag = Math.max(0, Math.round(assumptions.daysToSign / 30.44));
    const real: Vals | undefined = actual && { ...actual, revenue: actual.mrr + actual.establishment, cashIn: actual.invoiced };
    cols = [
      { label: "Hvad møderne skulle give", sub: `Møderne i ${monthLong(shiftYm(month, -lag))}, med tallene herunder`, vals: model ? { ...model, meetings: undefined } : undefined },
      ...(lockedMonth ? [{ label: "Den gemte prognose", vals: lockedMonth as Vals }] : []),
      { label: "Faktisk", vals: real, strong: true },
      { label: "Forskel", sub: "Faktisk minus møderne", vals: real && model ? diff(real, model) : undefined, diff: true },
    ];
    lead = `${cap(monthLong(month))} er gået. Her er det, der skete, holdt op mod det, møderne skulle give med jeres lukkerate og priser.`;
  } else if (kind === "now") {
    const whole = rowOf("realistisk");
    const sofar: Vals | undefined = actual && { meetings: actual.meetings, newCustomers: actual.newCustomers, soldValue: actual.soldValue, establishment: actual.establishment, cashIn: actual.invoiced };
    cols = [
      { label: "Indtil nu", vals: sofar },
      { label: "Prognose for hele måneden", sub: "Indtil nu plus resten", vals: whole, strong: true },
      { label: "Mangler", vals: whole && sofar ? diff(whole, sofar, ["meetings", "newCustomers", "soldValue", "establishment"]) : undefined },
      { label: "Spænd", sub: "Forsigtig til ambitiøs", vals: undefined },
    ];
    lead = `${cap(monthLong(month))} er i gang. Prognosen er det, der allerede er sket, plus det, der kan nås resten af måneden.`;
  } else {
    cols = SCENARIO_KEYS.map((s) => ({ label: SCENARIOS[s].label, vals: rowOf(s), strong: s === "realistisk" }));
    lead = `${cap(monthLong(month))} ${year} regnet ud fra tallene herunder, i de tre scenarier.`;
  }
  const range = kind === "now" ? [rowOf("forsigtig"), rowOf("ambitios")] : null;

  const fmt = (k: keyof Vals, v: number | undefined, unit: "n" | "kr", signed?: boolean) => {
    if (v === undefined) return <span className="text-slate-300">-</span>;
    const t = unit === "kr" ? kr(v) : count(v);
    return signed && v > 0 ? `+${t}` : t;
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="px-5 pt-5">
        <h2 className="text-lg font-semibold capitalize text-slate-900">
          {monthLong(month)} {year}
        </h2>
        <p className="mt-0.5 max-w-3xl text-sm text-slate-500">
          {lead} Tallene bygger på {history.window === 12 ? "det seneste år" : `de seneste ${history.window} måneder`}.
        </p>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-y border-slate-100 bg-slate-50 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-5 py-2 text-left"> </th>
              {cols.map((c) => (
                <th key={c.label} className="px-4 py-2 align-bottom">
                  <span className={c.strong ? "text-slate-900" : ""}>{c.label}</span>
                  {c.sub && <span className="block font-normal normal-case tracking-normal text-slate-400">{c.sub}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map(([k, label, unit]) => (
              <tr key={k} className="border-b border-slate-100">
                <td className="px-5 py-2.5 text-slate-700">{label}</td>
                {cols.map((c) => {
                  const v = c.vals?.[k];
                  if (c.label === "Spænd" && range) {
                    const [lo, hi] = range;
                    return (
                      <td key={c.label} className="money whitespace-nowrap px-4 py-2.5 text-right text-slate-500">
                        {lo?.[k] !== undefined && hi?.[k] !== undefined ? (
                          <>
                            {fmt(k, lo[k], unit)} til {fmt(k, hi[k], unit)}
                          </>
                        ) : (
                          "-"
                        )}
                      </td>
                    );
                  }
                  return (
                    <td
                      key={c.label}
                      className={`money whitespace-nowrap px-4 py-2.5 text-right ${c.strong ? "font-semibold text-slate-900" : "text-slate-700"} ${c.diff && v !== undefined ? (v >= 0 ? "text-emerald-700" : "text-rose-700") : ""}`}
                    >
                      {fmt(k, v, unit, c.diff)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-5 py-3 text-xs text-slate-500">
        {kind === "past"
          ? "Omsætning er månedsbetalingerne ved månedens udgang plus etableringerne i måneden. Kommer ind er det, der blev faktureret."
          : "Solgt for er de nye aftalers hele værdi: etablering plus månedsbetalingen i hele bindingen. Omsætning er det, der lander i måneden."}
      </p>
    </section>
  );
}

const shiftYm = (ym: string, k: number) => {
  const d = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + k, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** a - b for the keys both have (or only `keys`), the rest left out. */
function diff(a: Vals, b: Vals, keys?: (keyof Vals)[]): Vals {
  const out: Vals = {};
  for (const k of keys ?? (Object.keys(a) as (keyof Vals)[])) {
    const x = a[k];
    const y = b[k];
    if (typeof x === "number" && typeof y === "number") out[k] = x - y;
  }
  return out;
}
