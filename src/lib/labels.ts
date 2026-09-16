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

export const invoiceStatusLabels: Record<string, string> = {
  PENDING: "Behandles",
  DRAFT_CREATED: "Kladde oprettet",
  FAILED: "Fejlede",
  IMPORTED: "Importeret (historisk)",
};

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
