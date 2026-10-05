import { prisma } from "@/lib/db";

const CPH_TZ = "Europe/Copenhagen";

function copenhagenDayKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: CPH_TZ }).format(date);
}

export type MeetingsBookedDay = {
  /** "YYYY-MM-DD" in Copenhagen time. */
  dayKey: string;
  label: string;
  count: number;
  bySeller: { name: string; count: number }[];
};

/**
 * Meetings booked through the CRM per day - counted from the "bookede møde
 * med ..." activity events (logged by every booking path: Book møde, the
 * ringeliste, the board, the deal form and sending an invite for a lead),
 * by the day the booking was made, not the day of the meeting itself.
 */
export async function getMeetingsBookedPerDay(days = 14, now = new Date()): Promise<MeetingsBookedDay[]> {
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) keys.push(copenhagenDayKey(new Date(now.getTime() - i * 24 * 60 * 60 * 1000)));
  // A day's margin so the oldest Copenhagen day is fully covered whatever the offset.
  const since = new Date(now.getTime() - (days + 1) * 24 * 60 * 60 * 1000);

  const events = await prisma.activityEvent.findMany({
    where: { type: "DEAL_STAGE_MEETING_BOOKED", createdAt: { gte: since } },
    select: { createdAt: true, actor: { select: { name: true } } },
  });

  const byDay = new Map<string, Map<string, number>>();
  for (const e of events) {
    const key = copenhagenDayKey(e.createdAt);
    const sellers = byDay.get(key) ?? new Map<string, number>();
    const name = e.actor?.name ?? "Ukendt";
    sellers.set(name, (sellers.get(name) ?? 0) + 1);
    byDay.set(key, sellers);
  }

  return keys.map((dayKey) => {
    const sellers = byDay.get(dayKey) ?? new Map<string, number>();
    const [y, m, d] = dayKey.split("-").map(Number);
    const label = new Intl.DateTimeFormat("da-DK", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(
      new Date(Date.UTC(y, m - 1, d))
    );
    return {
      dayKey,
      label,
      count: [...sellers.values()].reduce((s, n) => s + n, 0),
      bySeller: [...sellers.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    };
  });
}
