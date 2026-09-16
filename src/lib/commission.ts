import { addDays, addMonths, addQuarters, endOfMonth, endOfQuarter } from "date-fns";
import type { CommissionFrequency } from "@prisma/client";

export function calculateCommissionAmount(baseAmount: number, ratePercent: number): number {
  return Math.round((baseAmount * ratePercent) / 100);
}

export function calculateCommissionDueDate(soldAt: Date, frequency: CommissionFrequency): Date {
  switch (frequency) {
    case "MONTHLY":
      return endOfMonth(addMonths(soldAt, 1));
    case "QUARTERLY":
      return endOfQuarter(addQuarters(soldAt, 1));
    case "ONE_TIME":
    default:
      return addDays(soldAt, 30);
  }
}

export function isCommissionOverdue(dueDate: Date | null, paidAt: Date | null): boolean {
  if (paidAt || !dueDate) return false;
  return dueDate.getTime() < Date.now();
}
