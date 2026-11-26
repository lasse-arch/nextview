import { redirect } from "next/navigation";
import { getTeamUser } from "@/lib/auth";
import { teamCan } from "@/lib/team-roles";
import { todayDk } from "@/lib/hr";
import { AVAIL_DAYS, addDaysYmd, availabilityBetween, bookingsBetween } from "@/lib/filmer-availability";
import { FilmTabs } from "../tabs";
import { AvailabilityCalendar } from "./calendar";

export const metadata = { title: "Min tilgængelighed" };

/** "Min tilgængelighed": the filmer marks the days they can film, 14 weeks ahead - and sees their bookings on them. */
export default async function AvailabilityPage() {
  const user = await getTeamUser();
  if (!user || !teamCan(user, "filming")) redirect("/arpo");
  const today = todayDk();
  const monday = addDaysYmd(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7));
  const last = addDaysYmd(today, AVAIL_DAYS);
  const [mine, bookings] = await Promise.all([availabilityBetween(monday, last, [user.id]), bookingsBetween(monday, last)]);
  const saved = Object.fromEntries(mine.map((a) => [a.date.toISOString().slice(0, 10), { fromMin: a.fromMin, toMin: a.toMin, note: a.note }]));
  const booked: Record<string, string[]> = {};
  for (const b of bookings.filter((b) => b.userIds.includes(user.id))) (booked[b.date] ??= []).push(`${b.time.replace(":", ".")} ${b.name}`);
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-4 text-2xl font-semibold text-[#1d1d1f]">Filmninger</h1>
      <FilmTabs at="ledig" admin={teamCan(user, "admin")} />
      <AvailabilityCalendar start={monday} today={today} last={last} saved={saved} booked={booked} />
    </div>
  );
}
