/*
 * HR's rules, as plain functions (no database) - so they can be tested.
 *
 * Days are "YYYY-MM-DD" strings: a working day is a date in Denmark, never a moment in time.
 *
 * The law it follows (checked November 2026):
 *  - Arbejdstidsloven (from 1 July 2024): the daily working time of every employee is registered - the total for the
 *    day, no clock times needed - in a system that is objective, reliable and accessible, and kept for 5 years. A
 *    registration filled in beforehand with the agreed hours is allowed when the employee corrects the days that
 *    differ (they confirm the week). At most 48 hours a week on average over 4 months.
 *  - Arbejdsmiljøloven: 11 hours' rest in every 24 hours (so a working day of more than 13 hours can't be right),
 *    and a day off every 7 days.
 *  - Ferieloven (samtidighedsferie, from 1 September 2020): 2.08 days earned each month of employment - 25 days a
 *    year - in the holiday year 1 September - 31 August; held up to 31 December after it.
 * The official holiday account and the pay stay in the payroll system; this is the overview.
 */

export type Ymd = string;

const pad = (n: number) => String(n).padStart(2, "0");
const toYmd = (d: Date): Ymd => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const fromYmd = (s: Ymd) => new Date(`${s}T00:00:00Z`);

export const isYmd = (s: unknown): s is Ymd => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && toYmd(fromYmd(s)) === s;
export const addDays = (s: Ymd, n: number): Ymd => toYmd(new Date(fromYmd(s).getTime() + n * 86_400_000));
/** 1 = Monday … 7 = Sunday. */
export const weekday = (s: Ymd) => ((fromYmd(s).getUTCDay() + 6) % 7) + 1;
export const mondayOf = (s: Ymd) => addDays(s, 1 - weekday(s));
export const weekOf = (monday: Ymd): Ymd[] => Array.from({ length: 7 }, (_, i) => addDays(monday, i));
export const daysBetween = (from: Ymd, to: Ymd) => Math.round((fromYmd(to).getTime() - fromYmd(from).getTime()) / 86_400_000);
/** ISO week number (Danish weeks). */
export function weekNumber(s: Ymd): number {
  const thursday = fromYmd(addDays(mondayOf(s), 3));
  const jan1 = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  return Math.floor((thursday.getTime() - jan1) / 86_400_000 / 7) + 1;
}
export const ymdOf = (d: Date) => toYmd(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())));
/** Today in Denmark. */
export const todayDk = (now = new Date()): Ymd => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Copenhagen" }).format(now);

/** Easter Sunday (the Gregorian computus). */
export function easter(year: number): Ymd {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Danish public holidays (helligdage) - Store bededag is no longer one from 2024. */
export function holidays(year: number): Map<Ymd, string> {
  const e = easter(year);
  const list: [Ymd, string][] = [
    [`${year}-01-01`, "Nytårsdag"],
    [addDays(e, -3), "Skærtorsdag"],
    [addDays(e, -2), "Langfredag"],
    [e, "Påskedag"],
    [addDays(e, 1), "2. påskedag"],
    [addDays(e, 39), "Kristi himmelfartsdag"],
    [addDays(e, 49), "Pinsedag"],
    [addDays(e, 50), "2. pinsedag"],
    [`${year}-12-25`, "Juledag"],
    [`${year}-12-26`, "2. juledag"],
  ];
  if (year < 2024) list.push([addDays(e, 26), "Store bededag"]);
  return new Map(list);
}
export const holidayName = (s: Ymd) => holidays(Number(s.slice(0, 4))).get(s) ?? null;

export type EmployeeTerms = { startDate: Ymd; endDate: Ymd | null; weeklyMinutes: number; workDays: number[] };

/** The agreed working time that day: the week's hours spread evenly on the working days - none on a holiday, a day off, or outside the employment. */
export function normMinutes(e: EmployeeTerms, s: Ymd): number {
  if (s < e.startDate || (e.endDate && s > e.endDate)) return 0;
  if (!e.workDays.includes(weekday(s)) || holidayName(s)) return 0;
  return Math.round(e.weeklyMinutes / Math.max(1, e.workDays.length));
}

export type AbsenceSpan = { kind: string; from: Ymd; to: Ymd; halfDay: boolean; status: string };

/** The approved absence that day, if any (the first). */
export const absenceOn = (list: AbsenceSpan[], s: Ymd) => list.find((a) => a.status === "APPROVED" && a.from <= s && s <= a.to) ?? null;

/** What the day is filled in with before the employee corrects it: the agreed time, less approved absence. */
export function prefillMinutes(e: EmployeeTerms, s: Ymd, absences: AbsenceSpan[]): number {
  const norm = normMinutes(e, s);
  const a = absenceOn(absences, s);
  if (!a) return norm;
  return a.halfDay ? Math.round(norm / 2) : 0;
}

/** Working days (the agreed ones, not holidays) an absence takes - half days count half. */
export function absenceDays(e: EmployeeTerms, a: Pick<AbsenceSpan, "from" | "to" | "halfDay">, within?: { from: Ymd; to: Ymd }): number {
  let n = 0;
  const from = within && within.from > a.from ? within.from : a.from;
  const to = within && within.to < a.to ? within.to : a.to;
  for (let d = from; d <= to; d = addDays(d, 1)) if (normMinutes(e, d) > 0) n += a.halfDay ? 0.5 : 1;
  return n;
}

/** The holiday year a day is in: 1 September - 31 August. */
export function holidayYear(s: Ymd): { from: Ymd; to: Ymd; label: string } {
  const y = Number(s.slice(0, 4));
  const start = Number(s.slice(5, 7)) >= 9 ? y : y - 1;
  return { from: `${start}-09-01`, to: `${start + 1}-08-31`, label: `${start}/${String(start + 1).slice(2)}` };
}

export const DAYS_PER_MONTH = 2.08;

/**
 * Holiday days earned in the holiday year up to and including `upTo`: 2.08 for each month that has ended while
 * employed - a month employed only in part, its share. (Earned days can be held from the month after.)
 */
export function earnedHolidayDays(e: Pick<EmployeeTerms, "startDate" | "endDate">, yearFrom: Ymd, upTo: Ymd): number {
  let days = 0;
  for (let m = yearFrom; m <= upTo; ) {
    const next = `${Number(m.slice(5, 7)) === 12 ? Number(m.slice(0, 4)) + 1 : m.slice(0, 4)}-${pad((Number(m.slice(5, 7)) % 12) + 1)}-01`;
    const last = addDays(next, -1);
    if (last > upTo) break; // the month isn't over
    const from = e.startDate > m ? e.startDate : m;
    const to = e.endDate && e.endDate < last ? e.endDate : last;
    if (from <= to) days += (DAYS_PER_MONTH * (daysBetween(from, to) + 1)) / (daysBetween(m, last) + 1);
    m = next;
  }
  return Math.round(days * 100) / 100;
}

/** The same day `n` months earlier (the last day of that month if it's shorter). */
export function monthsBack(s: Ymd, n: number): Ymd {
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7)) - 1 - n;
  const first = new Date(Date.UTC(y, m, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return toYmd(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(Number(s.slice(8)), last))));
}

export type Warning = { kind: "avg48" | "rest" | "dayoff"; text: string; date?: Ymd };

/**
 * What the registered time says against the rules: more than 48 hours a week on average over the last 4 months,
 * a day longer than 13 hours (no 11 hours' rest), 7 days in a row without a day off.
 */
export function workWarnings(days: Map<Ymd, number>, today: Ymd): Warning[] {
  const out: Warning[] = [];
  const start = monthsBack(today, 4);
  let sum = 0;
  for (const [d, m] of days) if (d > start && d <= today) sum += m;
  const weeks = Math.max(1, (daysBetween(start, today) + 1) / 7);
  const avg = sum / weeks / 60;
  if (avg > 48) out.push({ kind: "avg48", text: `${avg.toFixed(1).replace(".", ",")} timer om ugen i snit de seneste 4 måneder - over grænsen på 48.` });
  const sorted = [...days.entries()].filter(([d]) => d <= today).sort(([a], [b]) => a.localeCompare(b));
  for (const [d, m] of sorted) if (m > 13 * 60) out.push({ kind: "rest", date: d, text: `${(m / 60).toFixed(1).replace(".", ",")} timer ${d} - mere end 13 timer giver ikke 11 timers hvile.` });
  let run = 0;
  let prev: Ymd | null = null;
  for (const [d, m] of sorted) {
    if (m <= 0) {
      run = 0;
      prev = d;
      continue;
    }
    run = prev && daysBetween(prev, d) === 1 ? run + 1 : 1;
    prev = d;
    if (run === 7) out.push({ kind: "dayoff", date: d, text: `7 arbejdsdage i træk frem til ${d} - der skal være et fridøgn hver 7. dag.` });
  }
  return out;
}

export const hoursText = (minutes: number) => {
  const h = Math.floor(Math.abs(minutes) / 60);
  const m = Math.abs(minutes) % 60;
  return `${minutes < 0 ? "-" : ""}${h}${m ? `:${pad(m)}` : ""} t`;
};
/** "7,4" / "7.5" / "7:24" → minutes (null if it isn't a time). */
export function parseHours(raw: string): number | null {
  const s = raw.trim().replace(",", ".");
  if (!s) return 0;
  const clock = s.match(/^(\d{1,2}):(\d{2})$/);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || n > 24) return null;
  return Math.round(n * 60);
}

export const KIND_NAMES = { SALARIED: "Funktionær (fast løn)", HOURLY: "Timelønnet", TRAINEE: "Elev/praktikant", FREELANCE: "Freelance" } as const;
export const PAY_NAMES = { MONTHLY: "Fast månedsløn", HOURLY: "Timeløn", MONTHLY_COMMISSION: "Fast løn + provision", COMMISSION_ONLY: "Kun provision", INVOICE: "Faktura (freelance)" } as const;
export const ABSENCE_NAMES = { VACATION: "Ferie", SICK: "Sygdom", CHILD_SICK: "Barns sygdom", LEAVE: "Orlov", TIME_OFF: "Fri med løn", UNPAID: "Fri uden løn" } as const;
export const ABSENCE_STATUS_NAMES = { REQUESTED: "Venter", APPROVED: "Godkendt", REJECTED: "Afvist", CANCELLED: "Annulleret" } as const;
/** Freelancers aren't employees: no working-time registration, no holiday. */
export const registersTime = (kind: string) => kind !== "FREELANCE";

/** The last day of the month `s` is in. */
export function endOfMonth(s: Ymd): Ymd {
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  return `${y}-${pad(m)}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
}
const addMonths = (s: Ymd, n: number): Ymd => {
  const d = new Date(Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1 + n, 1));
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  return toYmd(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), Math.min(Number(s.slice(8)), last))));
};

/**
 * Opsigelsesvarsel efter funktionærloven § 2 - the last day of work when notice is given on `noticeDay`:
 *  - by the employer: 1 month within the first 5 months; 3 months from 6 months; 4 from 2 years 9 months;
 *    5 from 5 years 8 months; 6 from 8 years 7 months - to the end of a month. In an agreed probation
 *    (at most the first 3 months): 14 days, to any day.
 *  - by the employee: 1 month, to the end of a month.
 * Only for funktionærer: an apprentice (elev), an hourly worker who isn't one, and freelancers follow their own
 * contract - then null. The 120-days rule (§ 2, stk. 5) isn't applied: it must be agreed in writing.
 */
export function noticeEnd(kind: string, startDate: Ymd, probationEnd: Ymd | null, noticeDay: Ymd, by: "employer" | "employee"): { lastDay: Ymd; months: number | null; why: string } | null {
  if (kind !== "SALARIED") return null;
  if (by === "employee") return { lastDay: endOfMonth(addMonths(noticeDay, 1)), months: 1, why: "Medarbejderens varsel: 1 måned til udgangen af en måned." };
  if (probationEnd && noticeDay <= probationEnd && probationEnd <= addMonths(startDate, 3)) return { lastDay: addDays(noticeDay, 14), months: null, why: "Opsagt i prøvetiden: 14 dage." };
  // Seniority when the notice is given (the 1 month applies "within the first 5 months" of employment).
  const months = daysBetween(startDate, noticeDay) / 30.44;
  const m = months < 5 ? 1 : months < 33 ? 3 : months < 68 ? 4 : months < 103 ? 5 : 6;
  return { lastDay: endOfMonth(addMonths(noticeDay, m)), months: m, why: `Ansat i ${Math.floor(months / 12)} år og ${Math.floor(months % 12)} måneder: ${m} måned${m > 1 ? "er" : ""} til udgangen af en måned.` };
}

export const START_TASKS = [
  "Ansættelseskontrakt underskrevet (senest 7 dage efter første arbejdsdag)",
  "Oprettet i lønsystemet med medarbejdernummer",
  "Pension oprettet",
  "Privatlivsmeddelelse givet til medarbejderen",
  "Google-konto og adgang til Arpo",
  "Udstyr udleveret (computer, telefon, nøgler)",
  "Introduktion: arbejdsmiljø, sikkerhed og hvem man spørger",
];
export const STOP_TASKS = [
  "Opsigelse givet skriftligt og varsel tjekket",
  "Sidste løn, feriepenge og provision opgjort i lønsystemet",
  "Kunder, deals og opgaver overdraget",
  "Udstyr og nøgler afleveret",
  "Andre konti lukket (Google, e-mail, adgangskoder)",
  "Udtalelse skrevet, hvis medarbejderen ønsker det",
];

/**
 * The 120-days rule (funktionærloven § 5, stk. 2): sick days with pay in the last 12 months, counted as calendar
 * days (weekends and holidays inside a sickness count too). Notice must then be given right after the 120th day,
 * while the employee is still sick - so HR warns from day 100.
 */
export function sickDays12Months(absences: AbsenceSpan[], today: Ymd): number {
  const from = addDays(`${Number(today.slice(0, 4)) - 1}${today.slice(4)}`, 1);
  const days = new Set<Ymd>();
  for (const a of absences) {
    if (a.kind !== "SICK" || a.status !== "APPROVED") continue;
    for (let d = a.from > from ? a.from : from; d <= a.to && d <= today; d = addDays(d, 1)) days.add(d);
  }
  return days.size;
}

/**
 * Skattestyrelsen's tax-free rates for driving one's own car for work (kr. per km): up to 20,000 km in a calendar
 * year, and above. A year not here uses the latest known one - add each new year's rates (they come in November).
 */
export const MILEAGE_RATES: Record<number, { upTo20000: number; above: number }> = {
  2025: { upTo20000: 3.81, above: 2.23 },
  2026: { upTo20000: 3.94, above: 2.28 },
  2027: { upTo20000: 4.13, above: 2.44 },
};
export function mileageRate(year: number) {
  const known = Object.keys(MILEAGE_RATES).map(Number).sort((a, b) => a - b);
  return MILEAGE_RATES[year] ?? MILEAGE_RATES[known.filter((y) => y <= year).pop() ?? known[0]];
}

/** Kørepenge for `km` driven after `kmBefore` km already that calendar year: the first 20,000 km at the higher rate. */
export function mileagePay(year: number, kmBefore: number, km: number): number {
  const r = mileageRate(year);
  const low = Math.max(0, Math.min(km, 20_000 - kmBefore));
  return Math.round((low * r.upTo20000 + (km - low) * r.above) * 100) / 100;
}

export const TRIP_KINDS = ["Kundebesøg", "Filmning", "Genoptagelse", "Opfølgning på kunde", "Møde", "Andet"] as const;
/** A Danish number plate, tidied: "ab 12 345" → "AB 12 345" (letters and digits only, at most 10). */
export const cleanPlate = (s: string) => s.toUpperCase().replace(/[^A-ZÆØÅ0-9 ]/g, "").replace(/\s+/g, " ").trim().slice(0, 10);

/** A guaranteed minimum pay ("garantiløn") in force from `from` (to `to`, both included), in kr. a month. */
export type Guarantee = { amountKr: number; from: Ymd; to: Ymd | null };

/**
 * A month's guarantee and the top-up it gives: the guarantee counts for the days of the month it and the employment
 * both cover (a part month pro rata - two overlapping, the higher), and when what was earned (pay + commission) is
 * less, the difference is paid. Kr., to the øre.
 */
export function guaranteeForMonth(list: Guarantee[], month: { from: Ymd; to: Ymd }, employed: { from: Ymd; to: Ymd | null }, earnedKr: number): { guaranteeKr: number; topUpKr: number } {
  if (!list.length) return { guaranteeKr: 0, topUpKr: 0 };
  let days = 0;
  let sum = 0;
  for (let d = month.from; d <= month.to; d = addDays(d, 1)) {
    days++;
    if (d < employed.from || (employed.to && d > employed.to)) continue;
    const amount = Math.max(0, ...list.filter((g) => d >= g.from && (!g.to || d <= g.to)).map((g) => g.amountKr));
    sum += amount;
  }
  const guaranteeKr = Math.round((sum / days) * 100) / 100;
  return { guaranteeKr, topUpKr: Math.max(0, Math.round((guaranteeKr - earnedKr) * 100) / 100) };
}

/**
 * The four usual jobs: a click fills in the title and the duties (they stand in the contract: "Opgaverne er <duties>
 * og de opgaver, der naturligt hører til stillingen" - so each starts with "at"). Always editable afterwards.
 */
export const JOB_PRESETS: { title: string; duties: string }[] = [
  {
    title: "Sælger",
    duties: "at finde og kontakte nye kunder, holde salgsmøder, give tilbud og sælge virtuelle rundvisninger og Nextview360's øvrige ydelser, registrere salgsarbejdet i Arpo og følge op på kunderne",
  },
  {
    title: "Filmer",
    duties: "at planlægge og gennemføre optagelser hos kunderne med 360°-kamera, foto, video og drone, efterbehandle materialet og gøre de virtuelle rundvisninger færdige i Arpo",
  },
  {
    title: "Udvikler",
    duties: "at udvikle, teste og vedligeholde Nextview360's software, herunder Arpo, tour-motoren og hjemmesiden, og at passe på sikkerheden og kundernes data",
  },
  {
    title: "Praktikant",
    duties: "at lære Nextview360's arbejde at kende og deltage i de opgaver, der aftales i praktikaftalen - fx salg, optagelser, efterbehandling og opsætning af rundvisninger - med en fast kontaktperson",
  },
];
