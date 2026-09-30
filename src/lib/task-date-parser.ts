import { addDays, addMonths, addYears, isAfter, isBefore, nextDay, setISOWeek, startOfDay, startOfISOWeek } from "date-fns";

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

type DueDateMatch = { date: Date; start: number; end: number };

/**
 * Best-effort scan of free text for a date, week number, weekday, or named
 * Danish school holiday - shared by parseDueDateFromText (note bodies) and
 * extractDueDateFromTitle (task titles, which also need the match's
 * position to strip it back out). Tries the most specific kind of match
 * first (an exact date beats a vague weekday mention) and returns the first
 * one found, along with where in `text` it matched; returns null when
 * nothing recognisable is there, rather than guessing at something that
 * isn't. Match positions are found against `text.toLowerCase()`, which is
 * safe to index back into the original `text` since none of the recognised
 * patterns contain characters whose lower-casing changes their length.
 */
function matchDueDate(text: string, now: Date): DueDateMatch | null {
  const lower = text.toLowerCase();

  // 1. Explicit numeric date: "15/10", "15-10-2026", "15.10"
  const numericMatch = lower.match(/\b(\d{1,2})[.\-/](\d{1,2})(?:[.\-/](\d{2,4}))?\b/);
  if (numericMatch && numericMatch.index !== undefined) {
    const day = Number(numericMatch[1]);
    const month = Number(numericMatch[2]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      const yearRaw = numericMatch[3];
      const year = yearRaw ? (yearRaw.length === 2 ? 2000 + Number(yearRaw) : Number(yearRaw)) : now.getFullYear();
      const date = new Date(year, month - 1, day);
      if (!Number.isNaN(date.getTime()) && date.getDate() === day) {
        return {
          date: yearRaw ? date : rollToFuture(date, now),
          start: numericMatch.index,
          end: numericMatch.index + numericMatch[0].length,
        };
      }
    }
  }

  // 2. Written date: "15. oktober", "1 december 2026"
  const writtenMatch = lower.match(new RegExp(`\\b(\\d{1,2})\\.?\\s+(${DANISH_MONTHS.join("|")})\\b(?:\\s+(\\d{4}))?`));
  if (writtenMatch && writtenMatch.index !== undefined) {
    const day = Number(writtenMatch[1]);
    const month = DANISH_MONTHS.indexOf(writtenMatch[2]);
    const yearRaw = writtenMatch[3];
    const year = yearRaw ? Number(yearRaw) : now.getFullYear();
    const date = new Date(year, month, day);
    if (!Number.isNaN(date.getTime())) {
      return {
        date: yearRaw ? date : rollToFuture(date, now),
        start: writtenMatch.index,
        end: writtenMatch.index + writtenMatch[0].length,
      };
    }
  }

  // 3. Week number: "uge 43", "uge nr. 43", "i uge 43"
  const weekMatch = lower.match(/\buge\.?\s*(?:nr\.?)?\s*(\d{1,2})\b/);
  if (weekMatch && weekMatch.index !== undefined) {
    const week = Number(weekMatch[1]);
    if (week >= 1 && week <= 53) {
      return { date: mondayOfNextIsoWeek(week, now), start: weekMatch.index, end: weekMatch.index + weekMatch[0].length };
    }
  }

  // 4. Named Danish school holiday - "efter X-ferien" means the Monday
  // after that holiday week ends, otherwise the Monday it starts (and the
  // "efter " word itself is included in the removed range, so stripping it
  // from a title doesn't leave a dangling "efter").
  for (const holiday of FIXED_WEEK_HOLIDAYS) {
    const match = lower.match(holiday.pattern);
    if (!match || match.index === undefined) continue;
    const beforeStart = Math.max(0, match.index - 15);
    const before = lower.slice(beforeStart, match.index);
    const afterWordMatch = /\befter\s+\S*\s*$/.exec(before);
    const week = afterWordMatch ? holiday.week + 1 : holiday.week;
    const start = afterWordMatch ? beforeStart + afterWordMatch.index : match.index;
    return { date: mondayOfNextIsoWeek(week, now), start, end: match.index + match[0].length };
  }

  // 5. Weekday name: "på mandag", or just "...snakkes mandag"
  const weekdayMatch = lower.match(new RegExp(`\\b(${DANISH_WEEKDAYS.join("|")})\\b`));
  if (weekdayMatch && weekdayMatch.index !== undefined) {
    const dayIndex = DANISH_WEEKDAYS.indexOf(weekdayMatch[1]) as 0 | 1 | 2 | 3 | 4 | 5 | 6;
    return { date: nextDay(now, dayIndex), start: weekdayMatch.index, end: weekdayMatch.index + weekdayMatch[0].length };
  }

  // 6. Simple relative terms
  const todayMatch = lower.match(/\bi dag\b/);
  if (todayMatch && todayMatch.index !== undefined) {
    return { date: startOfDay(now), start: todayMatch.index, end: todayMatch.index + todayMatch[0].length };
  }
  const tomorrowMatch = lower.match(/\bi morgen\b/);
  if (tomorrowMatch && tomorrowMatch.index !== undefined) {
    return { date: addDays(startOfDay(now), 1), start: tomorrowMatch.index, end: tomorrowMatch.index + tomorrowMatch[0].length };
  }

  return null;
}

/**
 * Scans free text (a note's body) for a date, week number, weekday, or named
 * Danish school holiday, used to pre-fill a task's due date when it's
 * created from a note ("+ Opgave") - sellers write notes in plain Danish,
 * not structured fields, and often already state exactly when to follow up
 * ("ring igen i uge 43", "efter efterårsferien").
 */
export function parseDueDateFromText(text: string, now: Date = new Date()): Date | null {
  return matchDueDate(text, now)?.date ?? null;
}

/** We don't create tasks more than about half a year out in practice, so a
 * date parsed further ahead than this is almost certainly a misfire (a
 * stray number, a typo) rather than something genuinely meant - treated as
 * no match at all rather than silently setting a far-future due date. */
const MAX_DUE_DATE_MONTHS_OUT = 6;

/** Removes the matched range from `text`, along with one adjacent space (so
 * "Hotel Royal 6 oktober" -> "Hotel Royal", not "Hotel Royal " or "HotelRoyal"),
 * then collapses any doubled-up whitespace and trims a stray trailing comma
 * or dash left dangling by the removal. */
function stripMatchedRange(text: string, start: number, end: number): string {
  const eatLeadingSpace = text[start - 1] === " ";
  const rangeStart = eatLeadingSpace ? start - 1 : start;
  const eatTrailingSpace = !eatLeadingSpace && text[end] === " ";
  const rangeEnd = eatTrailingSpace ? end + 1 : end;
  return (text.slice(0, rangeStart) + text.slice(rangeEnd))
    .replace(/\s{2,}/g, " ")
    .replace(/[,\-–]\s*$/, "")
    .trim();
}

export type TitleDueDateExtraction = { cleanedTitle: string; dueDate: Date | null };

/**
 * Looks for a date/week-number/weekday/holiday mention in a task title
 * (same recognised patterns as parseDueDateFromText) and, when found,
 * returns the title with that mention removed plus the date to use as the
 * due date - so typing "Status på Hotel Royal 6 oktober" fills the
 * Forfaldsdato field and leaves the title as "Status på Hotel Royal"
 * instead of keeping the date spelled out in both places. No match (or a
 * date more than ~6 months out - see MAX_DUE_DATE_MONTHS_OUT) leaves the
 * title completely untouched.
 */
export function extractDueDateFromTitle(text: string, now: Date = new Date()): TitleDueDateExtraction {
  const match = matchDueDate(text, now);
  if (!match || isAfter(match.date, addMonths(now, MAX_DUE_DATE_MONTHS_OUT))) {
    return { cleanedTitle: text, dueDate: null };
  }

  const cleanedTitle = stripMatchedRange(text, match.start, match.end);
  return { cleanedTitle: cleanedTitle || text.trim(), dueDate: match.date };
}
