import "server-only";
import type { Absence, Employee } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  absenceDays,
  absenceOn,
  addDays,
  earnedHolidayDays,
  holidayName,
  holidayYear,
  monthsBack,
  normMinutes,
  prefillMinutes,
  todayDk,
  weekOf,
  workWarnings,
  type AbsenceSpan,
  type EmployeeTerms,
  type Ymd,
} from "@/lib/hr";

/* What HR's pages read - the caller has already checked that the viewer may see the employee (lib/hr-access.ts). */

const ymd = (d: Date) => d.toISOString().slice(0, 10);
export const termsOf = (e: Pick<Employee, "startDate" | "endDate" | "weeklyMinutes" | "workDays">): EmployeeTerms => ({
  startDate: ymd(e.startDate),
  endDate: e.endDate ? ymd(e.endDate) : null,
  weeklyMinutes: e.weeklyMinutes,
  workDays: e.workDays,
});
export const spansOf = (list: Pick<Absence, "kind" | "from" | "to" | "halfDay" | "status">[]): AbsenceSpan[] =>
  list.map((a) => ({ kind: a.kind, from: ymd(a.from), to: ymd(a.to), halfDay: a.halfDay, status: a.status }));

export type WeekRow = { date: Ymd; norm: number; prefill: number; minutes: number | null; holiday: string | null; absence: string | null; future: boolean; outside: boolean };

export async function loadWeek(e: Employee, monday: Ymd) {
  const days = weekOf(monday);
  const [saved, week, absences] = await Promise.all([
    prisma.workDay.findMany({ where: { employeeId: e.id, date: { gte: new Date(`${days[0]}T00:00:00Z`), lte: new Date(`${days[6]}T00:00:00Z`) } } }),
    prisma.workWeek.findUnique({ where: { employeeId_weekStart: { employeeId: e.id, weekStart: new Date(`${monday}T00:00:00Z`) } } }),
    prisma.absence.findMany({ where: { employeeId: e.id, status: "APPROVED", from: { lte: new Date(`${days[6]}T00:00:00Z`) }, to: { gte: new Date(`${days[0]}T00:00:00Z`) } } }),
  ]);
  const t = termsOf(e);
  const spans = spansOf(absences);
  const savedOf = new Map(saved.map((w) => [ymd(w.date), w.minutes]));
  const today = todayDk();
  const rows: WeekRow[] = days.map((d) => {
    const a = absenceOn(spans, d);
    return {
      date: d,
      norm: normMinutes(t, d),
      prefill: prefillMinutes(t, d, spans),
      minutes: savedOf.get(d) ?? null,
      holiday: holidayName(d),
      absence: a ? `${a.kind}${a.halfDay ? ":half" : ""}` : null,
      future: d > today,
      outside: d < t.startDate || Boolean(t.endDate && d > t.endDate),
    };
  });
  const approver = week?.approvedById ? await prisma.user.findUnique({ where: { id: week.approvedById }, select: { name: true } }) : null;
  return { rows, week, approverName: approver?.name ?? null };
}

/** The holiday account for the holiday year `day` is in - an overview; the payroll system keeps the official one. */
export function holidayBalance(e: Employee, absences: Pick<Absence, "kind" | "from" | "to" | "halfDay" | "status">[], day: Ymd = todayDk()) {
  const year = holidayYear(day);
  const t = termsOf(e);
  const earned = earnedHolidayDays(t, year.from, day);
  const carry = e.vacationCarryFrom && ymd(e.vacationCarryFrom) === year.from ? e.vacationCarryDays : 0;
  const used = spansOf(absences)
    .filter((a) => a.kind === "VACATION" && a.status === "APPROVED")
    .reduce((n, a) => n + absenceDays(t, a, { from: year.from, to: addDays(year.to, 0) }), 0);
  const planned = spansOf(absences)
    .filter((a) => a.kind === "VACATION" && a.status === "REQUESTED")
    .reduce((n, a) => n + absenceDays(t, a, { from: year.from, to: year.to }), 0);
  const wholeYear = earnedHolidayDays(t, year.from, year.to);
  return { year, earned, carry, used, planned, balance: Math.round((earned + carry - used) * 100) / 100, wholeYear };
}

/** The registered days of the last 4 months, and what they say against the rules. */
export async function warningsFor(e: Employee, today: Ymd = todayDk()) {
  const from = monthsBack(today, 4);
  const days = await prisma.workDay.findMany({ where: { employeeId: e.id, date: { gt: new Date(`${from}T00:00:00Z`), lte: new Date(`${today}T00:00:00Z`) } }, select: { date: true, minutes: true } });
  return workWarnings(new Map(days.map((d) => [ymd(d.date), d.minutes])), today);
}

/** Weeks back from this one that the employee hasn't registered (only weeks they were employed and had working days). */
export async function missingWeeks(e: Employee, today: Ymd = todayDk(), back = 8): Promise<Ymd[]> {
  const t = termsOf(e);
  const weeks = await prisma.workWeek.findMany({ where: { employeeId: e.id, submittedAt: { not: null } }, select: { weekStart: true } });
  const done = new Set(weeks.map((w) => ymd(w.weekStart)));
  const out: Ymd[] = [];
  const thisMonday = addDays(today, 1 - (((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7) + 1));
  for (let i = 1; i <= back; i++) {
    const m = addDays(thisMonday, -7 * i);
    if (done.has(m)) continue;
    if (weekOf(m).some((d) => normMinutes(t, d) > 0)) out.push(m);
  }
  return out;
}

export type TripSuggestion = { key: string; date: string; label: string; address: string; kind: string; dealId: string };

/** The viewer's own meetings and filmings of the last 45 days - to pick a trip from (date, address and purpose filled in). */
export async function tripSuggestions(userId: string): Promise<TripSuggestion[]> {
  const since = new Date(Date.now() - 45 * 86_400_000);
  const now = new Date();
  const sel = { id: true, companyName: true, displayName: true, address: true } as const;
  const [meetings, filmings, refilms] = await Promise.all([
    prisma.deal.findMany({ where: { ownerId: userId, meetingDate: { gte: since, lte: now }, meetingOnline: false, address: { not: null } }, select: { ...sel, meetingDate: true }, orderBy: { meetingDate: "desc" }, take: 40 }),
    prisma.deal.findMany({ where: { filmingAt: { gte: since, lte: now }, filmingCrewIds: { contains: userId }, address: { not: null } }, select: { ...sel, filmingAt: true, filmingCrewIds: true }, orderBy: { filmingAt: "desc" }, take: 40 }),
    prisma.refilming.findMany({ where: { at: { gte: since, lte: now }, crewIds: { contains: userId }, cancelledAt: null }, include: { deal: { select: sel } }, orderBy: { at: "desc" }, take: 40 }),
  ]);
  const name = (d: { companyName: string; displayName: string | null }) => d.displayName ?? d.companyName;
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const out: TripSuggestion[] = [
    ...meetings.map((d) => ({ key: `m${d.id}`, date: day(d.meetingDate!), label: `Møde hos ${name(d)}`, address: d.address!, kind: "Kundebesøg", dealId: d.id })),
    ...filmings.filter((d) => d.filmingCrewIds?.split(",").includes(userId)).map((d) => ({ key: `f${d.id}`, date: day(d.filmingAt!), label: `Filmning hos ${name(d)}`, address: d.address!, kind: "Filmning", dealId: d.id })),
    ...refilms.filter((r) => r.crewIds.split(",").includes(userId) && r.deal.address).map((r) => ({ key: `r${r.id}`, date: day(r.at), label: `Genoptagelse hos ${name(r.deal)}`, address: r.deal.address!, kind: "Genoptagelse", dealId: r.deal.id })),
  ];
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Kørepenge per trip: the approved trips of a calendar year in date order - the first 20,000 km at the higher rate.
 * Returns the amount per trip id, and the km driven that year before `beforeDay` (for a month's account).
 */
export async function tripsOfYear(employeeId: string, year: number) {
  const trips = await prisma.trip.findMany({
    where: { employeeId, status: "APPROVED", date: { gte: new Date(`${year}-01-01T00:00:00Z`), lte: new Date(`${year}-12-31T00:00:00Z`) } },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });
  const { mileagePay } = await import("@/lib/hr");
  const pay = new Map<string, number>();
  let km = 0;
  for (const t of trips) {
    pay.set(t.id, mileagePay(year, km, t.km));
    km += t.km;
  }
  return { trips, pay };
}
