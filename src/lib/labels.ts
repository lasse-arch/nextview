import { differenceInCalendarMonths } from "date-fns";

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
};

export function dealName(deal: { companyName: string; displayName?: string | null }): string {
  return deal.displayName || deal.companyName;
}

/** saleAmount is the monthly recurring fee; the contract's total value over its binding period is that times bindingMonths. */
export function totalContractValue(deal: { saleAmount: number | null; bindingMonths: number | null }): number {
  return (deal.saleAmount ?? 0) * (deal.bindingMonths ?? 1);
}

/**
 * How much of a churned deal's monthly value was actually realized before it
 * churned - counted from when billing started to when the customer churned.
 * Deliberately uncapped by the binding period: billing rolls on past binding
 * until the contract is actually terminated, so a churn after the binding
 * period still represents real months of paid revenue that a binding-period
 * contract value alone wouldn't capture.
 */
export function churnedRealizedContractValue(deal: {
  saleAmount: number | null;
  billingStartDate: Date | null;
  liveAt: Date | null;
  churnedAt: Date | null;
}): number {
  const start = deal.billingStartDate ?? deal.liveAt;
  if (!start || !deal.churnedAt || !deal.saleAmount) return 0;
  const months = Math.max(0, differenceInCalendarMonths(deal.churnedAt, start));
  return deal.saleAmount * months;
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
