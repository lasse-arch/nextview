import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { HISTORY_WINDOWS, defaultPlanYear, forecastHistory, loadPlan, planYears } from "@/lib/forecast-data";
import { PrognoseView } from "./prognose-view";

/*
 * Virksomheden → Prognose (admin only): the year ahead worked out from the
 * bottom up with Arpo's own history - see lib/forecast.ts for the maths and
 * lib/forecast-data.ts for where the numbers come from.
 */
export default async function PrognosePage({ searchParams }: { searchParams: Promise<{ aar?: string; grundlag?: string; maaned?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/api/auth/session-ended?next=/arpo/prognose");
  if (user.role !== "ADMIN") redirect("/arpo");

  const q = await searchParams;
  const years = planYears();
  const year = years.includes(Number(q.aar)) ? Number(q.aar) : defaultPlanYear();
  // One month (?maaned=2026-12): the year it's in.
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(q.maaned ?? "") ? q.maaned! : null;
  const plan = await loadPlan(month ? Number(month.slice(0, 4)) : year);
  const asked = HISTORY_WINDOWS.includes(Number(q.grundlag) as (typeof HISTORY_WINDOWS)[number]) ? Number(q.grundlag) : undefined;
  const history = await forecastHistory(new Date(), asked ?? plan.window ?? undefined);

  return <PrognoseView key={`${year}${month}${history.window}`} year={month ? Number(month.slice(0, 4)) : year} month={month} years={years} history={history} plan={plan} nowIso={new Date().toISOString()} />;
}
