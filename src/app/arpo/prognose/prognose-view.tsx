"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useToast } from "@/components/toast";
import { lockForecast, saveForecastAssumptions, unlockForecast } from "@/lib/actions/forecast";
import { ASSUMPTION_KEYS, SCENARIOS, SCENARIO_KEYS, forecastYear, yearRows, type Assumptions, type MonthResult, type ScenarioKey } from "@/lib/forecast";
import type { ForecastHistory, Plan } from "@/lib/forecast-data";
import { count, kr, krShort, monthLong, monthShort, ymNow } from "./format";

const FIELDS: Record<keyof Assumptions, { label: string; unit: string; step: number }> = {
  sellers: { label: "Sælgere", unit: "sælgere", step: 1 },
  meetingsPerSellerWeek: { label: "Møder pr. sælger pr. uge", unit: "møder", step: 0.5 },
  salesWeeks: { label: "Salgsuger om året", unit: "uger", step: 1 },
  closeRate: { label: "Lukkerate", unit: "%", step: 1 },
  avgMonthly: { label: "Månedspris pr. ny kunde", unit: "kr.", step: 50 },
  avgEstablishment: { label: "Etablering pr. ny kunde", unit: "kr.", step: 500 },
  churnPerYear: { label: "Opsigelser pr. år", unit: "%", step: 1 },
  daysToSign: { label: "Fra møde til underskrift", unit: "dage", step: 1 },
  daysToLive: { label: "Fra underskrift til live", unit: "dage", step: 1 },
  capacityPerMonth: { label: "Tours vi kan levere pr. måned", unit: "tours", step: 1 },
};


const toDraft = (a: Assumptions) => Object.fromEntries(ASSUMPTION_KEYS.map((k) => [k, String(a[k])])) as Record<keyof Assumptions, string>;

export function PrognoseView({ year, years, history, plan, nowIso }: { year: number; years: number[]; history: ForecastHistory; plan: Plan; nowIso: string }) {
  const now = new Date(nowIso);
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const saved: Assumptions = { ...history.assumptions, ...plan.overrides };
  const [draft, setDraft] = useState(() => toDraft(saved));
  const [scenario, setScenario] = useState<ScenarioKey>(plan.locked?.scenario ?? "realistisk");
  const [target, setTarget] = useState("");

  // The draft as numbers - an empty or broken field falls back to Arpo's own figure.
  const assumptions = Object.fromEntries(
    ASSUMPTION_KEYS.map((k) => {
      const v = Number(draft[k].replace(",", "."));
      return [k, Number.isFinite(v) && draft[k].trim() !== "" ? v : history.assumptions[k]];
    }),
  ) as Assumptions;
  const dirty = ASSUMPTION_KEYS.some((k) => assumptions[k] !== saved[k]);
  const base = { assumptions, season: history.season, start: history.start, open: history.open, now, year };
  const results = Object.fromEntries(SCENARIO_KEYS.map((s) => [s, forecastYear({ ...base, scenario: s })])) as Record<ScenarioKey, MonthResult[]>;
  const nowYm = ymNow(now);
  const actualByYm = new Map(history.actual.map((a) => [a.ym, a]));

  const rowsFor = (s: ScenarioKey) => yearRows(year, nowYm, history.actual, results[s]);
  const totalsFor = (s: ScenarioKey) => {
    const rows = rowsFor(s);
    const sum = (k: "revenue" | "newCustomers") => rows.reduce((t, r) => t + r[k], 0);
    const last = rows[rows.length - 1];
    return { revenue: sum("revenue"), newCustomers: sum("newCustomers"), endCustomers: last?.customers ?? 0, endMrr: last?.mrr ?? 0 };
  };

  function save() {
    const overrides = Object.fromEntries(ASSUMPTION_KEYS.filter((k) => assumptions[k] !== history.assumptions[k]).map((k) => [k, assumptions[k]]));
    start(async () => {
      const r = await saveForecastAssumptions(year, overrides);
      toast(r.ok ? "Gemt - Budget og Min dag regner med de nye tal" : r.error);
      if (r.ok) router.refresh();
    });
  }
  function lock() {
    start(async () => {
      const r = dirty ? await saveForecastAssumptions(year, Object.fromEntries(ASSUMPTION_KEYS.filter((k) => assumptions[k] !== history.assumptions[k]).map((k) => [k, assumptions[k]]))) : { ok: true as const };
      const l = r.ok ? await lockForecast(year, scenario) : r;
      toast(l.ok ? `Gemt som prognosen for ${year}` : l.error);
      if (l.ok) router.refresh();
    });
  }
  function unlock() {
    if (!confirm("Slette den gemte prognose? Tallene herunder regnes stadig - kun sammenligningen forsvinder.")) return;
    start(async () => {
      const r = await unlockForecast(year);
      toast(r.ok ? "Den gemte prognose er slettet" : r.error);
      if (r.ok) router.refresh();
    });
  }

  const rows = rowsFor(scenario);
  const sel = results[scenario];
  const bars = rows.map((r) => ({ ym: r.ym, value: r.revenue, real: r.kind === "actual" }));
  const maxBar = Math.max(1, ...bars.map((b) => b.value));
  const anyReal = bars.some((b) => b.real);

  // "Hvad skal der til": meetings needed for a number of new customers.
  const targetN = Number(target);
  const perMeeting = (assumptions.closeRate / 100) * assumptions.sellers * assumptions.salesWeeks;
  const neededPerWeek = targetN > 0 && perMeeting > 0 ? targetN / perMeeting : null;

  const locked = plan.locked;
  const lockedRows = locked ? locked.months.filter((m) => m.ym <= nowYm) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Prognose</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">Året regnet ud nedefra: møder, salg, kunder og penge. Tallene kommer fra jeres egen historik i Arpo, og I kan rette dem herunder. Alle beløb er uden moms.</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Link href={`/arpo/prognose/praesentation?aar=${year}`} className="mr-2 rounded-full bg-blue-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
            Præsentér planen
          </Link>
          {years.map((y) => (
            <Link key={y} href={`?aar=${y}`} className={`rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 ring-inset ${y === year ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"}`}>
              {y}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Fact label="Kunder der betaler i dag" value={String(history.today.customers)} />
        <Fact label="Månedsbetaling i dag" value={kr(history.today.mrr)} sub={`${kr(history.today.mrr * 12)} om året`} />
        <Fact label="Underskrevet, ikke live endnu" value={String(history.today.pipeline)} />
        <Fact label="Åbne deals i spil" value={String(history.today.open)} sub="Møde holdt, opfølgning eller kontrakt ude" />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {SCENARIO_KEYS.map((s) => {
          const t = totalsFor(s);
          const on = s === scenario;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setScenario(s)}
              className={`rounded-xl border bg-white p-4 text-left shadow-sm transition ${on ? "border-slate-900 ring-2 ring-slate-900" : "border-slate-200 hover:border-slate-300"}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-900">{SCENARIOS[s].label}</span>
                {locked?.scenario === s && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">Gemt som årets prognose</span>}
              </div>
              <div className="mt-0.5 text-xs text-slate-500">{SCENARIOS[s].note}</div>
              <div className="money mt-3 text-2xl font-semibold text-slate-900">{krShort(t.revenue)}</div>
              <div className="text-xs text-slate-500">Omsætning i {year}</div>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <dt className="text-slate-500">Nye kunder</dt>
                  <dd className="font-semibold text-slate-900">{count(t.newCustomers)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Kunder i dec.</dt>
                  <dd className="font-semibold text-slate-900">{count(t.endCustomers)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Pr. md. i dec.</dt>
                  <dd className="money font-semibold text-slate-900">{krShort(t.endMrr)}</dd>
                </div>
              </dl>
            </button>
          );
        })}
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">Omsætning måned for måned, {SCENARIOS[scenario].label.toLowerCase()}</h2>
          {anyReal && (
            <div className="flex items-center gap-4 text-xs text-slate-600">
              <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-slate-700" />Faktisk faktureret</span>
              <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-blue-500" />Prognose</span>
            </div>
          )}
        </div>
        <div className="mt-5 flex h-44 items-end gap-1.5 sm:gap-3">
          {bars.map((b) => (
            <div key={b.ym} className="group relative flex h-full flex-1 flex-col items-center justify-end gap-1">
              <span className="money pointer-events-none absolute -top-1 z-10 hidden -translate-y-full whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white group-hover:block">
                {monthLong(b.ym)}: {kr(b.value)}
              </span>
              <div className={`w-full rounded-t-[4px] ${b.real ? "bg-slate-700" : "bg-blue-500"}`} style={{ height: `${Math.max(b.value > 0 ? 2 : 0, (b.value / maxBar) * 100).toFixed(1)}%` }} />
              <span className="text-[11px] text-slate-500">{monthShort(b.ym)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Tallene prognosen bygger på</h2>
            <p className="mt-0.5 text-xs text-slate-500">Arpos tal står under hvert felt. Ret dem, og se året ændre sig med det samme.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setDraft(toDraft(history.assumptions))} className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50">
              Brug Arpos tal
            </button>
            <button type="button" disabled={!dirty || pending} onClick={save} className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40">
              {pending ? "Gemmer…" : "Gem tallene"}
            </button>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {ASSUMPTION_KEYS.map((k) => {
            const f = FIELDS[k];
            const own = assumptions[k] !== history.assumptions[k];
            return (
              <label key={k} className={`block rounded-lg p-3 ring-1 ring-inset ${own ? "bg-amber-50 ring-amber-200" : "bg-slate-50 ring-slate-200"}`}>
                <span className="block text-xs font-medium text-slate-700">{f.label}</span>
                <span className="mt-1.5 flex items-center gap-1.5">
                  <input
                    inputMode="decimal"
                    value={draft[k]}
                    onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
                    className="w-full min-w-0 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900"
                  />
                  <span className="shrink-0 text-xs text-slate-500">{f.unit}</span>
                </span>
                <span className="mt-1.5 block text-[11px] leading-snug text-slate-500">
                  {own ? (
                    <>
                      Arpo: {history.assumptions[k].toLocaleString("da-DK")}{" "}
                      <button type="button" onClick={(e) => (e.preventDefault(), setDraft((d) => ({ ...d, [k]: String(history.assumptions[k]) })))} className="font-medium text-blue-600 hover:underline">
                        Brug den
                      </button>
                    </>
                  ) : (
                    history.basis[k]
                  )}
                </span>
              </label>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-slate-100 pt-4 text-sm text-slate-600">
          <span>
            <b className="font-medium text-slate-900">Sæson:</b> {history.seasonFromData ? "Møderne fordeles over året, som jeres møder har gjort de seneste to år." : "Jævnt over året. Der er for lidt historik til at se en sæson endnu."}
          </span>
          {history.hoursPerTour !== null && (
            <span>
              <b className="font-medium text-slate-900">Tid pr. tour:</b> {history.hoursPerTour.toLocaleString("da-DK")} timer i snit (filmning, redigering og rettelser)
            </span>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Hvad skal der til?</h2>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-700">
          For at få
          <input inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value.replace(/[^\d]/g, ""))} placeholder={count(totalsFor("realistisk").newCustomers)} className="w-20 rounded-md border border-slate-300 px-2 py-1 text-sm" />
          nye kunder i {year}
          {neededPerWeek !== null ? (
            <span>
              skal hver sælger holde <b className="text-slate-900">{count(neededPerWeek)} møder om ugen</b> (cirka {count(neededPerWeek / 5)} om dagen) med jeres lukkerate på {count(assumptions.closeRate)} %.
            </span>
          ) : (
            <span className="text-slate-400">: skriv et antal.</span>
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="px-5 pt-5">
          <h2 className="text-sm font-semibold text-slate-900">Måned for måned, {SCENARIOS[scenario].label.toLowerCase()}</h2>
          {year === now.getFullYear() && <p className="mt-0.5 text-xs text-slate-500">Måneder, der er gået, viser de faktiske tal. Denne måned er det, der er sket indtil nu, plus prognosen for resten.</p>}
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-y border-slate-100 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-5 py-2">Måned</th>
                <th className="px-3 py-2 text-right">Møder</th>
                <th className="px-3 py-2 text-right">Nye kunder</th>
                <th className="px-3 py-2 text-right">Ny md.-betaling</th>
                <th className="px-3 py-2 text-right">Etablering</th>
                <th className="px-3 py-2 text-right">Kunder</th>
                <th className="px-3 py-2 text-right">Md.-betaling i alt</th>
                <th className="px-3 py-2 text-right">Omsætning</th>
                <th className="px-5 py-2 text-right">Kommer ind</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.ym} className={`border-b border-slate-100 ${r.kind === "actual" ? "bg-slate-50/60 text-slate-600" : "text-slate-800"}`}>
                  <td className="px-5 py-2">
                    <span className="capitalize">{monthLong(r.ym)}</span>
                    {r.kind !== "forecast" && (
                      <span className="ml-1.5 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">{r.kind === "actual" ? "Faktisk" : "Indtil nu + resten"}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">{count(r.meetings)}</td>
                  <td className="px-3 py-2 text-right">{count(r.newCustomers)}</td>
                  <td className="money px-3 py-2 text-right">{kr(r.newMonthly)}</td>
                  <td className="money px-3 py-2 text-right">{kr(r.establishment)}</td>
                  <td className="px-3 py-2 text-right">{count(r.customers)}</td>
                  <td className="money px-3 py-2 text-right">{kr(r.mrr)}</td>
                  <td className="money px-3 py-2 text-right font-medium">{kr(r.revenue)}</td>
                  <td className="money px-5 py-2 text-right">{kr(r.cashIn)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-5 py-3 text-xs text-slate-500">Omsætning er månedsbetalingerne og etableringerne i måneden. Kommer ind er pengene på kontoen: månedsbetalinger faktureres et kvartal forud og etablering ved underskrift. For de måneder, der er gået, er det det, der er faktureret.</p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Prognose mod virkelighed</h2>
            <p className="mt-0.5 max-w-2xl text-xs text-slate-500">
              {locked
                ? `Gemt ${new Date(locked.at).toLocaleDateString("da-DK", { day: "numeric", month: "long", year: "numeric" })} af ${locked.by} (${SCENARIOS[locked.scenario].label.toLowerCase()}). Hver måned holdes de faktiske tal op mod den.`
                : `Gem det valgte scenarie som prognosen for ${year}. Så kan I hver måned se, om I er foran eller bagud.`}
            </p>
          </div>
          {locked ? (
            <button type="button" disabled={pending} onClick={unlock} className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50">
              Slet den gemte prognose
            </button>
          ) : (
            <button type="button" disabled={pending || !sel.length} onClick={lock} className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40">
              Gem {SCENARIOS[scenario].label.toLowerCase()} som prognosen for {year}
            </button>
          )}
        </div>
        {locked &&
          (lockedRows.length ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-y border-slate-100 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2">Måned</th>
                    <th className="px-3 py-2 text-right">Nye kunder, prognose</th>
                    <th className="px-3 py-2 text-right">Nye kunder, faktisk</th>
                    <th className="px-3 py-2 text-right">Omsætning, prognose</th>
                    <th className="px-3 py-2 text-right">Omsætning, faktisk</th>
                    <th className="px-3 py-2 text-right">Forskel</th>
                  </tr>
                </thead>
                <tbody>
                  {lockedRows.map((m) => {
                    const a = actualByYm.get(m.ym);
                    const real = a ? a.mrr + a.establishment : 0;
                    const diff = real - m.revenue;
                    return (
                      <tr key={m.ym} className="border-b border-slate-100">
                        <td className="px-3 py-2 capitalize">{monthLong(m.ym)}{m.ym === nowYm ? " (indtil nu)" : ""}</td>
                        <td className="px-3 py-2 text-right">{count(m.newCustomers)}</td>
                        <td className="px-3 py-2 text-right font-medium">{a?.newCustomers ?? 0}</td>
                        <td className="money px-3 py-2 text-right">{kr(m.revenue)}</td>
                        <td className="money px-3 py-2 text-right font-medium">{kr(real)}</td>
                        <td className={`money px-3 py-2 text-right font-medium ${diff >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                          {diff >= 0 ? "+" : ""}
                          {kr(diff)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-500">Sammenligningen starter i januar {year}, når de første faktiske tal kommer.</p>
          ))}
      </section>

      <details className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
        <summary className="cursor-pointer font-semibold text-slate-900">Sådan regnes prognosen</summary>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5">
          <li>Møder: sælgere gange møder om ugen gange salgsuger, fordelt over året efter sæsonen.</li>
          <li>Nye kunder: møderne gange lukkeraten, underskrevet efter det antal dage, det plejer at tage. De deals, der er i spil nu, tælles med efter hvor sandsynlige de er.</li>
          <li>Live: efter det antal dage, det plejer at tage, og aldrig flere om måneden, end I kan levere. Resten venter til måneden efter.</li>
          <li>Kunderne i dag: kører videre, minus dem, der har opsagt, og minus opsigelsesraten på resten.</li>
          <li>Omsætning: månedsbetalingerne fra den måned, kunden går live, plus etableringen i den måned, kunden skriver under.</li>
          <li>De tre scenarier er de samme tal skruet op og ned, så I kan se spændet. Lav budgettet ud fra det forsigtige og målene ud fra det realistiske.</li>
        </ol>
      </details>
    </div>
  );
}

function Fact({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="money mt-1 text-2xl font-semibold text-slate-900">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-400">{sub}</div>}
    </div>
  );
}
