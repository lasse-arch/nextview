import { addDays, addYears, isBefore, nextDay, setISOWeek, startOfDay, startOfISOWeek } from "date-fns";

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

const DANISH_WEEKDAYS = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"];

/**
 * Fixed-week Danish school holidays, as an ISO week number - approximate
 * best guesses, not exact: `sommerferie` in particular varies by a week or
 * two depending on the year and region, and Easter-anchored holidays
 * (påske, pinse, vinterferie's exact week) are skipped entirely since they
 * move around too much to guess reliably from the week number alone. Good
 * enough for "roughly when to follow up", not for anything that needs to
 * land on an exact day.
 */
const FIXED_WEEK_HOLIDAYS: { pattern: RegExp; week: number }[] = [
  { pattern: /efterårsferien?/i, week: 42 },
  { pattern: /sommerferien?/i, week: 27 },
  { pattern: /juleferien?/i, week: 52 },
];

/** If `date` (this year) has already passed, assume next year instead - a note written in
 * October saying "i uge 3" almost certainly means next year's week 3, not the one just gone. */
function rollToFuture(date: Date, now: Date): Date {
  return isBefore(date, startOfDay(now)) ? addYears(date, 1) : date;
}

/**
 * Monday of ISO week `week`, in whichever calendar year `now` falls in - or
 * next year if that Monday has already passed. Deliberately NOT
 * `addYears(mondayThisYear, 1)`: a year has 52.14 weeks, so shifting an
 * already-resolved Monday by exactly one calendar year lands on a Tuesday
 * or Wednesday about half the time. Re-deriving the week's Monday from a
 * reference date that's actually in the target year keeps it aligned.
 * (1 Jan itself is avoided as that reference - it can belong to the ISO
 * week-year *before* the calendar year it's in, e.g. 1 Jan 2027 is ISO week
 * 53 of 2026 - 15 Jan is always safely inside its own calendar year's ISO
 * week-year.)
 */
function mondayOfNextIsoWeek(week: number, now: Date): Date {
  const thisYear = startOfISOWeek(setISOWeek(now, week));
  if (!isBefore(thisYear, startOfDay(now))) return thisYear;
  const nextYearRef = new Date(now.getFullYear() + 1, 0, 15);
  return startOfISOWeek(setISOWeek(nextYearRef, week));
}

/**
 * Best-effort scan of free text (a note's body) for a date, week number, or
 * named Danish school holiday, used to pre-fill a task's due date when it's
 * created from a note ("+ Opgave") - sellers write notes in plain Danish,
 * not structured fields, and often already state exactly when to follow up
 * ("ring igen i uge 43", "efter efterårsferien"). Tries the most specific
 * kind of match first (an exact date beats a vague weekday mention) and
 * returns the first one found; returns null when nothing recognisable is
 * there, rather than guessing at something that isn't.
 */
export function parseDueDateFromText(text: string, now: Date = new Date()): Date | null {
  const lower = text.toLowerCase();

  // 1. Explicit numeric date: "15/10", "15-10-2026", "15.10"
  const numericMatch = lower.match(/\b(\d{1,2})[.\-/](\d{1,2})(?:[.\-/](\d{2,4}))?\b/);
  if (numericMatch) {
    const day = Number(numericMatch[1]);
    const month = Number(numericMatch[2]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      const yearRaw = numericMatch[3];
      const year = yearRaw ? (yearRaw.length === 2 ? 2000 + Number(yearRaw) : Number(yearRaw)) : now.getFullYear();
      const date = new Date(year, month - 1, day);
      if (!Number.isNaN(date.getTime()) && date.getDate() === day) {
        return yearRaw ? date : rollToFuture(date, now);
      }
    }
  }

  // 2. Written date: "15. oktober", "1 december 2026"
  const writtenMatch = lower.match(new RegExp(`\\b(\\d{1,2})\\.?\\s+(${DANISH_MONTHS.join("|")})\\b(?:\\s+(\\d{4}))?`));
  if (writtenMatch) {
    const day = Number(writtenMatch[1]);
    const month = DANISH_MONTHS.indexOf(writtenMatch[2]);
    const yearRaw = writtenMatch[3];
    const year = yearRaw ? Number(yearRaw) : now.getFullYear();
    const date = new Date(year, month, day);
    if (!Number.isNaN(date.getTime())) {
      return yearRaw ? date : rollToFuture(date, now);
    }
  }

  // 3. Week number: "uge 43", "uge nr. 43", "i uge 43"
  const weekMatch = lower.match(/\buge\.?\s*(?:nr\.?)?\s*(\d{1,2})\b/);
  if (weekMatch) {
    const week = Number(weekMatch[1]);
    if (week >= 1 && week <= 53) {
      return mondayOfNextIsoWeek(week, now);
    }
  }

  // 4. Named Danish school holiday - "efter X-ferien" means the Monday
  // after that holiday week ends, otherwise the Monday it starts.
  for (const holiday of FIXED_WEEK_HOLIDAYS) {
    const match = lower.match(holiday.pattern);
    if (!match || match.index === undefined) continue;
    const before = lower.slice(Math.max(0, match.index - 15), match.index);
    const isAfter = /\befter\s+\S*\s*$/.test(before);
    const week = isAfter ? holiday.week + 1 : holiday.week;
    return mondayOfNextIsoWeek(week, now);
  }

  // 5. Weekday name: "på mandag", or just "...snakkes mandag"
  const weekdayMatch = lower.match(new RegExp(`\\b(${DANISH_WEEKDAYS.join("|")})\\b`));
  if (weekdayMatch) {
    const dayIndex = DANISH_WEEKDAYS.indexOf(weekdayMatch[1]) as 0 | 1 | 2 | 3 | 4 | 5 | 6;
    return nextDay(now, dayIndex);
  }

  // 6. Simple relative terms
  if (/\bi dag\b/.test(lower)) return startOfDay(now);
  if (/\bi morgen\b/.test(lower)) return addDays(startOfDay(now), 1);

  return null;
}
