import { differenceInCalendarMonths, getQuarter, getYear, endOfMonth } from "date-fns";

const DANISH_MONTHS = [
  "januar",
  "februar",
  "marts",
  "april",
  "maj",
  "juni",
  "juli",
  "august",
  "september",
  "oktober",
  "november",
  "december",
];

/** "a, b og c" - the Danish convention for joining a list in running text. */
function joinDanish(items: string[]): string {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} og ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} og ${items[items.length - 1]}`;
}

/**
 * "Q4 Kvartal oktober, november og december 2026" for a period starting on
 * the 1st of a quarter, or "Q3 Kvartal 4. juli til 31. juli, august og
 * september 2026" for one starting mid-quarter (e.g. the first, stub period
 * of a contract that begins partway through a quarter). Approximates the
 * period's end as the end of its calendar quarter, since we don't persist
 * the exact end date on the Invoice row - accurate for every period except
 * one cut short by termination or the rolling-horizon cap.
 */
export function invoicePeriodLabel(scheduledDate: Date): string {
  const quarter = getQuarter(scheduledDate);
  const year = getYear(scheduledDate);
  const quarterMonths = DANISH_MONTHS.slice((quarter - 1) * 3, quarter * 3);
  const startMonth = DANISH_MONTHS[scheduledDate.getMonth()];

  if (scheduledDate.getDate() === 1) {
    return `Q${quarter} Kvartal ${joinDanish(quarterMonths)} ${year}`;
  }

  const lastDayOfStartMonth = endOfMonth(scheduledDate).getDate();
  const remainingMonths = quarterMonths.slice(quarterMonths.indexOf(startMonth) + 1);
  const monthsSuffix = remainingMonths.length > 0 ? `, ${joinDanish(remainingMonths)}` : "";
  return `Q${quarter} Kvartal ${scheduledDate.getDate()}. ${startMonth} til ${lastDayOfStartMonth}. ${startMonth}${monthsSuffix} ${year}`;
}

/** "Q3 Kvartal" - the short form shown as the visible label; the precise date range from invoicePeriodLabel belongs in a hover tooltip instead. */
export function invoiceQuarterShortLabel(scheduledDate: Date): string {
  return `Q${getQuarter(scheduledDate)} Kvartal`;
}

export const stageOrder = [
  "LEAD",
  "CONTACTED",
  "MEETING_BOOKED",
  "CONTRACT_SENT",
  "CONTRACT_SIGNED",
  "FILMED",
  "LIVE",
  "LOST",
] as const;

export const stageLabels: Record<string, string> = {
  LEAD: "Lead",
  CONTACTED: "Kontaktet",
  MEETING_BOOKED: "Møde booket",
  CONTRACT_SENT: "Kontrakt sendt",
  CONTRACT_SIGNED: "Kontrakt underskrevet",
  FILMED: "Filmet",
  LIVE: "Live",
  LOST: "Tabt",
};

export const importTypeLabels: Record<string, string> = {
  MANUAL: "Manuel",
  CSV: "CSV-import",
  GOOGLE_DOCS: "Google Docs",
};

export const noteKindLabels: Record<string, string> = {
  MANUAL: "Note",
  AI_MEETING: "AI-mødenote",
};

export const commissionFrequencyLabels: Record<string, string> = {
  MONTHLY: "Månedligt",
  QUARTERLY: "Kvartalsvist",
  ONE_TIME: "Engangsudbetaling",
};

export const commissionStatusLabels: Record<string, string> = {
  PENDING: "Afventer",
  DUE: "Forfalden",
  PAID: "Udbetalt",
};

export const contractStatusLabels: Record<string, string> = {
  NONE: "Ingen kontrakt sendt",
  SENT: "Sendt til underskrift",
  VIEWED: "Åbnet af modtager",
  SIGNED: "Underskrevet",
  DECLINED: "Afvist",
  VOIDED: "Annulleret",
};

export const contractEventLabels: Record<string, string> = {
  SENT: "Sendt",
  VIEWED: "Kunden åbnede",
  SIGNED: "Kunden underskrev",
  DECLINED: "Afvist",
  EXPIRED: "Udløbet",
  ARCHIVED: "Annulleret",
  SIGNED_CONTRACT_ARCHIVED: "Underskrevet kontrakt arkiveret",
};

export const invoiceStatusLabels: Record<string, string> = {
  PENDING: "Behandles",
  DRAFT_CREATED: "Kladde oprettet",
  FAILED: "Fejlede",
  IMPORTED: "Importeret (historisk)",
  SENT_MANUALLY: "Sendt manuelt",
};

export function dealName(deal: { companyName: string; displayName?: string | null }): string {
  return deal.displayName || deal.companyName;
}

/** Products where we deliver a link the customer/team should be able to open directly. */
export function needsDeliveryLink(productType: string): boolean {
  const p = productType.trim().toLowerCase();
  return p.includes("matterport") || p.includes("hjemmeside") || p.includes("tour");
}

/** saleAmount is the monthly recurring fee; the contract's total value over its binding period is that times bindingMonths. */
export function totalContractValue(deal: { saleAmount: number | null; bindingMonths: number | null }): number {
  return (deal.saleAmount ?? 0) * (deal.bindingMonths ?? 1);
}

/**
 * How many months of a deal's monthly value it's actually contracted for in
 * total - the "sold" duration, not a snapshot of time elapsed:
 *
 * - Not live yet (signed/filmed, billing hasn't started): the plain binding
 *   period - it's fully sold already, just not delivered/billing yet.
 * - Churned: the exact months from billing start to the churn date -
 *   whatever they actually paid for, uncapped by the binding period (billing
 *   rolls on past binding until terminated).
 * - Notice given but not yet churned: the months up to the already-computed
 *   contractEndDate (see computeContractEndDate in actions/deals.ts), which
 *   already accounts for a renewal if notice came too late to exit at the
 *   current term's end.
 * - Still active, no notice ever given: the contract tacitly renews for
 *   another full binding period every time a term boundary passes without
 *   notice, so this counts every full term reached so far (at least one -
 *   the current one) rather than just the original binding period.
 */
export function contractedMonths(
  deal: {
    bindingMonths: number | null;
    billingStartDate: Date | null;
    liveAt: Date | null;
    churnedAt: Date | null;
    contractEndDate: Date | null;
  },
  now: Date
): number {
  const start = deal.billingStartDate ?? deal.liveAt;
  if (!start) return deal.bindingMonths ?? 0;
  if (deal.churnedAt) {
    return Math.max(0, differenceInCalendarMonths(deal.churnedAt, start));
  }
  if (deal.contractEndDate) {
    return Math.max(0, differenceInCalendarMonths(deal.contractEndDate, start));
  }
  const bindingMonths = deal.bindingMonths ?? 0;
  if (bindingMonths <= 0) return 0;
  const elapsed = Math.max(0, differenceInCalendarMonths(now, start));
  const termsSoFar = Math.floor(elapsed / bindingMonths) + 1;
  return termsSoFar * bindingMonths;
}

/** Total contracted value: contractedMonths (see above) times the monthly price. */
export function contractedContractValue(
  deal: {
    saleAmount: number | null;
    bindingMonths: number | null;
    billingStartDate: Date | null;
    liveAt: Date | null;
    churnedAt: Date | null;
    contractEndDate: Date | null;
  },
  now: Date
): number {
  return (deal.saleAmount ?? 0) * contractedMonths(deal, now);
}

export function formatDKK(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "–";
  return new Intl.NumberFormat("da-DK", { style: "currency", currency: "DKK", maximumFractionDigits: 0 }).format(
    amount
  );
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "–";
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("da-DK", { dateStyle: "medium" }).format(d);
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "–";
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("da-DK", { dateStyle: "medium", timeStyle: "short" }).format(d);
}
