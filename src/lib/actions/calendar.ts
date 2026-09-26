"use server";

import { getCalendarWeek, type CalendarMeeting } from "@/lib/calendar-page-data";

/**
 * Client-safe mirror of CalendarWeek - `date` (a Date object) isn't
 * serializable across the server/client action boundary, so each day carries
 * its ISO string instead; the client reconstructs a Date from it when
 * formatting (safe since these are always UTC-midnight instants, see
 * calendar-page-data.ts).
 */
export type CalendarWeekClientData = {
  weekOffset: number;
  weekLabel: string;
  days: { dayKey: string; dateIso: string }[];
  meetings: CalendarMeeting[];
};

/** Lets the Kalender page's week grid switch weeks purely client-side (via
 * useTransition), instead of navigating to `/kalender?week=N` and re-running
 * the whole page's data fetching (stats tiles, monthly chart, per-seller
 * cards included) just to change which week is shown. */
export async function getCalendarWeekAction(weekOffset: number): Promise<CalendarWeekClientData> {
  const week = await getCalendarWeek(weekOffset);
  return {
    weekOffset,
    weekLabel: week.weekLabel,
    days: week.days.map((d) => ({ dayKey: d.dayKey, dateIso: d.date.toISOString() })),
    meetings: week.meetings,
  };
}
