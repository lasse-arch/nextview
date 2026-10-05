/**
 * Danish banking days and the Betalingsservice delivery deadline.
 *
 * Every date here is a calendar day represented as UTC midnight, so no
 * server timezone can shift it. Banks are closed on weekends and on: New
 * Year's Day, Maundy Thursday, Good Friday, Easter Monday, Ascension Day and
 * the Friday after it, Whit Monday, Constitution Day (5 June), Christmas Eve,
 * Christmas Day, Boxing Day and New Year's Eve. (Store Bededag was abolished
 * as a public holiday from 2024.)
 *
 * Section 0112 collection data must reach Betalingsservice "before 11:00 on
 * the sixth last Danish banking day" of the month before the payment month
 * (BS guidelines, table 9) - later deliveries cost extra or miss the month.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export function utcDay(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day));
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** Easter Sunday (anonymous Gregorian algorithm). */
function easterSunday(year: number): Date {
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
  return utcDay(year, month - 1, day);
}

const holidayCache = new Map<number, Set<number>>();

function bankHolidays(year: number): Set<number> {
  const cached = holidayCache.get(year);
  if (cached) return cached;
  const easter = easterSunday(year);
  const days = [
    utcDay(year, 0, 1),
    addDays(easter, -3),
    addDays(easter, -2),
    addDays(easter, 1),
    addDays(easter, 39),
    addDays(easter, 40),
    addDays(easter, 50),
    utcDay(year, 5, 5),
    utcDay(year, 11, 24),
    utcDay(year, 11, 25),
    utcDay(year, 11, 26),
    utcDay(year, 11, 31),
  ];
  const set = new Set(days.map((d) => d.getTime()));
  holidayCache.set(year, set);
  return set;
}

export function isBankingDay(day: Date): boolean {
  const dow = day.getUTCDay();
  if (dow === 0 || dow === 6) return false;
  return !bankHolidays(day.getUTCFullYear()).has(day.getTime());
}

export function nextBankingDayOnOrAfter(day: Date): Date {
  let d = utcDay(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
  while (!isBankingDay(d)) d = addDays(d, 1);
  return d;
}

/** The first banking day of the month containing `day`. */
export function firstBankingDayOfMonth(day: Date): Date {
  return nextBankingDayOnOrAfter(utcDay(day.getUTCFullYear(), day.getUTCMonth(), 1));
}

/** The sixth last banking day of the given month. */
export function sixthLastBankingDay(year: number, monthIndex: number): Date {
  let d = utcDay(year, monthIndex + 1, 0);
  let seen = 0;
  for (;;) {
    if (isBankingDay(d)) {
      seen++;
      if (seen === 6) return d;
    }
    d = addDays(d, -1);
  }
}

/** Copenhagen's UTC offset in hours on a given day (1 in winter, 2 in summer). */
function copenhagenOffsetHours(day: Date): number {
  const noonUtc = new Date(day.getTime() + 12 * 60 * 60 * 1000);
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Copenhagen", hour: "2-digit", hour12: false }).format(noonUtc)
  );
  return hour - 12;
}

/**
 * The real instant by which a delivery holding a collection due on
 * `collectionDate` must be uploaded: 11:00 Copenhagen time on the sixth last
 * banking day of the month before.
 */
export function deliveryDeadline(collectionDate: Date): Date {
  const deadlineDay = sixthLastBankingDay(collectionDate.getUTCFullYear(), collectionDate.getUTCMonth() - 1);
  return new Date(deadlineDay.getTime() + (11 - copenhagenOffsetHours(deadlineDay)) * 60 * 60 * 1000);
}

/**
 * The collection date for a billing period starting `periodStart`: the first
 * banking day of that month (the 1st itself unless it's a weekend/holiday).
 */
export function collectionDateForPeriod(periodStart: Date): Date {
  return firstBankingDayOfMonth(
    utcDay(periodStart.getFullYear(), periodStart.getMonth(), periodStart.getDate())
  );
}

/**
 * The earliest first-of-month collection date still reachable from `now` -
 * the first month whose delivery deadline is at least `marginHours` away.
 * Used for one-off invoices (the establishment fee) that aren't tied to a
 * quarter start.
 */
export function earliestCollectionDate(now: Date, marginHours = 24): Date {
  let candidate = firstBankingDayOfMonth(utcDay(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  while (deliveryDeadline(candidate).getTime() - now.getTime() < marginHours * 60 * 60 * 1000) {
    candidate = firstBankingDayOfMonth(utcDay(candidate.getUTCFullYear(), candidate.getUTCMonth() + 1, 1));
  }
  return candidate;
}
