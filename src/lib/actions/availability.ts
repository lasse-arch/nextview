"use server";

import { revalidatePath } from "next/cache";
import { getTeamUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { teamCan, teamCanAny } from "@/lib/team-roles";
import { todayDk } from "@/lib/hr";
import { AVAIL_DAYS, addDaysYmd, availabilityBetween, bookingsBetween, dayDate, filmers, spanText } from "@/lib/filmer-availability";

const isYmd = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

/**
 * "Min tilgængelighed": the filmer sets (or clears, with fromMin null) the chosen days - only their own, only from
 * today and up to 14 weeks ahead.
 */
export async function saveMyAvailability(input: { dates: string[]; fromMin: number | null; toMin: number | null; note?: string }): Promise<{ ok: true; saved: number } | { ok: false; error: string }> {
  const user = await getTeamUser();
  if (!user || !teamCan(user, "filming")) return { ok: false, error: "Kun for filmere." };
  const today = todayDk();
  const last = addDaysYmd(today, AVAIL_DAYS);
  const dates = [...new Set(Array.isArray(input.dates) ? input.dates : [])].filter((d) => isYmd(d) && d >= today && d <= last).slice(0, AVAIL_DAYS + 1);
  if (!dates.length) return { ok: false, error: "Vælg en eller flere dage fra i dag og 3 måneder frem." };
  if (input.fromMin == null) {
    await prisma.filmerAvailability.deleteMany({ where: { userId: user.id, date: { in: dates.map(dayDate) } } });
  } else {
    const fromMin = Math.round(Number(input.fromMin));
    const toMin = Math.round(Number(input.toMin));
    if (!(fromMin >= 0 && toMin <= 24 * 60 && fromMin < toMin && toMin - fromMin >= 30)) return { ok: false, error: "Vælg et tidsrum på mindst en halv time." };
    const note = typeof input.note === "string" ? input.note.trim().slice(0, 120) || null : null;
    await prisma.$transaction(
      dates.map((d) =>
        prisma.filmerAvailability.upsert({
          where: { userId_date: { userId: user.id, date: dayDate(d) } },
          create: { userId: user.id, date: dayDate(d), fromMin, toMin, note },
          update: { fromMin, toMin, note },
        })
      )
    );
  }
  revalidatePath("/arpo/filmninger/ledig");
  return { ok: true, saved: dates.length };
}

/**
 * For the booking dialog: on a given day, which filmers are free (their span) and which are already out filming
 * (only the times - never which customer). Sales and admin only, like booking itself.
 */
export async function crewDay(date: string, exceptDealId?: string): Promise<Record<string, { free: string | null; busy: string[] }>> {
  const user = await getTeamUser();
  if (!user || !teamCanAny(user, "sales", "admin")) return {};
  if (!isYmd(date)) return {};
  const [people, avail, bookings] = await Promise.all([filmers(), availabilityBetween(date, date), bookingsBetween(date, date)]);
  const out: Record<string, { free: string | null; busy: string[] }> = {};
  for (const p of people) {
    const a = avail.find((x) => x.userId === p.id);
    out[p.id] = { free: a ? spanText(a) : null, busy: bookings.filter((b) => b.userIds.includes(p.id) && b.dealId !== exceptDealId).map((b) => `kl. ${b.time.replace(":", ".")}`) };
  }
  return out;
}
