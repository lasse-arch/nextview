"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SCENARIOS, type Assumptions, type ScenarioKey } from "@/lib/forecast";
import { count, kr, krShort, monthLong, monthShort } from "../format";

export type SlidesData = {
  year: number;
  lockedBy: string | null;
  today: { customers: number; mrr: number; pipeline: number; open: number; newLastYear: number; meetingsLastYear: number };
  goal: { soldValue: number; salesGoal: number; revenue: number; newCustomers: number; endCustomers: number; endMrr: number; meetings: number };
  assumptions: Assumptions;
  months: { ym: string; revenue: number; real: boolean }[];
  scenarios: { key: ScenarioKey; revenue: number; newCustomers: number; endMrr: number }[];
  budget: { revenue: number; costs: number; result: number; lowest: { ym: string; cash: number }; endCash: number; firstProfit: string | null; lines: { name: string; total: number }[] } | null;
};

/* The plan as full-screen slides: arrows, space or a click to move on, Esc to leave. */
export function PlanSlides({ data }: { data: SlidesData }) {
  const slides = buildSlides(data);
  const [at, setAt] = useState(0);
  const go = (d: number) => setAt((i) => Math.min(slides.length - 1, Math.max(0, i + d)));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (["ArrowRight", "ArrowDown", "PageDown", " "].includes(e.key)) {
        e.preventDefault();
        setAt((i) => Math.min(slides.length - 1, i + 1));
      }
      if (["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key)) {
        e.preventDefault();
        setAt((i) => Math.max(0, i - 1));
      }
      if (e.key === "f") document.documentElement.requestFullscreen?.().catch(() => {});
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slides.length]);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-slate-950 text-white">
      <div className="flex items-center justify-between px-6 py-4 text-sm text-slate-400">
        <span className="font-medium text-slate-300">Nextview360, plan {data.year}</span>
        <div className="flex items-center gap-4">
          <button type="button" onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})} className="hover:text-white">
            Fuld skærm
          </button>
          <Link href={`/arpo/prognose?aar=${data.year}`} className="hover:text-white">
            Luk
          </Link>
        </div>
      </div>
      <div className="relative flex flex-1 items-center justify-center overflow-hidden px-[6vw]" onClick={() => go(1)}>
        <div key={at} className="w-full max-w-6xl animate-[fadeIn_.35s_ease-out]">
          {slides[at]}
        </div>
      </div>
      <div className="flex items-center justify-between px-6 py-4">
        <button type="button" onClick={() => go(-1)} disabled={at === 0} className="rounded-full px-3 py-1.5 text-sm text-slate-300 hover:bg-white/10 disabled:opacity-30">
          ← Forrige
        </button>
        <div className="flex gap-1.5">
          {slides.map((_, i) => (
            <button key={i} type="button" aria-label={`Slide ${i + 1}`} onClick={() => setAt(i)} className={`h-1.5 rounded-full transition-all ${i === at ? "w-6 bg-white" : "w-1.5 bg-white/30"}`} />
          ))}
        </div>
        <button type="button" onClick={() => go(1)} disabled={at === slides.length - 1} className="rounded-full px-3 py-1.5 text-sm text-slate-300 hover:bg-white/10 disabled:opacity-30">
          Næste →
        </button>
      </div>
      <style>{"@keyframes fadeIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}"}</style>
    </div>
  );
}

function Kicker({ children }: { children: React.ReactNode }) {
  return <div className="text-sm font-semibold uppercase tracking-[.18em] text-blue-400">{children}</div>;
}
function Title({ children }: { children: React.ReactNode }) {
  return <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">{children}</h1>;
}
function Big({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-white/[.06] p-6 ring-1 ring-inset ring-white/10">
      <div className="text-sm text-slate-400">{label}</div>
      <div className="money mt-2 whitespace-nowrap text-3xl font-semibold lg:text-[2.6rem]">{value}</div>
      {sub && <div className="mt-2 text-sm text-slate-400">{sub}</div>}
    </div>
  );
}

function buildSlides(d: SlidesData): React.ReactNode[] {
  const a = d.assumptions;
  const perSellerWeek = a.meetingsPerSellerWeek;
  const max = Math.max(1, ...d.months.map((m) => m.revenue));
  const anyReal = d.months.some((m) => m.real);
  const slides: React.ReactNode[] = [
    <div key="title">
      <Kicker>Nextview360</Kicker>
      <h1 className="mt-4 text-6xl font-semibold tracking-tight sm:text-8xl">Plan {d.year}</h1>
      <p className="mt-6 max-w-2xl text-xl text-slate-300">Hvor vi står, hvor vi skal hen, og hvad der skal til hver uge for at nå det.</p>
      {d.lockedBy && <p className="mt-10 text-sm text-slate-500">Prognosen er gemt af {d.lockedBy}. Alle beløb er uden moms.</p>}
    </div>,

    <div key="today">
      <Kicker>Udgangspunktet</Kicker>
      <Title>Hvor vi står i dag</Title>
      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        <Big label="Kunder der betaler" value={String(d.today.customers)} sub={`${d.today.pipeline} mere er underskrevet og på vej`} />
        <Big label="Månedsbetaling" value={krShort(d.today.mrr)} sub={`${krShort(d.today.mrr * 12)} om året, allerede i hus`} />
        <Big label="Det seneste år" value={`${d.today.newLastYear} nye kunder`} sub={`Fra ${d.today.meetingsLastYear} møder`} />
      </div>
    </div>,

    <div key="goal">
      <Kicker>Målet</Kicker>
      <Title>{d.year} i tal</Title>
      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <Big label="Solgt for" value={krShort(d.goal.soldValue)} sub={d.goal.salesGoal ? `Mål: ${krShort(d.goal.salesGoal)} om måneden` : `Cirka ${krShort(d.goal.soldValue / 12)} om måneden`} />
        <Big label="Omsætning i året" value={krShort(d.goal.revenue)} sub="Det, der lander i år. Resten kommer de næste år" />
        <Big label="Nye kunder" value={count(d.goal.newCustomers)} sub={`Cirka ${count(d.goal.newCustomers / 12)} om måneden`} />
        <Big label="Månedsbetaling i december" value={krShort(d.goal.endMrr)} sub={`${krShort(d.goal.endMrr * 12)} om året`} />
      </div>
    </div>,

    <div key="how">
      <Kicker>Sådan når vi det</Kicker>
      <Title>Fra møder til kunder</Title>
      <div className="mt-12 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
        <Step value={count(d.goal.meetings)} label={`møder i ${d.year}`} />
        <Arrow text={`${count(a.closeRate)} % bliver kunde`} />
        <Step value={count(d.goal.newCustomers)} label="nye kunder" />
        <Arrow text={`${kr(a.avgMonthly)} om måneden`} />
        <Step value={krShort(d.goal.endMrr * 12)} label="om året i december" money />
      </div>
      <p className="mt-12 text-2xl text-slate-200">
        Det betyder <b className="text-white">{count(perSellerWeek)} møder om ugen pr. sælger</b>, med {a.sellers} {a.sellers === 1 ? "sælger" : "sælgere"} i {a.salesWeeks} uger. Det er cirka {count(perSellerWeek / 5)} om dagen.
      </p>
    </div>,

    <div key="months">
      <Kicker>Året</Kicker>
      <Title>Omsætning måned for måned</Title>
      {anyReal && (
        <div className="mt-6 flex gap-5 text-sm text-slate-300">
          <span className="flex items-center gap-2"><i className="h-3 w-3 rounded-sm bg-slate-400" />Faktisk</span>
          <span className="flex items-center gap-2"><i className="h-3 w-3 rounded-sm bg-blue-500" />Plan</span>
        </div>
      )}
      <div className="mt-8 flex h-[38vh] items-end gap-2 sm:gap-4">
        {d.months.map((m) => (
          <div key={m.ym} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
            <span className="money hidden text-xs text-slate-400 lg:block">{krShort(m.revenue).replace(" kr.", "")}</span>
            <div className={`w-full rounded-t-md ${m.real ? "bg-slate-400" : "bg-blue-500"}`} style={{ height: `${((m.revenue / max) * 100).toFixed(1)}%` }} />
            <span className="text-sm text-slate-400">{monthShort(m.ym)}</span>
          </div>
        ))}
      </div>
    </div>,

    <div key="scenarios">
      <Kicker>Spændet</Kicker>
      <Title>Tre udfald af samme plan</Title>
      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {d.scenarios.map((s) => (
          <div key={s.key} className={`rounded-2xl p-6 ring-1 ring-inset ${s.key === "realistisk" ? "bg-blue-500/15 ring-blue-400/40" : "bg-white/[.06] ring-white/10"}`}>
            <div className="text-lg font-semibold">{SCENARIOS[s.key].label}</div>
            <div className="mt-1 text-sm text-slate-400">{SCENARIOS[s.key].note}</div>
            <div className="money mt-5 text-4xl font-semibold">{krShort(s.revenue)}</div>
            <div className="mt-2 text-sm text-slate-300">{count(s.newCustomers)} nye kunder</div>
          </div>
        ))}
      </div>
      <p className="mt-8 text-lg text-slate-300">Budgettet lægges efter det forsigtige. Målene sættes efter det realistiske.</p>
    </div>,
  ];

  if (d.budget) {
    const b = d.budget;
    slides.push(
      <div key="budget">
        <Kicker>Budget</Kicker>
        <Title>Penge ind og penge ud</Title>
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          <Big label="Omsætning" value={krShort(b.revenue)} />
          <Big label="Udgifter" value={krShort(b.costs)} sub={b.lines.slice(0, 3).map((l) => l.name).join(", ")} />
          <Big label="Resultat" value={krShort(b.result)} sub={b.firstProfit ? `Overskud hver måned fra ${monthLong(b.firstProfit)}` : undefined} />
        </div>
        <p className="mt-8 text-xl text-slate-300">
          Laveste saldo på kontoen er <b className="money text-white">{krShort(b.lowest.cash)}</b> i {monthLong(b.lowest.ym)}. Ved årets slut: <b className="money text-white">{krShort(b.endCash)}</b>
        </p>
      </div>,
    );
  }

  slides.push(
    <div key="weekly">
      <Kicker>Hver uge</Kicker>
      <Title>Det måler vi på</Title>
      <ul className="mt-10 grid gap-4 text-xl sm:grid-cols-2">
        <Kpi value={`${count(perSellerWeek)}`} text="møder pr. sælger om ugen" />
        <Kpi value={`${count(d.goal.newCustomers / 12)}`} text="nye kunder om måneden" />
        <Kpi value={`${count(a.closeRate)} %`} text="af møderne bliver kunde" />
        <Kpi value={a.capacityPerMonth ? `${a.capacityPerMonth}` : `${count(d.goal.newCustomers / 12)}`} text="tours leveret om måneden" />
      </ul>
      <p className="mt-10 text-lg text-slate-300">Mandag: pipeline på 30 minutter. Fredag: ugens tal mod planen. Hver sælger ser sit eget tal i Min dag.</p>
    </div>,
    <div key="end" className="text-center">
      <h1 className="text-6xl font-semibold tracking-tight sm:text-8xl">Spørgsmål?</h1>
      <p className="mt-6 text-xl text-slate-400">Planen og tallene ligger i Arpo under Prognose og Budget.</p>
    </div>,
  );
  return slides;
}

function Step({ value, label, money }: { value: string; label: string; money?: boolean }) {
  return (
    <div className="flex-1 rounded-2xl bg-white/[.06] p-6 text-center ring-1 ring-inset ring-white/10">
      <div className={`whitespace-nowrap text-3xl font-semibold lg:text-[2.6rem] ${money ? "money" : ""}`}>{value}</div>
      <div className="mt-2 text-sm text-slate-400">{label}</div>
    </div>
  );
}
function Arrow({ text }: { text: string }) {
  return (
    <div className="flex shrink-0 flex-col items-center px-2 text-center text-sm text-blue-300">
      <span className="text-2xl">→</span>
      <span className="max-w-[9rem]">{text}</span>
    </div>
  );
}
function Kpi({ value, text }: { value: string; text: string }) {
  return (
    <li className="flex items-baseline gap-4 rounded-2xl bg-white/[.06] p-6 ring-1 ring-inset ring-white/10">
      <span className="text-4xl font-semibold text-blue-400">{value}</span>
      <span className="text-slate-200">{text}</span>
    </li>
  );
}
