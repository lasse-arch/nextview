import { test } from "node:test";
import assert from "node:assert/strict";
import { absenceDays, earnedHolidayDays, easter, holidayName, holidayYear, monthsBack, normMinutes, parseHours, prefillMinutes, weekNumber, workWarnings, type EmployeeTerms } from "./hr";

const E: EmployeeTerms = { startDate: "2026-01-01", endDate: null, weeklyMinutes: 37 * 60, workDays: [1, 2, 3, 4, 5] };

test("easter and the Danish holidays", () => {
  assert.equal(easter(2026), "2026-04-05");
  assert.equal(easter(2027), "2027-03-28");
  assert.equal(holidayName("2026-04-03"), "Langfredag");
  assert.equal(holidayName("2026-05-14"), "Kristi himmelfartsdag");
  assert.equal(holidayName("2026-05-25"), "2. pinsedag");
  assert.equal(holidayName("2026-05-01"), null); // Store bededag is gone (it would have been 1 May 2026)
  assert.equal(holidayName("2023-05-05"), "Store bededag");
});

test("norm: 37 hours spread on Monday-Friday, none on holidays, weekends or outside the employment", () => {
  assert.equal(normMinutes(E, "2026-11-23"), 444); // 7.4 h
  assert.equal(normMinutes(E, "2026-11-22"), 0); // Sunday
  assert.equal(normMinutes(E, "2026-12-25"), 0); // Juledag
  assert.equal(normMinutes(E, "2025-12-31"), 0); // before start
  assert.equal(normMinutes({ ...E, endDate: "2026-06-30" }, "2026-07-01"), 0);
  assert.equal(normMinutes({ ...E, weeklyMinutes: 20 * 60, workDays: [1, 3] }, "2026-11-25"), 600); // 20 h on two days
});

test("prefill takes approved absence away (half a day by half)", () => {
  const a = [{ kind: "VACATION", from: "2026-11-23", to: "2026-11-24", halfDay: false, status: "APPROVED" }];
  assert.equal(prefillMinutes(E, "2026-11-23", a), 0);
  assert.equal(prefillMinutes(E, "2026-11-25", a), 444);
  assert.equal(prefillMinutes(E, "2026-11-23", [{ ...a[0], halfDay: true }]), 222);
  assert.equal(prefillMinutes(E, "2026-11-23", [{ ...a[0], status: "REQUESTED" }]), 444);
});

test("absence days count only working days", () => {
  // Mon 21 Dec - Sun 3 Jan 2027: 25, 26 Dec and 1 Jan are holidays, weekends don't count.
  assert.equal(absenceDays(E, { from: "2026-12-21", to: "2027-01-03", halfDay: false }), 8);
  assert.equal(absenceDays(E, { from: "2026-11-23", to: "2026-11-27", halfDay: true }), 2.5);
});

test("holiday year and 2.08 days a month", () => {
  assert.deepEqual(holidayYear("2026-11-26"), { from: "2026-09-01", to: "2027-08-31", label: "2026/27" });
  assert.equal(holidayYear("2026-08-31").label, "2025/26");
  assert.equal(earnedHolidayDays(E, "2026-09-01", "2026-11-26"), 4.16); // Sep + Oct ended
  assert.equal(earnedHolidayDays(E, "2026-09-01", "2027-08-31"), 24.96);
  // Started 16 September: half of September.
  assert.equal(earnedHolidayDays({ startDate: "2026-09-16", endDate: null }, "2026-09-01", "2026-09-30"), 1.04);
});

test("warnings: 48 hours on average, 13-hour days, a day off every 7 days", () => {
  const days = new Map<string, number>();
  for (let i = 0; i < 7; i++) days.set(`2026-11-${String(16 + i).padStart(2, "0")}`, 8 * 60);
  const w = workWarnings(days, "2026-11-26");
  assert.ok(w.some((x) => x.kind === "dayoff"));
  assert.ok(!w.some((x) => x.kind === "avg48"));
  days.set("2026-11-24", 14 * 60);
  assert.ok(workWarnings(days, "2026-11-26").some((x) => x.kind === "rest"));
  const heavy = new Map<string, number>();
  for (let d = 0; d < 125; d++) heavy.set(new Date(Date.UTC(2026, 6, 25 + d)).toISOString().slice(0, 10), weekdayOk(d) ? 11 * 60 : 0);
  assert.ok(workWarnings(heavy, "2026-11-26").some((x) => x.kind === "avg48"));
});
const weekdayOk = (d: number) => d % 7 < 5;

test("parse hours and week numbers, months back", () => {
  assert.equal(parseHours("7,4"), 444);
  assert.equal(parseHours("7:24"), 444);
  assert.equal(parseHours("25"), null);
  assert.equal(parseHours(""), 0);
  assert.equal(weekNumber("2026-11-26"), 48);
  assert.equal(weekNumber("2027-01-01"), 53);
  assert.equal(monthsBack("2026-06-30", 4), "2026-02-28");
});

test("notice under funktionærloven", async () => {
  const { noticeEnd } = await import("./hr");
  // Within the first 5 months: 1 month to the end of a month.
  assert.equal(noticeEnd("SALARIED", "2026-09-01", null, "2026-11-26", "employer")?.lastDay, "2026-12-31");
  // In probation (agreed, within 3 months): 14 days.
  assert.equal(noticeEnd("SALARIED", "2026-09-01", "2026-11-30", "2026-11-26", "employer")?.lastDay, "2026-12-10");
  // After 1 year: 3 months.
  assert.equal(noticeEnd("SALARIED", "2025-09-01", null, "2026-11-26", "employer")?.lastDay, "2027-02-28");
  // After 3 years: 4 months.
  assert.equal(noticeEnd("SALARIED", "2023-09-01", null, "2026-11-26", "employer")?.months, 4);
  // After 10 years: 6 months.
  assert.equal(noticeEnd("SALARIED", "2016-01-01", null, "2026-11-26", "employer")?.months, 6);
  // The employee: 1 month to the end of a month.
  assert.equal(noticeEnd("SALARIED", "2016-01-01", null, "2026-11-26", "employee")?.lastDay, "2026-12-31");
  assert.equal(noticeEnd("FREELANCE", "2026-01-01", null, "2026-11-26", "employer"), null);
});

test("the 120-days rule counts calendar days of sickness in the last 12 months", async () => {
  const { sickDays12Months } = await import("./hr");
  const sick = (from: string, to: string, kind = "SICK") => ({ kind, from, to, halfDay: false, status: "APPROVED" });
  assert.equal(sickDays12Months([sick("2026-11-02", "2026-11-15")], "2026-11-26"), 14); // weekends count
  assert.equal(sickDays12Months([sick("2025-11-20", "2025-11-30")], "2026-11-26"), 4); // only the part inside 12 months
  assert.equal(sickDays12Months([sick("2026-11-20", "2026-12-31")], "2026-11-26"), 7); // not days still to come
  assert.equal(sickDays12Months([sick("2026-11-02", "2026-11-15", "CHILD_SICK")], "2026-11-26"), 0);
});

test("kørepenge: 3,94 kr. per km up to 20,000 km in 2026, 2,28 above", async () => {
  const { mileagePay, mileageRate } = await import("./hr");
  assert.equal(mileagePay(2026, 0, 100), 394);
  assert.equal(mileagePay(2026, 19_950, 100), 50 * 3.94 + 50 * 2.28);
  assert.equal(mileagePay(2026, 25_000, 10), 22.8);
  assert.equal(mileageRate(2027).upTo20000, 4.13);
  assert.equal(mileageRate(2030).upTo20000, 4.13); // the latest known until a new year is added
});
