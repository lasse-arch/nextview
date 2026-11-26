import type { Employee } from "@prisma/client";

/** Where a person is: the steps of a new one (contract, signature, access), then working, given notice or left. */
export type HrStatus = { label: string; tone: "amber" | "blue" | "green" | "slate" | "rose"; todo: string | null };

export function hrStatus(e: Pick<Employee, "kind" | "endDate" | "noticeGivenAt" | "contractSentAt" | "contractSignedAt">, user: { disabledAt: Date | null }, today: string): HrStatus {
  const end = e.endDate?.toISOString().slice(0, 10);
  if (end && end < today) return { label: "Fratrådt", tone: "slate", todo: null };
  if (e.noticeGivenAt) return { label: `Opsagt, sidste dag ${end?.split("-").reverse().join(".")}`, tone: "rose", todo: null };
  if (user.disabledAt) {
    if (e.kind === "SALARIED" && !e.contractSentAt) return { label: "Mangler kontrakt", tone: "amber", todo: "Send kontrakten" };
    if (e.kind === "SALARIED" && !e.contractSignedAt) return { label: "Venter på underskrift", tone: "blue", todo: null };
    return { label: "Klar til adgang", tone: "amber", todo: "Giv adgang til Arpo" };
  }
  if (e.kind === "SALARIED" && !e.contractSignedAt) return { label: e.contractSentAt ? "Aktiv, kontrakt ikke underskrevet" : "Aktiv, mangler kontrakt", tone: "amber", todo: e.contractSentAt ? null : "Send kontrakten" };
  return { label: "Aktiv", tone: "green", todo: null };
}

export const TONE = {
  amber: "bg-amber-50 text-amber-800",
  blue: "bg-sky-50 text-sky-800",
  green: "bg-emerald-50 text-emerald-700",
  slate: "bg-slate-100 text-slate-500",
  rose: "bg-rose-50 text-rose-700",
} as const;
