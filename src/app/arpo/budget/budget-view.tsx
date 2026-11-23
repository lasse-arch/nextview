"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useToast } from "@/components/toast";
import { saveBudget } from "@/lib/actions/forecast";
import { COST_KINDS, COST_KIND_KEYS, SCENARIOS, SCENARIO_KEYS, budgetYear, costInMonth, yearRows, type ActualMonth, type CostKind, type CostLine, type MonthResult, type ScenarioKey } from "@/lib/forecast";
import { kr, krShort, monthLong, monthShort, ymNow } from "../prognose/format";

type Against = ScenarioKey | "laast";
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const newId = () => Math.random().toString(36).slice(2, 10);

export function BudgetView({
  year,
  years,
  actual,
  scenarios,
  locked,
  costs: savedCosts,
  suggested,
  startCash: savedCash,
  budgetScenario,
  nowIso,
}: {
  year: number;
  years: number[];
  actual: ActualMonth[];
  scenarios: Record<ScenarioKey, MonthResult[]>;
  locked: { months: MonthResult[]; scenario: ScenarioKey } | null;
  costs: CostLine[];
  suggested: boolean;
  startCash: number;
  budgetScenario: Against;
  nowIso: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [lines, setLines] = useState<CostLine[]>(savedCosts);
  const [cash, setCash] = useState(String(savedCash || ""));
  const [against, setAgainst] = useState<Against>(budgetScenario);
  const dirty = suggested || JSON.stringify(lines) !== JSON.stringify(savedCosts) || Number(cash || 0) !== savedCash || against !== budgetScenario;

  const nowYm = ymNow(new Date(nowIso));
  const forecast = against === "laast" && locked ? locked.months : scenarios[against === "laast" ? "realistisk" : against];
  const rows = yearRows(year, nowYm, actual, forecast);
  const budget = budgetYear(rows, lines, Number(cash) || 0);
  const total = (k: "revenue" | "costs" | "result" | "cashIn") => budget.reduce((s, m) => s + m[k], 0);
  const lowest = budget.reduce<(typeof budget)[number] | null>((min, m) => (!min || m.cash < min.cash ? m : min), null);
  const firstProfit = budget.find((m, i) => m.result >= 0 && budget.slice(i).every((x) => x.result >= 0));
  const maxAbs = Math.max(1, ...budget.map((m) => Math.abs(m.result)));
  const lineTotal = (l: CostLine) => rows.reduce((s, r, i) => s + costInMonth(l, Number(r.ym.slice(5, 7)) || i + 1, r), 0);

  const put = (id: string, patch: Partial<CostLine>) => setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  function save() {
    start(async () => {
      const r = await saveBudget(year, { costs: lines, startCash: Number(cash) || 0, scenario: against });
      toast(r.ok ? "Budgettet er gemt" : r.error);
      if (r.ok) router.refresh();
    });
  }

  const options: { key: Against; label: string }[] = [
    ...SCENARIO_KEYS.map((s) => ({ key: s as Against, label: SCENARIOS[s].label })),
    ...(locked ? [{ key: "laast" as Against, label: "Den gemte prognose" }] : []),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Budget</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">Årets udgifter holdt op mod prognosen: resultatet, pengene på kontoen og hvornår I tjener penge. Indtægterne kommer fra Prognose. Udgifterne skriver I selv. Alle beløb er uden moms.</p>
        </div>
        <div className="flex gap-1.5">
          {years.map((y) => (
            <Link key={y} href={`?aar=${y}`} className={`rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 ring-inset ${y === year ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"}`}>
              {y}
            </Link>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-x-6 gap-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <div className="text-xs font-medium text-slate-600">Indtægterne fra</div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {options.map((o) => (
              <button key={o.key} type="button" onClick={() => setAgainst(o.key)} className={`rounded-md px-3 py-1.5 text-sm font-medium ${o.key === against ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">Penge på kontoen 1. januar</span>
          <span className="mt-1.5 flex items-center gap-1.5">
            <input inputMode="numeric" value={cash} onChange={(e) => setCash(e.target.value.replace(/[^\d-]/g, ""))} placeholder="0" className="w-36 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
            <span className="text-xs text-slate-500">kr.</span>
          </span>
        </label>
        <div className="ml-auto flex items-center gap-3">
          {suggested && <span className="text-xs text-amber-700">Forslag. Udfyld beløbene og gem.</span>}
          <button type="button" disabled={!dirty || pending} onClick={save} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
            {pending ? "Gemmer…" : "Gem budgettet"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card label={`Omsætning ${year}`} value={krShort(total("revenue"))} />
        <Card label="Udgifter" value={krShort(total("costs"))} />
        <Card label="Resultat" value={krShort(total("result"))} tone={total("result") >= 0 ? "good" : "bad"} sub={firstProfit ? `Overskud hver måned fra ${monthLong(firstProfit.ym)}` : "Ingen måned med fast overskud"} />
        <Card
          label="Laveste saldo på kontoen"
          value={lowest ? krShort(lowest.cash) : "-"}
          tone={lowest && lowest.cash < 0 ? "bad" : "default"}
          sub={lowest ? `I ${monthLong(lowest.ym)}. Ved årets slut ${krShort(budget[budget.length - 1]?.cash ?? 0)}` : undefined}
        />
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">Resultat måned for måned</h2>
          <div className="flex items-center gap-4 text-xs text-slate-600">
            <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-emerald-600" />Overskud</span>
            <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-rose-500" />Underskud</span>
          </div>
        </div>
        <div className="mt-4 flex h-48 gap-1.5 sm:gap-3">
          {budget.map((m) => {
            const h = ((Math.abs(m.result) / maxAbs) * 100).toFixed(1);
            return (
              <div key={m.ym} className="group relative flex h-full flex-1 flex-col">
                <span className="money pointer-events-none absolute left-1/2 top-0 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white group-hover:block">
                  {monthLong(m.ym)}: {kr(m.result)}
                </span>
                <div className="flex flex-1 items-end border-b border-slate-300">{m.result > 0 && <div className="w-full rounded-t-[4px] bg-emerald-600" style={{ height: `${h}%` }} />}</div>
                <div className="flex flex-1 items-start">{m.result < 0 && <div className="w-full rounded-b-[4px] bg-rose-500" style={{ height: `${h}%` }} />}</div>
                <span className="mt-1 text-center text-[11px] text-slate-500">{monthShort(m.ym)}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Udgifter</h2>
        <p className="mt-0.5 text-xs text-slate-500">Skriv beløbene uden moms. Løn og forsikring har ingen moms, så der skriver I bare beløbet.</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-y border-slate-100 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-2 py-2">Udgift</th>
                <th className="px-2 py-2">Slags</th>
                <th className="px-2 py-2">Beløb</th>
                <th className="px-2 py-2">Måneder</th>
                <th className="px-2 py-2 text-right">I året</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} className="border-b border-slate-100">
                  <td className="px-2 py-1.5">
                    <input value={l.name} onChange={(e) => put(l.id, { name: e.target.value })} className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm" />
                  </td>
                  <td className="px-2 py-1.5">
                    <select
                      value={l.kind}
                      onChange={(e) => {
                        const kind = e.target.value as CostKind;
                        put(l.id, kind === "once" ? { kind, month: l.month ?? 1, from: undefined, to: undefined } : { kind, from: l.from ?? 1, to: l.to ?? 12, month: undefined });
                      }}
                      title={COST_KINDS[l.kind].help}
                      className="rounded-md border border-slate-200 px-2 py-1 text-sm"
                    >
                      {COST_KIND_KEYS.map((k) => (
                        <option key={k} value={k}>
                          {COST_KINDS[k].label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <span className="flex items-center gap-1.5">
                      <input
                        inputMode="decimal"
                        value={String(l.amount || "")}
                        placeholder="0"
                        onChange={(e) => put(l.id, { amount: Number(e.target.value.replace(",", ".").replace(/[^\d.]/g, "")) || 0 })}
                        className="w-28 rounded-md border border-slate-200 px-2 py-1 text-right text-sm"
                      />
                      <span className="whitespace-nowrap text-xs text-slate-500">{COST_KINDS[l.kind].unit}</span>
                    </span>
                  </td>
                  <td className="px-2 py-1.5">
                    {l.kind === "once" ? (
                      <MonthSelect value={l.month ?? 1} onChange={(month) => put(l.id, { month })} />
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-slate-500">
                        <MonthSelect value={l.from ?? 1} onChange={(from) => put(l.id, { from, to: Math.max(from, l.to ?? 12) })} />
                        til
                        <MonthSelect value={l.to ?? 12} onChange={(to) => put(l.id, { to, from: Math.min(to, l.from ?? 1) })} />
                      </span>
                    )}
                  </td>
                  <td className="money px-2 py-1.5 text-right font-medium text-slate-900">{kr(lineTotal(l))}</td>
                  <td className="px-1 py-1.5 text-right">
                    <button type="button" aria-label={`Fjern ${l.name}`} onClick={() => setLines((ls) => ls.filter((x) => x.id !== l.id))} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} className="px-2 pt-3">
                  <button
                    type="button"
                    onClick={() => setLines((ls) => [...ls, { id: newId(), name: "", kind: "monthly", amount: 0, from: 1, to: 12 }])}
                    className="text-sm font-medium text-blue-600 hover:underline"
                  >
                    + Tilføj en udgift
                  </button>
                </td>
                <td className="money px-2 pt-3 text-right font-semibold text-slate-900">{kr(total("costs"))}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="px-5 pt-5">
          <h2 className="text-sm font-semibold text-slate-900">Måned for måned</h2>
          <p className="mt-0.5 text-xs text-slate-500">Saldo er pengene på kontoen: det, der kommer ind (månedsbetalinger et kvartal forud, etablering ved underskrift), minus udgifterne.</p>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-y border-slate-100 bg-slate-50 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="sticky left-0 bg-slate-50 px-5 py-2 text-left"> </th>
                {budget.map((m) => (
                  <th key={m.ym} className="px-2 py-2">
                    {monthShort(m.ym)}
                  </th>
                ))}
                <th className="px-5 py-2">År</th>
              </tr>
            </thead>
            <tbody className="money">
              <Line label="Omsætning" values={budget.map((m) => m.revenue)} strong />
              {lines.map((l, i) => (
                <Line key={l.id} label={l.name || COST_KINDS[l.kind].label} values={budget.map((m) => -m.byLine[i])} muted />
              ))}
              <Line label="Udgifter i alt" values={budget.map((m) => -m.costs)} />
              <Line label="Resultat" values={budget.map((m) => m.result)} strong signed />
              <Line label="Resultat hidtil" values={budget.map((m) => m.cumulative)} signed noTotal />
              <Line label="Kommer ind" values={budget.map((m) => m.cashIn)} muted />
              <Line label="Saldo på kontoen" values={budget.map((m) => m.cash)} strong signed noTotal />
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
        <h2 className="font-semibold text-slate-900">Hvorfor uden moms?</h2>
        <p className="mt-1.5 max-w-3xl">
          Momsen er statens penge, ikke jeres. I lægger 25 % moms oveni fakturaerne og trækker momsen på jeres egne indkøb fra. Forskellen betaler I til Skat, typisk hvert kvartal eller halvår. Derfor er både omsætning og udgifter her uden moms. Husk, at momsen står på kontoen, indtil den skal betales. Den er ikke med i saldoen herover, så læg den til side.
        </p>
      </section>
    </div>
  );
}

function MonthSelect({ value, onChange }: { value: number; onChange: (m: number) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(Number(e.target.value))} className="rounded-md border border-slate-200 px-1.5 py-1 text-sm text-slate-800">
      {MONTHS.map((m) => (
        <option key={m} value={m}>
          {monthShort(`2000-${String(m).padStart(2, "0")}`)}
        </option>
      ))}
    </select>
  );
}

function Line({ label, values, strong, muted, signed, noTotal }: { label: string; values: number[]; strong?: boolean; muted?: boolean; signed?: boolean; noTotal?: boolean }) {
  const total = values.reduce((s, v) => s + v, 0);
  const cell = (v: number) => (signed && v < 0 ? "text-rose-700" : "");
  const fmt = (v: number) => (Math.round(v) || 0).toLocaleString("da-DK");
  return (
    <tr className={`border-b border-slate-100 ${strong ? "font-semibold text-slate-900" : muted ? "text-slate-500" : "text-slate-800"}`}>
      <td className={`sticky left-0 whitespace-nowrap bg-white px-5 py-1.5 text-left ${muted ? "pl-8" : ""}`}>{label}</td>
      {values.map((v, i) => (
        <td key={i} className={`whitespace-nowrap px-2 py-1.5 text-right ${cell(v)}`}>
          {fmt(v)}
        </td>
      ))}
      <td className={`whitespace-nowrap px-5 py-1.5 text-right ${noTotal ? "text-slate-300" : cell(total)}`}>{noTotal ? "" : fmt(total)}</td>
    </tr>
  );
}

function Card({ label, value, sub, tone = "default" }: { label: string; value: string; sub?: string; tone?: "default" | "good" | "bad" }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`money mt-1 text-2xl font-semibold ${tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-rose-700" : "text-slate-900"}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}
