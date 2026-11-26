import "server-only";
import { prisma } from "@/lib/db";
import { dealName } from "@/lib/labels";
import { forecastHistory, loadPlan, mergedAssumptions } from "@/lib/forecast-data";
import { goalPeriodEnd } from "@/lib/goals-data";
import { meetingsForSales } from "@/lib/forecast";

/*
 * Min dag: one seller's day - only their own deals, meetings and tasks (the
 * page asks with getCurrentUser, and every query here is scoped to that id).
 * Today's targets are worked back from their own goal when they have one,
 * otherwise from the year's plan (Prognose): meetings per seller per week.
 *
 * meetingDate and filmingAt are stored as wall-clock time (10:00 in Denmark
 * is 10:00Z), so "today" for them is the Danish date's UTC day; real
 * timestamps (activity, contracts) are turned into Danish dates.
 */

const dkDay = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" });
const DAY = 86_400_000;

export type MyDayItem = { id: string; dealId: string | null; title: string; sub: string; time?: string; days?: number; late?: boolean };
export type MyDay = {
  today: string;
  weekday: string;
  target: { perDay: number; perWeek: number; source: string };
  bookedToday: number;
  bookedWeek: number;
  soldWeek: number;
  meetings: MyDayItem[];
  filmings: MyDayItem[];
  tasks: MyDayItem[];
  contracts: MyDayItem[];
  noNextStep: MyDayItem[];
  /** Signed, not filmed yet, and the filming brief isn't filled in - the one filming needs it. */
  briefMissing: MyDayItem[];
  leadsWaiting: number;
};

/** Weekdays (Mon-Fri) from the Danish date `from` through `to`, both included. */
export function workdaysBetween(from: string, to: string): number {
  let n = 0;
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += DAY) {
    const wd = new Date(t).getUTCDay();
    if (wd !== 0 && wd !== 6) n++;
  }
  return n;
}

export async function myDay(user: { id: string; name: string; role: string }, now = new Date()): Promise<MyDay> {
  const today = dkDay(now);
  const dayStart = new Date(`${today}T00:00:00Z`);
  const dayEnd = new Date(dayStart.getTime() + DAY);
  const monday = new Date(dayStart.getTime() - ((dayStart.getUTCDay() + 6) % 7) * DAY);
  const mondayKey = monday.toISOString().slice(0, 10);

  const [meetings, filmings, tasks, contracts, open, booked, soldWeek, leadsWaiting, goals, noBrief] = await Promise.all([
    prisma.deal.findMany({
      where: { ownerId: user.id, meetingDate: { gte: dayStart, lt: dayEnd } },
      orderBy: { meetingDate: "asc" },
      select: { id: true, companyName: true, displayName: true, meetingDate: true, meetingDurationMinutes: true, meetingOnline: true, address: true, contactName: true },
    }),
    prisma.deal.findMany({
      where: { filmingAt: { gte: dayStart, lt: dayEnd }, filmingCrewIds: { contains: user.id } },
      orderBy: { filmingAt: "asc" },
      select: { id: true, companyName: true, displayName: true, filmingAt: true, filmingDurationMinutes: true, address: true },
    }),
    prisma.task.findMany({
      where: { done: false, dueDate: { lt: dayEnd }, OR: [{ assigneeId: user.id }, { assigneeId: null, createdById: user.id }] },
      orderBy: { dueDate: "asc" },
      take: 30,
      select: { id: true, title: true, dueDate: true, dealId: true, deal: { select: { companyName: true, displayName: true } } },
    }),
    prisma.deal.findMany({
      where: { ownerId: user.id, stage: "CONTRACT_SENT" },
      orderBy: { contractSentAt: "asc" },
      select: { id: true, companyName: true, displayName: true, contractSentAt: true, contractViewedAt: true },
    }),
    prisma.deal.findMany({
      where: {
        ownerId: user.id,
        inLeadInbox: false,
        OR: [{ stage: "FOLLOW_UP" }, { stage: "MEETING_BOOKED", meetingDate: { lt: dayStart } }],
        tasks: { none: { done: false } },
      },
      orderBy: { updatedAt: "asc" },
      take: 12,
      select: { id: true, companyName: true, displayName: true, stage: true, meetingDate: true, updatedAt: true },
    }),
    prisma.activityEvent.findMany({ where: { type: "DEAL_STAGE_MEETING_BOOKED", actorId: user.id, createdAt: { gte: new Date(monday.getTime() - DAY) } }, select: { createdAt: true } }),
    prisma.deal.count({ where: { ownerId: user.id, soldAt: { gte: new Date(monday.getTime() - 2 * 3600_000) } } }),
    prisma.deal.count({ where: { ownerId: user.id, inLeadInbox: true, stage: { in: ["LEAD", "CONTACTED"] } } }),
    prisma.goal.findMany({ where: { userId: user.id, metric: "MEETINGS_BOOKED" } }),
    prisma.deal.findMany({
      where: { ownerId: user.id, stage: { in: ["CONTRACT_SIGNED", "FILMING_BOOKED"] }, contractSignedAt: { not: null }, OR: [{ filmingBrief: null }, { filmingDrone: null }] },
      orderBy: { contractSignedAt: "asc" },
      select: { id: true, companyName: true, displayName: true, contractSignedAt: true, filmingAt: true },
    }),
  ]);

  // Today's target: their own meetings goal when it's running, else the plan's meetings per seller.
  let target: MyDay["target"] | null = null;
  const goal = goals.find((g) => now >= g.month && now <= goalPeriodEnd(g.period, g.month));
  if (goal) {
    const end = goalPeriodEnd(goal.period, goal.month);
    const done = await prisma.deal.count({ where: { ownerId: user.id, meetingDate: { gte: goal.month, lte: end } } });
    const left = Math.max(0, goal.targetValue - done);
    const days = Math.max(1, workdaysBetween(today, dkDay(end)));
    target = { perDay: left / days, perWeek: Math.min(left, (left / days) * 5), source: `Dit mål: ${goal.targetValue} møder, ${left} tilbage` };
  }
  if (!target) {
    const plan = await loadPlan(now.getFullYear());
    const history = await forecastHistory(now, plan.window ?? undefined);
    const a = mergedAssumptions(history, plan);
    // A sales goal in kroner: the meetings it takes, worked back with the close rate and the deal size.
    const forGoal = plan.salesGoal ? meetingsForSales(plan.salesGoal, a) : null;
    target = forGoal
      ? { perDay: forGoal / 5, perWeek: forGoal, source: `Salgsmålet: solgt for ${plan.salesGoal.toLocaleString("da-DK")} kr. om måneden` }
      : { perDay: a.meetingsPerSellerWeek / 5, perWeek: a.meetingsPerSellerWeek, source: `Årets plan: ${a.meetingsPerSellerWeek.toLocaleString("da-DK")} møder om ugen pr. sælger` };
  }

  const hhmm = (d: Date) => `${String(d.getUTCHours()).padStart(2, "0")}.${String(d.getUTCMinutes()).padStart(2, "0")}`;
  const ago = (d: Date) => Math.max(0, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dkDay(d)}T00:00:00Z`)) / DAY));
  const bookedDays = booked.map((e) => dkDay(e.createdAt));

  return {
    today,
    weekday: new Intl.DateTimeFormat("da-DK", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Copenhagen" }).format(now),
    target,
    bookedToday: bookedDays.filter((d) => d === today).length,
    bookedWeek: bookedDays.filter((d) => d >= mondayKey).length,
    soldWeek,
    meetings: meetings.map((m) => ({
      id: m.id,
      dealId: m.id,
      title: dealName(m),
      time: hhmm(m.meetingDate!),
      sub: [m.meetingOnline ? "Online" : m.address, m.contactName, `${m.meetingDurationMinutes} min.`].filter(Boolean).join(", "),
    })),
    filmings: filmings.map((f) => ({ id: f.id, dealId: f.id, title: dealName(f), time: hhmm(f.filmingAt!), sub: [f.address, f.filmingDurationMinutes ? `${Math.round(f.filmingDurationMinutes / 60)} timer` : null].filter(Boolean).join(", ") })),
    tasks: tasks.map((t) => {
      const late = Boolean(t.dueDate && dkDay(t.dueDate) < today);
      return { id: t.id, dealId: t.dealId, title: t.title, sub: t.deal ? dealName(t.deal) : "", late, days: t.dueDate ? ago(t.dueDate) : 0 };
    }),
    contracts: contracts.map((c) => ({
      id: c.id,
      dealId: c.id,
      title: dealName(c),
      days: c.contractSentAt ? ago(c.contractSentAt) : 0,
      sub: c.contractViewedAt ? `Åbnet ${ago(c.contractViewedAt) === 0 ? "i dag" : `for ${ago(c.contractViewedAt)} dage siden`}` : "Ikke åbnet endnu",
      late: Boolean(c.contractSentAt && ago(c.contractSentAt) >= 3),
    })),
    briefMissing: noBrief.map((d) => ({
      id: d.id,
      dealId: d.id,
      title: dealName(d),
      sub: d.filmingAt ? "Filmning booket - optageren mangler briefen" : "Underskrevet - skriv hvad der er aftalt om filmning og drone",
      days: d.contractSignedAt ? ago(d.contractSignedAt) : 0,
      late: Boolean(d.filmingAt),
    })),
    noNextStep: open.map((d) => ({
      id: d.id,
      dealId: d.id,
      title: dealName(d),
      days: ago(d.meetingDate && d.stage === "MEETING_BOOKED" ? d.meetingDate : d.updatedAt),
      sub: d.stage === "FOLLOW_UP" ? "Opfølgning" : "Møde holdt",
    })),
    leadsWaiting,
  };
}
