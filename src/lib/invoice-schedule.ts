import { addMonths, addDays, endOfQuarter, differenceInCalendarDays, subMonths } from "date-fns";

export type BillingPeriod = {
  /** 1-based sequential order within the term (never a literal calendar quarter number). */
  index: number;
  startDate: Date;
  endDate: Date;
  /** When the invoice draft should be created for this period. */
  draftTriggerDate: Date;
};

/**
 * Splits a contract's billing life into calendar-quarter-aligned periods
 * (Jan-Mar, Apr-Jun, Jul-Sep, Oct-Dec), from `billingStartDate` through
 * `until`. The period containing the end of the binding period (`billingStartDate`
 * + `bindingMonths`) is always split there, so the original contract value
 * reconciles exactly against the periods before it - any billing beyond that
 * point ("rolling" past binding, because notice hasn't been given, or because
 * notice was given but the effective end date falls later) continues in full
 * calendar quarters, capped at `until`.
 *
 * Full quarters are drafted in Dinero on the 22nd of the month before they
 * start (e.g. a quarter starting 1 April is drafted 22 March), so the
 * customer/accounting has it ready ahead of time. A stub period has no
 * such lead time available and is drafted immediately once due.
 */
export function computeBillingPeriods(billingStartDate: Date, bindingMonths: number, until: Date): BillingPeriod[] {
  const contractEnd = addMonths(billingStartDate, bindingMonths);
  const periods: BillingPeriod[] = [];

  let cursor = billingStartDate;
  let index = 1;

  while (cursor < until) {
    const quarterEnd = endOfQuarter(cursor);
    let periodEnd = quarterEnd < until ? quarterEnd : until;

    // Force a split exactly at the binding period's end, so the periods up
    // to it always sum to the original contract value.
    if (cursor < contractEnd && periodEnd > contractEnd) {
      periodEnd = contractEnd;
    }

    // The first period bills as soon as it's due (no lead time exists before
    // something that already started). Every period after that is a full
    // quarter, drafted on the 22nd of the month before it starts.
    const draftTriggerDate =
      index === 1
        ? billingStartDate
        : (() => {
            const monthBefore = subMonths(cursor, 1);
            return new Date(monthBefore.getFullYear(), monthBefore.getMonth(), 22);
          })();

    periods.push({ index, startDate: cursor, endDate: periodEnd, draftTriggerDate });
    cursor = addDays(periodEnd, 1);
    index++;
  }

  return periods;
}

/**
 * Splits the original contract value proportionally across the periods that
 * fall within the binding period (by day length, so a short stub period is
 * charged less than a full quarter) - the rounding remainder is absorbed
 * into the last of those so the sum always equals the total exactly. Any
 * periods billed after the binding period ends ("rolling" continuation) are
 * charged at that same effective daily rate, since the contract simply
 * continues on its existing terms until it's actually terminated.
 */
export function computePeriodAmounts(
  totalAmount: number,
  periods: BillingPeriod[],
  billingStartDate: Date,
  bindingMonths: number
): number[] {
  const contractEnd = addMonths(billingStartDate, bindingMonths);
  const originalCount = periods.filter((p) => p.startDate < contractEnd).length;
  const original = periods.slice(0, originalCount);
  const rolling = periods.slice(originalCount);

  const originalDays = original.map((p) => differenceInCalendarDays(p.endDate, p.startDate) + 1);
  const totalOriginalDays = originalDays.reduce((sum, d) => sum + d, 0) || 1;

  const originalAmounts = originalDays.map((days) => Math.floor((totalAmount * days) / totalOriginalDays));
  if (originalAmounts.length > 0) {
    const allocated = originalAmounts.reduce((sum, a) => sum + a, 0);
    originalAmounts[originalAmounts.length - 1] += totalAmount - allocated;
  }

  const dailyRate = totalAmount / totalOriginalDays;
  const rollingAmounts = rolling.map((p) =>
    Math.round(dailyRate * (differenceInCalendarDays(p.endDate, p.startDate) + 1))
  );

  return [...originalAmounts, ...rollingAmounts];
}
