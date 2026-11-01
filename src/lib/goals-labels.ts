import type { GoalMetric, GoalPeriod } from "@prisma/client";

/* Goals' names and types - no database here, so client components can import them (goals-data.ts has the queries). */

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
