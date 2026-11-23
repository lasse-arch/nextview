import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { defaultPlanYear, forecastHistory, loadPlan, planYears } from "@/lib/forecast-data";
import { PrognoseView } from "./prognose-view";

/*
 * Virksomheden → Prognose (admin only): the year ahead worked out from the
 * bottom up with Arpo's own history - see lib/forecast.ts for the maths and
 * lib/forecast-data.ts for where the numbers come from.
 */
export default async function PrognosePage({ searchParams }: { searchParams: Promise<{ aar?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/api/auth/session-ended?next=/arpo/prognose");
  if (user.role !== "ADMIN") redirect("/arpo");

  const q = await searchParams;
  const years = planYears();
  const year = years.includes(Number(q.aar)) ? Number(q.aar) : defaultPlanYear();
  const [history, plan] = await Promise.all([forecastHistory(), loadPlan(year)]);

  return <PrognoseView key={year} year={year} years={years} history={history} plan={plan} nowIso={new Date().toISOString()} />;
}
