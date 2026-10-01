import { prisma } from "@/lib/db";
import { startOfMonth, startOfQuarter, startOfYear, startOfDay, endOfMonth, endOfQuarter, endOfYear, isWithinInterval } from "date-fns";
import type { GoalMetric, GoalPeriod } from "@prisma/client";
import { contractedContractValue } from "@/lib/labels";

/// Same definition of "currently sold/active" as the dashboard's own "Solgt
/// i alt" stat tile (src/lib/dashboard-data.ts) - kept in sync by hand since
/// duplicating a 3-item array beats importing a whole dashboard-data module
/// just for this one constant.
const SOLD_STAGES = ["LIVE", "CONTRACT_SIGNED", "FILMED"] as const;

export const goalMetricLabels: Record<GoalMetric, string> = {
  MEETINGS_BOOKED: "Møder booket",
  ESTABLISHMENT_FEE: "Etableringsgebyr solgt",
  MRR_SOLD: "MRR solgt",
  DEALS_SOLD: "Antal solgt",
  TOTAL_SOLD: "Solgt i alt",
};

export const goalMetricIsMoney: Record<GoalMetric, boolean> = {
  MEETINGS_BOOKED: false,
  ESTABLISHMENT_FEE: true,
  MRR_SOLD: true,
  DEALS_SOLD: false,
  TOTAL_SOLD: true,
};

export const goalPeriodLabels: Record<GoalPeriod, string> = {
  MONTH: "Denne måned",
  QUARTER: "Dette kvartal",
  REST_OF_YEAR: "Resten af året",
  YEAR: "Hele året",
};

/** The start a fresh goal's `month` field should be saved with, for the
 * given period - recomputed every time a goal is (re-)saved (see
 * upsertGoal), not just once at first creation. */
export function goalPeriodStart(period: GoalPeriod, now: Date = new Date()): Date {
  switch (period) {
    case "MONTH":
      return startOfMonth(now);
    case "QUARTER":
      return startOfQuarter(now);
    case "YEAR":
      return startOfYear(now);
    case "REST_OF_YEAR":
      // Literally "the rest of the year" - counts from whenever the goal is
      // set, not retroactively from January 1st.
      return startOfDay(now);
  }
}

/** Where a goal's period ends, given its stored `month` (start). MONTH and
 * QUARTER end at their own natural boundary; REST_OF_YEAR and YEAR both run
 * through December 31st of the start date's year. */
export function goalPeriodEnd(period: GoalPeriod, start: Date): Date {
  switch (period) {
    case "MONTH":
      return endOfMonth(start);
    case "QUARTER":
      return endOfQuarter(start);
    case "REST_OF_YEAR":
    case "YEAR":
      return endOfYear(start);
  }
}

export type GoalWithProgress = {
  id: string;
  userId: string | null;
  userName: string | null;
  metric: GoalMetric;
  period: GoalPeriod;
  targetValue: number;
  currentValue: number;
  canEdit: boolean;
};

export async function getGoalsForDashboard(viewer: { id: string; role: string }): Promise<GoalWithProgress[]> {
  const now = new Date();
  // Every supported period starts no earlier than January 1st of the
  // current year and ends no later than December 31st of it - safe, simple
  // bounds for the one deals query every goal's progress is computed from.
  const yearStart = startOfYear(now);
  const yearEnd = endOfYear(now);

  const allGoals = await prisma.goal.findMany({
    where: viewer.role === "ADMIN" ? {} : { OR: [{ userId: viewer.id }, { userId: null }] },
    include: { user: true },
    orderBy: [{ userId: { sort: "asc", nulls: "first" } }],
  });

  // Only goals whose own period actually covers today - an old "Denne
  // måned" goal from last month, or a "Dette kvartal" one from last
  // quarter, has simply expired rather than still showing stale progress.
  const goals = allGoals.filter((g) => isWithinInterval(now, { start: g.month, end: goalPeriodEnd(g.period, g.month) }));
  if (goals.length === 0) return [];

  const deals = await prisma.deal.findMany({
    where: {
      OR: [{ meetingDate: { gte: yearStart, lte: yearEnd } }, { soldAt: { gte: yearStart, lte: yearEnd } }],
    },
    select: { ownerId: true, meetingDate: true, soldAt: true, saleAmount: true, establishmentFee: true },
  });

  // TOTAL_SOLD ("Solgt i alt") is a running total, not "how much happened in
  // this window" - same currently-sold/active snapshot as the dashboard's
  // own stat tile, independent of the goal's own period (which only sets
  // the deadline, e.g. "reach this by year end", not a filter on which
  // deals count). Needs its own query: the one above excludes anything sold
  // before this year, which would silently undercount a company whose
  // existing customer base predates it.
  const soldSnapshotDeals = await prisma.deal.findMany({
    where: { stage: { in: [...SOLD_STAGES] } },
    select: {
      ownerId: true,
      saleAmount: true,
      establishmentFee: true,
      bindingMonths: true,
      billingStartDate: true,
      liveAt: true,
      churnedAt: true,
      contractEndDate: true,
    },
  });

  function computeValue(metric: GoalMetric, ownerId: string | null, start: Date, end: Date): number {
    const scoped = ownerId ? deals.filter((d) => d.ownerId === ownerId) : deals;
    switch (metric) {
      case "MEETINGS_BOOKED":
        return scoped.filter((d) => d.meetingDate && isWithinInterval(d.meetingDate, { start, end })).length;
      case "DEALS_SOLD":
        return scoped.filter((d) => d.soldAt && isWithinInterval(d.soldAt, { start, end })).length;
      case "MRR_SOLD":
        return scoped
          .filter((d) => d.soldAt && isWithinInterval(d.soldAt, { start, end }))
          .reduce((sum, d) => sum + (d.saleAmount ?? 0), 0);
      case "ESTABLISHMENT_FEE":
        return scoped
          .filter((d) => d.soldAt && isWithinInterval(d.soldAt, { start, end }))
          .reduce((sum, d) => sum + (d.establishmentFee ?? 0), 0);
      case "TOTAL_SOLD": {
        const snapshot = ownerId ? soldSnapshotDeals.filter((d) => d.ownerId === ownerId) : soldSnapshotDeals;
        return snapshot.reduce((sum, d) => sum + (d.establishmentFee ?? 0) + contractedContractValue(d, now), 0);
      }
    }
  }

  return goals.map((g) => ({
    id: g.id,
    userId: g.userId,
    userName: g.user?.name ?? null,
    metric: g.metric,
    period: g.period,
    targetValue: g.targetValue,
    currentValue: computeValue(g.metric, g.userId, g.month, goalPeriodEnd(g.period, g.month)),
    canEdit: viewer.role === "ADMIN" || g.userId === viewer.id,
  }));
}
