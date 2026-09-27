import { addDays, addMonths, addQuarters, endOfDay, endOfMonth, endOfQuarter, startOfDay, startOfMonth } from "date-fns";
import type { CommissionFrequency } from "@prisma/client";

export function calculateCommissionAmount(baseAmount: number, ratePercent: number): number {
  return Math.round((baseAmount * ratePercent) / 100);
}

export type SemiMonthlyPeriod = { start: Date; end: Date };

/** The 1st-15th / 16th-end-of-month period `date` falls in - the two
 * settlement periods a SEMI_MONTHLY commission contract (see Gustav's) uses. */
export function getSemiMonthlyPeriod(date: Date): SemiMonthlyPeriod {
  const year = date.getFullYear();
  const month = date.getMonth();
  if (date.getDate() <= 15) {
    return { start: startOfMonth(date), end: endOfDay(new Date(year, month, 15)) };
  }
  return { start: startOfDay(new Date(year, month, 16)), end: endOfMonth(date) };
}

export function calculateCommissionDueDate(soldAt: Date, frequency: CommissionFrequency): Date {
  switch (frequency) {
    case "MONTHLY":
      return endOfMonth(addMonths(soldAt, 1));
    case "QUARTERLY":
      return endOfQuarter(addQuarters(soldAt, 1));
    // Settled at the end of the very period the sale falls in (not the next
    // one) - the whole point of a twice-monthly cadence is faster
    // settlement, matching "provisionen opgøres ... for følgende perioder"
    // in the contract rather than adding a further period of runway.
    case "SEMI_MONTHLY":
      return getSemiMonthlyPeriod(soldAt).end;
    case "ONE_TIME":
    default:
      return addDays(soldAt, 30);
  }
}

export function isCommissionOverdue(dueDate: Date | null, paidAt: Date | null): boolean {
  if (paidAt || !dueDate) return false;
  return dueDate.getTime() < Date.now();
}
