import { addMonths } from "date-fns";

/*
 * The contract's current period and the last day to give notice, from the
 * contract's terms (section 3): the binding period starts when the product is
 * delivered (billingStartDate) and, unless notice is given with the notice
 * period before its end, the contract renews for another period of the same
 * length - again and again. A contract that doesn't renew (autoRenew off) ends
 * with the binding period; a terminated one on its contractEndDate.
 */

export type ContractTerm =
  | { kind: "not-started" }
  | { kind: "ends"; end: Date; noticeGivenAt: Date | null }
  | {
      kind: "renews";
      /** The running period's end - it renews then, unless notice was given by `noticeBy`. */
      periodEnd: Date;
      noticeBy: Date;
      /** `noticeBy` has passed: the next chance, and the period end it applies to. */
      late: null | { periodEnd: Date; noticeBy: Date };
      months: number;
    };

export function contractTerm(
  d: { billingStartDate: Date | null; bindingMonths: number | null; autoRenew: boolean; noticePeriodMonths: number; terminationNoticeAt: Date | null; contractEndDate: Date | null },
  now: Date = new Date()
): ContractTerm {
  if (d.contractEndDate) return { kind: "ends", end: d.contractEndDate, noticeGivenAt: d.terminationNoticeAt };
  if (!d.billingStartDate || !d.bindingMonths) return { kind: "not-started" };
  if (!d.autoRenew) return { kind: "ends", end: addMonths(d.billingStartDate, d.bindingMonths), noticeGivenAt: null };
  // The running period: the first period end that is still ahead.
  let k = 1;
  while (addMonths(d.billingStartDate, k * d.bindingMonths) <= now && k < 1000) k++;
  const periodEnd = addMonths(d.billingStartDate, k * d.bindingMonths);
  const noticeBy = addMonths(periodEnd, -d.noticePeriodMonths);
  const nextEnd = addMonths(d.billingStartDate, (k + 1) * d.bindingMonths);
  return { kind: "renews", periodEnd, noticeBy, late: noticeBy < now ? { periodEnd: nextEnd, noticeBy: addMonths(nextEnd, -d.noticePeriodMonths) } : null, months: d.bindingMonths };
}
