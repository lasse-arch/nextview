import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { budgetYear, totalsOf, yearRows, SCENARIO_KEYS } from "@/lib/forecast";
import { defaultPlanYear, forecastHistory, loadPlan, mergedAssumptions, planYears, scenariosFor } from "@/lib/forecast-data";
import { PlanSlides, type SlidesData } from "./slides";

/*
 * Prognose → "Præsentér planen" (admin only): the year's plan as full-screen
 * slides for a team meeting - the saved (locked) forecast when there is one,
 * else the realistic scenario, with the budget when it's filled in.
 */
export default async function PlanPresentationPage({ searchParams }: { searchParams: Promise<{ aar?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/api/auth/session-ended?next=/arpo/prognose");
  if (user.role !== "ADMIN") redirect("/arpo");

  const q = await searchParams;
  const year = planYears().includes(Number(q.aar)) ? Number(q.aar) : defaultPlanYear();
  const plan = await loadPlan(year);
  const history = await forecastHistory(new Date(), plan.window ?? undefined);
  const now = new Date();
  const nowYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const scenarios = scenariosFor(history, plan, now);
  const main = plan.locked ? plan.locked.months : scenarios.realistisk;
  const rows = yearRows(year, nowYm, history.actual, main);
  const a = plan.locked?.assumptions ?? mergedAssumptions(history, plan);
  const sum = (k: "revenue" | "newCustomers" | "meetings" | "soldValue") => rows.reduce((s, r) => s + r[k], 0);
  const last = rows[rows.length - 1];
  const budget = plan.costs.some((c) => c.amount > 0) ? budgetYear(rows, plan.costs, plan.startCash) : null;
  const yearAgo = history.actual.slice(-12);

  const data: SlidesData = {
    year,
    lockedBy: plan.locked ? plan.locked.by : null,
    today: {
      ...history.today,
      newLastYear: yearAgo.reduce((s, m) => s + m.newCustomers, 0),
      meetingsLastYear: yearAgo.reduce((s, m) => s + m.meetings, 0),
    },
    goal: { soldValue: sum("soldValue"), salesGoal: plan.salesGoal, revenue: sum("revenue"), newCustomers: sum("newCustomers"), endCustomers: last?.customers ?? 0, endMrr: last?.mrr ?? 0, meetings: sum("meetings") },
    assumptions: a,
    months: rows.map((r) => ({ ym: r.ym, revenue: r.revenue, real: r.kind === "actual" })),
    scenarios: SCENARIO_KEYS.map((k) => {
      const t = totalsOf(scenarios[k]);
      const past = rows.filter((r) => r.kind === "actual");
      return { key: k, revenue: t.revenue + past.reduce((s, r) => s + r.revenue, 0), newCustomers: t.newCustomers + past.reduce((s, r) => s + r.newCustomers, 0), endMrr: t.endMrr };
    }),
    budget: budget
      ? {
          revenue: budget.reduce((s, m) => s + m.revenue, 0),
          costs: budget.reduce((s, m) => s + m.costs, 0),
          result: budget.reduce((s, m) => s + m.result, 0),
          lowest: budget.reduce((min, m) => (m.cash < min.cash ? m : min), budget[0]),
          endCash: budget[budget.length - 1].cash,
          firstProfit: budget.find((m, i) => m.result >= 0 && budget.slice(i).every((x) => x.result >= 0))?.ym ?? null,
          lines: plan.costs
            .map((c, i) => ({ name: c.name, total: budget.reduce((s, m) => s + m.byLine[i], 0) }))
            .filter((l) => l.total > 0)
            .sort((x, y) => y.total - x.total),
        }
      : null,
  };
  return <PlanSlides data={data} />;
}
