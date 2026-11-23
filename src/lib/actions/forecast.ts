"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { SCENARIO_KEYS, cleanAssumptions, cleanCostLines, type ScenarioKey } from "@/lib/forecast";
import { forecastHistory, loadPlan, mergedAssumptions, planYears, savePlan, scenariosFor } from "@/lib/forecast-data";

/*
 * Prognose and Budget's saving - admins only (the company's money and plans).
 * Whatever comes from the page is checked again here (lib/forecast.ts clean*),
 * and a locked forecast is always worked out anew on the server, never taken
 * from the page.
 */

type Result = { ok: true } | { ok: false; error: string };

async function adminFor(year: unknown): Promise<{ name: string; year: number } | { error: string }> {
  const user = await requireUser();
  if (user.role !== "ADMIN") return { error: "Kun admin kan ændre prognose og budget." };
  const y = Number(year);
  if (!planYears().includes(y)) return { error: "Det år kan ikke planlægges her." };
  return { name: user.name, year: y };
}

function refresh() {
  revalidatePath("/arpo/prognose");
  revalidatePath("/arpo/budget");
  revalidatePath("/arpo/min-dag");
}

/** "Gem tallene": the assumptions set by hand (the rest follow Arpo's history). */
export async function saveForecastAssumptions(year: number, overrides: unknown): Promise<Result> {
  const who = await adminFor(year);
  if ("error" in who) return { ok: false, error: who.error };
  const plan = await loadPlan(who.year);
  await savePlan({ ...plan, overrides: cleanAssumptions(overrides), updatedAt: new Date().toISOString(), updatedBy: who.name });
  refresh();
  return { ok: true };
}

/** "Gem som årets prognose": the scenario's months frozen, to hold the real year up against. */
export async function lockForecast(year: number, scenario: string): Promise<Result> {
  const who = await adminFor(year);
  if ("error" in who) return { ok: false, error: who.error };
  if (!SCENARIO_KEYS.includes(scenario as ScenarioKey)) return { ok: false, error: "Ukendt scenarie." };
  const [history, plan] = await Promise.all([forecastHistory(), loadPlan(who.year)]);
  const months = scenariosFor(history, plan)[scenario as ScenarioKey];
  if (!months.length) return { ok: false, error: "Året er gået - der er intet at gemme en prognose for." };
  await savePlan({
    ...plan,
    locked: { at: new Date().toISOString(), by: who.name, scenario: scenario as ScenarioKey, assumptions: mergedAssumptions(history, plan), months },
    updatedAt: new Date().toISOString(),
    updatedBy: who.name,
  });
  refresh();
  return { ok: true };
}

export async function unlockForecast(year: number): Promise<Result> {
  const who = await adminFor(year);
  if ("error" in who) return { ok: false, error: who.error };
  const plan = await loadPlan(who.year);
  await savePlan({ ...plan, locked: null, updatedAt: new Date().toISOString(), updatedBy: who.name });
  refresh();
  return { ok: true };
}

/** The budget: cost lines, money in the bank at the year's start, and which scenario it's held against. */
export async function saveBudget(year: number, input: { costs: unknown; startCash: unknown; scenario: unknown }): Promise<Result> {
  const who = await adminFor(year);
  if ("error" in who) return { ok: false, error: who.error };
  const startCash = Number(input.startCash);
  if (!Number.isFinite(startCash) || Math.abs(startCash) > 1e10) return { ok: false, error: "Beløbet i banken er ikke et tal." };
  const scenario = input.scenario === "laast" || SCENARIO_KEYS.includes(input.scenario as ScenarioKey) ? (input.scenario as ScenarioKey | "laast") : "realistisk";
  const plan = await loadPlan(who.year);
  await savePlan({ ...plan, costs: cleanCostLines(input.costs), startCash: Math.round(startCash), budgetScenario: scenario, updatedAt: new Date().toISOString(), updatedBy: who.name });
  refresh();
  return { ok: true };
}
