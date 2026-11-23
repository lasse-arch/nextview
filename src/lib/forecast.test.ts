import { test } from "node:test";
import assert from "node:assert/strict";
import { FLAT_SEASON, budgetYear, cleanAssumptions, cleanCostLines, forecastYear, totalsOf, yearRows, type Assumptions } from "./forecast";

const A: Assumptions = { sellers: 2, meetingsPerSellerWeek: 5, salesWeeks: 44, closeRate: 25, avgMonthly: 1000, avgEstablishment: 10000, churnPerYear: 0, daysToSign: 0, daysToLive: 0, capacityPerMonth: 0 };
const base = { assumptions: A, season: FLAT_SEASON, start: [], open: [], now: new Date(2026, 11, 1), year: 2027, scenario: "realistisk" as const };

test("meetings and new customers add up over the year", () => {
  const t = totalsOf(forecastYear(base));
  assert.equal(Math.round(t.meetings), 440); // 2 × 5 × 44
  assert.equal(Math.round(t.newCustomers), 110);
  assert.equal(Math.round(t.establishment), 1_100_000);
});

test("the scenarios order: forsigtig < realistisk < ambitiøs", () => {
  const r = (scenario: "forsigtig" | "realistisk" | "ambitios") => totalsOf(forecastYear({ ...base, scenario })).revenue;
  assert.ok(r("forsigtig") < r("realistisk") && r("realistisk") < r("ambitios"));
});

test("today's customers bill until their known end", () => {
  const months = forecastYear({ ...base, assumptions: { ...A, sellers: 0 }, start: [{ monthly: 500, liveFrom: "2026-01-01", endsAt: "2027-03-31" }] });
  assert.equal(months[0].mrr, 500);
  assert.equal(months[2].mrr, 500);
  assert.equal(months[3].mrr, 0);
});

test("capacity holds go-lives back", () => {
  const free = forecastYear(base);
  const capped = forecastYear({ ...base, assumptions: { ...A, capacityPerMonth: 2 } });
  assert.ok(capped[11].customers < free[11].customers);
  assert.ok(capped.every((m, i) => i === 0 || m.customers - capped[i - 1].customers <= 2.0001));
});

test("quarter billing: money comes in at the quarter's start", () => {
  const m = forecastYear({ ...base, assumptions: { ...A, sellers: 0 }, start: [{ monthly: 1000, liveFrom: "2026-01-01", endsAt: null }] });
  assert.equal(m[0].cashIn, 3000);
  assert.equal(m[1].cashIn, 0);
});

test("the budget: costs, result and the bank", () => {
  const months = forecastYear({ ...base, assumptions: { ...A, sellers: 0 }, start: [{ monthly: 1000, liveFrom: "2026-01-01", endsAt: null }] });
  const b = budgetYear(months, [{ id: "x", name: "Løn", kind: "monthly", amount: 400 }, { id: "y", name: "Kamera", kind: "once", amount: 1200, month: 2 }], 100);
  assert.equal(b[0].result, 600);
  assert.equal(b[1].result, -600);
  assert.equal(b[0].cash, 100 + 3000 - 400);
});

test("current year: past months come from the real ones", () => {
  const rows = yearRows(2026, "2026-03", [{ ym: "2026-01", meetings: 5, newCustomers: 1, newMonthly: 1000, establishment: 5000, customers: 3, mrr: 3000, invoiced: 9000 }], []);
  assert.equal(rows[0].kind, "actual");
  assert.equal(rows[0].revenue, 8000);
  assert.equal(rows[0].cashIn, 9000);
});

test("input from the page is cleaned", () => {
  assert.deepEqual(cleanAssumptions({ closeRate: 250, sellers: "x", evil: 1 }), { closeRate: 100 });
  const lines = cleanCostLines([{ kind: "percent", amount: 500, name: "<b>x</b>" }, { kind: "hack", amount: 1 }]);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].amount, 100);
});
