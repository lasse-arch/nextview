import { addMonths, subMonths, addDays, endOfQuarter, startOfMonth, endOfMonth, differenceInCalendarDays } from "date-fns";

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
 * Every period - including the first - is due on the 1st of the quarter it
 * covers. `draftTriggerDate` is when a draft is *allowed* to be created for
 * it - from the 1st of the preceding calendar month onwards (e.g. a quarter
 * starting 1 October can be drafted anytime from 1 September) - giving
 * sellers room to prepare invoices ahead of time without having to wait
 * until the last minute. The invoice's actual Dinero date is a separate
 * concern (see `draftInvoiceLine` in invoice-service.ts): it's always set
 * so Netto+8 lands exactly on the period's start date, regardless of which
 * day within that eligible window the draft actually gets created. For a
 * billingStartDate already in the past (the overwhelmingly common case -
 * it's normally set to "today" when a deal goes Live), that lookback is
 * also already in the past, so the draft is simply due immediately either
 * way - the lead time only actually matters, and only ever helps, when
 * billingStartDate is set ahead of time for a future start.
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

    const draftTriggerDate = startOfMonth(subMonths(cursor, 1));

    periods.push({ index, startDate: cursor, endDate: periodEnd, draftTriggerDate });
    cursor = addDays(periodEnd, 1);
    index++;
  }

  return periods;
}

/**
 * Amount owed for one period, accrued calendar month by calendar month: a
 * month the period fully covers is charged the flat monthly rate regardless
 * of whether it has 28-31 days, and only a month it doesn't fully cover
 * (only possible for the period's first or last month, e.g. billing
 * starting mid-month, or a period cut short by termination) is pro-rated by
 * the days actually covered within that specific month.
 */
function accruedAmount(startDate: Date, endDate: Date, monthlyRate: number): number {
  let total = 0;
  let cursor = startDate;
  while (cursor <= endDate) {
    const monthEnd = endOfMonth(cursor);
    const segmentEnd = monthEnd < endDate ? monthEnd : endDate;
    const daysInMonth = differenceInCalendarDays(monthEnd, startOfMonth(cursor)) + 1;
    const daysCovered = differenceInCalendarDays(segmentEnd, cursor) + 1;
    total += daysCovered >= daysInMonth ? monthlyRate : Math.round((monthlyRate * daysCovered) / daysInMonth);
    cursor = addDays(segmentEnd, 1);
  }
  return total;
}

/**
 * One amount per period, at the deal's flat monthly rate (recovered from
 * totalAmount/bindingMonths) accrued month by month - so every full quarter
 * comes out the same regardless of which months it spans, and only a
 * genuine stub period (billing starting mid-month, or one cut short by
 * termination) is pro-rated for its partial month(s). The periods within
 * the original binding term can end up a few kroner off the exact contract
 * total from independent day-fraction roundings (the very first period,
 * and one truncated right at the binding term's end) - absorbed into the
 * last such period so that sum still reconciles exactly.
 */
export function computePeriodAmounts(
  totalAmount: number,
  periods: BillingPeriod[],
  billingStartDate: Date,
  bindingMonths: number
): number[] {
  const monthlyRate = totalAmount / bindingMonths;
  const amounts = periods.map((p) => accruedAmount(p.startDate, p.endDate, monthlyRate));

  const contractEnd = addMonths(billingStartDate, bindingMonths);
  const originalIndexes = periods.flatMap((p, i) => (p.startDate < contractEnd ? [i] : []));
  if (originalIndexes.length > 0) {
    const allocated = originalIndexes.reduce((sum, i) => sum + amounts[i], 0);
    amounts[originalIndexes[originalIndexes.length - 1]] += totalAmount - allocated;
  }

  return amounts;
}
