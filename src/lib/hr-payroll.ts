import "server-only";
import { prisma } from "@/lib/db";
import { ABSENCE_NAMES, KIND_NAMES, PAY_NAMES, absenceDays, addDays, guaranteeForMonth, normMinutes, registersTime, todayDk, type Ymd } from "@/lib/hr";
import { spansOf, termsOf, tripsOfYear } from "@/lib/hr-data";

/*
 * Lønsedler-grundlag: for a month, what the payroll system needs per person - the pay terms that apply, the
 * registered hours, the absence by kind, and the month's commission (A-income for employees; freelancers invoice
 * theirs). Arpo computes no tax: the payroll system does. Only for an admin - or one employee's own row for "Mig"
 * (`only`, the caller checks it is them).
 */

export type PayrollRow = {
  name: string;
  payrollNumber: string;
  kind: string;
  model: string;
  monthlyKr: number | null;
  hourlyKr: number | null;
  commissionPct: number | null;
  pension: string;
  /** Part of the month employed (1 = all of it) - a monthly salary is paid for that part. */
  employedShare: number;
  normHours: number;
  workedHours: number | null;
  /** Working days in the month (up to today) with no registered time. */
  missingDays: number;
  absence: Record<string, number>;
  commissionKr: number;
  /** Approved trips in the month: km and tax-free kørepenge (Skattestyrelsen's rates). */
  tripKm: number;
  tripKr: number;
  commissionHow: "løn" | "faktura" | "";
  /** A guaranteed minimum pay this month (Særlige vilkår, pro rata) and the top-up when pay + commission are less. */
  guaranteeKr: number;
  guaranteeTopUpKr: number;
  note: string;
};

const ymd = (d: Date) => d.toISOString().slice(0, 10);

export function monthBounds(ym: string): { from: Ymd; to: Ymd } {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, "0")}` };
}

export async function payrollMonth(ym: string, only?: { employeeId: string }): Promise<PayrollRow[]> {
  const { from, to } = monthBounds(ym);
  const today = todayDk();
  const employees = await prisma.employee.findMany({
    where: { ...(only ? { id: only.employeeId } : {}), startDate: { lte: new Date(`${to}T00:00:00Z`) }, OR: [{ endDate: null }, { endDate: { gte: new Date(`${from}T00:00:00Z`) } }] },
    include: {
      user: { select: { id: true, name: true, lastName: true } },
      pay: { where: { effectiveFrom: { lte: new Date(`${to}T00:00:00Z`) } }, orderBy: { effectiveFrom: "desc" }, take: 1 },
      days: { where: { date: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) } } },
      absences: { where: { status: "APPROVED", from: { lte: new Date(`${to}T00:00:00Z`) }, to: { gte: new Date(`${from}T00:00:00Z`) } } },
      terms: { where: { kind: "GUARANTEE", from: { lte: new Date(`${to}T00:00:00Z`) }, OR: [{ to: null }, { to: { gte: new Date(`${from}T00:00:00Z`) } }] } },
    },
    orderBy: { user: { name: "asc" } },
  });
  const commissions = await prisma.commission.groupBy({
    by: ["sellerId"],
    where: { sellerId: { in: employees.map((e) => e.userId) }, dueDate: { gte: new Date(`${from}T00:00:00Z`), lt: new Date(`${addDays(to, 1)}T00:00:00Z`) } },
    _sum: { amount: true },
  });
  const commissionOf = new Map(commissions.map((c) => [c.sellerId, c._sum.amount ?? 0]));

  const year = Number(ym.slice(0, 4));
  const tripsOf = new Map(
    await Promise.all(
      employees.map(async (e) => {
        const { trips, pay } = await tripsOfYear(e.id, year);
        const m = trips.filter((t) => t.date.toISOString().slice(0, 7) === ym);
        return [e.id, { km: Math.round(m.reduce((n, t) => n + t.km, 0) * 10) / 10, kr: Math.round(m.reduce((n, t) => n + (pay.get(t.id) ?? 0), 0) * 100) / 100 }] as const;
      })
    )
  );
  return employees.map((e) => {
    const t = termsOf(e);
    const p = e.pay[0];
    const time = registersTime(e.kind);
    let norm = 0;
    let missing = 0;
    const saved = new Set(e.days.map((d) => ymd(d.date)));
    let days = 0;
    let employed = 0;
    for (let d = from; d <= to; d = addDays(d, 1)) {
      days++;
      if (d >= t.startDate && (!t.endDate || d <= t.endDate)) employed++;
      const n = normMinutes(t, d);
      norm += n;
      if (time && n > 0 && d <= today && !saved.has(d)) missing++;
    }
    const absence: Record<string, number> = {};
    for (const a of spansOf(e.absences)) {
      const n = absenceDays(t, a, { from, to });
      if (n) absence[a.kind] = (absence[a.kind] ?? 0) + n;
    }
    const commission = commissionOf.get(e.userId) ?? 0;
    const freelance = e.kind === "FREELANCE";
    const share = Math.round((employed / days) * 1000) / 1000;
    const notes: string[] = [];
    if (share < 1) notes.push(`Ansat ${employed} af ${days} dage i måneden`);
    if (missing) notes.push(`${missing} arbejdsdag${missing > 1 ? "e" : ""} uden registreret tid`);
    if (!p) notes.push("Ingen løn sat i HR");
    // Garantiløn: what was earned (pay for the part of the month + hours + commission) against the guarantee.
    // Freelancers invoice - a guarantee there is settled on the invoice, not here.
    const workedHours = time ? Math.round((e.days.reduce((n, d) => n + d.minutes, 0) / 60) * 100) / 100 : null;
    const earned = ((p?.monthlyOre ?? 0) / 100) * share + ((p?.hourlyOre ?? 0) / 100) * (workedHours ?? 0) + commission;
    const guarantee = freelance
      ? { guaranteeKr: 0, topUpKr: 0 }
      : guaranteeForMonth(
          e.terms.flatMap((g) => (g.amountOre ? [{ amountKr: g.amountOre / 100, from: ymd(g.from), to: g.to ? ymd(g.to) : null }] : [])),
          { from, to },
          { from: t.startDate, to: t.endDate },
          earned
        );
    if (guarantee.topUpKr > 0) notes.push(`Garantiløn: løn og provision er under ${guarantee.guaranteeKr} kr. - tillæg ${guarantee.topUpKr} kr.`);
    return {
      name: `${e.user.name}${e.user.lastName ? ` ${e.user.lastName}` : ""}`,
      payrollNumber: e.payrollNumber ?? "",
      kind: KIND_NAMES[e.kind],
      model: p ? PAY_NAMES[p.model] : "-",
      monthlyKr: p?.monthlyOre != null ? p.monthlyOre / 100 : null,
      hourlyKr: p?.hourlyOre != null ? p.hourlyOre / 100 : null,
      commissionPct: p?.commissionPct ?? null,
      pension: p && (p.pensionEmployeePct != null || p.pensionEmployerPct != null) ? `${p.pensionEmployeePct ?? 0} % + ${p.pensionEmployerPct ?? 0} %` : "",
      employedShare: share,
      normHours: Math.round((norm / 60) * 100) / 100,
      workedHours,
      missingDays: missing,
      absence,
      commissionKr: commission,
      tripKm: tripsOf.get(e.id)?.km ?? 0,
      tripKr: tripsOf.get(e.id)?.kr ?? 0,
      commissionHow: commission ? (freelance ? "faktura" : "løn") : "",
      guaranteeKr: guarantee.guaranteeKr,
      guaranteeTopUpKr: guarantee.topUpKr,
      note: notes.join(". "),
    };
  });
}

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  // A cell starting with = + - @ would run as a formula in Excel - shown as text instead.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[";\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
const num = (n: number | null) => (n == null ? "" : String(n).replace(".", ","));

/** Semicolon-separated (Danish Excel), with a BOM so æøå are read right. */
export function payrollCsv(rows: PayrollRow[]): string {
  const kinds = Object.keys(ABSENCE_NAMES) as (keyof typeof ABSENCE_NAMES)[];
  const head = ["Navn", "Nr. i lønsystemet", "Ansat som", "Lønmodel", "Månedsløn (kr.)", "Timeløn (kr.)", "Provision %", "Pension (egen + firma)", "Andel af måneden", "Normtimer", "Registrerede timer", "Dage uden registrering", ...kinds.map((k) => `${ABSENCE_NAMES[k]} (dage)`), "Provision (kr.)", "Provision udbetales via", "Kørsel (km)", "Kørepenge, skattefri (kr.)", "Garantiløn (kr.)", "Garanti-tillæg (kr.)", "Bemærkning"];
  const lines = rows.map((r) =>
    [r.name, r.payrollNumber, r.kind, r.model, num(r.monthlyKr), num(r.hourlyKr), num(r.commissionPct), r.pension, num(r.employedShare), num(r.normHours), num(r.workedHours), r.missingDays, ...kinds.map((k) => num(r.absence[k] ?? 0)), num(r.commissionKr), r.commissionHow, num(r.tripKm), num(r.tripKr), num(r.guaranteeKr || null), num(r.guaranteeTopUpKr || null), r.note].map(csvCell).join(";")
  );
  return `﻿${[head.map(csvCell).join(";"), ...lines].join("\r\n")}\r\n`;
}

/** What a row comes to before tax (pay for the part of the month, hours, commission, guarantee top-up) - and the tax-free kørepenge. */
export function estimatedPay(r: PayrollRow): { grossKr: number; tripKr: number } {
  const gross = (r.monthlyKr ?? 0) * r.employedShare + (r.hourlyKr ?? 0) * (r.workedHours ?? 0) + (r.commissionHow === "løn" ? r.commissionKr : 0) + r.guaranteeTopUpKr;
  return { grossKr: Math.round(gross * 100) / 100, tripKr: r.tripKr };
}
