import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { defaultPlanYear, forecastHistory, loadPlan, planYears, scenariosFor, suggestedCosts } from "@/lib/forecast-data";
import { BudgetView } from "./budget-view";

/*
 * Virksomheden → Budget (admin only): the year's costs held up against the
 * forecast (Prognose) - result, the bank account and when it turns a profit.
 * The cost lines are typed in here; Arpo only knows the income side.
 */
export default async function BudgetPage({ searchParams }: { searchParams: Promise<{ aar?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/api/auth/session-ended?next=/arpo/budget");
  if (user.role !== "ADMIN") redirect("/arpo");

  const q = await searchParams;
  const years = planYears();
  const year = years.includes(Number(q.aar)) ? Number(q.aar) : defaultPlanYear();
  const plan = await loadPlan(year);
  const history = await forecastHistory(new Date(), plan.window ?? undefined);
  const costs = plan.costs.length ? plan.costs : await suggestedCosts();

  return (
    <BudgetView
      key={year}
      year={year}
      years={years}
      actual={history.actual}
      scenarios={scenariosFor(history, plan)}
      locked={plan.locked ? { months: plan.locked.months, scenario: plan.locked.scenario } : null}
      costs={costs}
      suggested={!plan.costs.length}
      startCash={plan.startCash}
      budgetScenario={plan.budgetScenario === "laast" && !plan.locked ? "realistisk" : plan.budgetScenario}
      nowIso={new Date().toISOString()}
    />
  );
}
