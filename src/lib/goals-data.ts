import { prisma } from "@/lib/db";
import { startOfMonth, endOfMonth, isWithinInterval } from "date-fns";
import type { GoalMetric } from "@prisma/client";

export const goalMetricLabels: Record<GoalMetric, string> = {
  MEETINGS_BOOKED: "Møder booket",
  ESTABLISHMENT_FEE: "Etableringsgebyr solgt",
  MRR_SOLD: "MRR solgt",
  DEALS_SOLD: "Antal solgt",
};

export const goalMetricIsMoney: Record<GoalMetric, boolean> = {
  MEETINGS_BOOKED: false,
  ESTABLISHMENT_FEE: true,
  MRR_SOLD: true,
  DEALS_SOLD: false,
};

export type GoalWithProgress = {
  id: string;
  userId: string | null;
  userName: string | null;
  metric: GoalMetric;
  targetValue: number;
  currentValue: number;
  canEdit: boolean;
};

export async function getGoalsForDashboard(viewer: { id: string; role: string }): Promise<GoalWithProgress[]> {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const goals = await prisma.goal.findMany({
    where: {
      month: monthStart,
      ...(viewer.role === "ADMIN" ? {} : { OR: [{ userId: viewer.id }, { userId: null }] }),
    },
    include: { user: true },
    orderBy: [{ userId: { sort: "asc", nulls: "first" } }],
  });

  if (goals.length === 0) return [];

  const deals = await prisma.deal.findMany({
    where: {
      OR: [{ meetingDate: { gte: monthStart, lte: monthEnd } }, { soldAt: { gte: monthStart, lte: monthEnd } }],
    },
    select: { ownerId: true, meetingDate: true, soldAt: true, saleAmount: true, establishmentFee: true },
  });

  function computeValue(metric: GoalMetric, ownerId: string | null): number {
    const scoped = ownerId ? deals.filter((d) => d.ownerId === ownerId) : deals;
    switch (metric) {
      case "MEETINGS_BOOKED":
        return scoped.filter((d) => d.meetingDate && isWithinInterval(d.meetingDate, { start: monthStart, end: monthEnd })).length;
      case "DEALS_SOLD":
        return scoped.filter((d) => d.soldAt && isWithinInterval(d.soldAt, { start: monthStart, end: monthEnd })).length;
      case "MRR_SOLD":
        return scoped
          .filter((d) => d.soldAt && isWithinInterval(d.soldAt, { start: monthStart, end: monthEnd }))
          .reduce((sum, d) => sum + (d.saleAmount ?? 0), 0);
      case "ESTABLISHMENT_FEE":
        return scoped
          .filter((d) => d.soldAt && isWithinInterval(d.soldAt, { start: monthStart, end: monthEnd }))
          .reduce((sum, d) => sum + (d.establishmentFee ?? 0), 0);
    }
  }

  return goals.map((g) => ({
    id: g.id,
    userId: g.userId,
    userName: g.user?.name ?? null,
    metric: g.metric,
    targetValue: g.targetValue,
    currentValue: computeValue(g.metric, g.userId),
    canEdit: viewer.role === "ADMIN" || g.userId === viewer.id,
  }));
}
