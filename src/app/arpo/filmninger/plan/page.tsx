import Link from "next/link";
import { redirect } from "next/navigation";
import { getTeamUser } from "@/lib/auth";
import { teamCan } from "@/lib/team-roles";
import { todayDk } from "@/lib/hr";
import { addDaysYmd, availabilityBetween, bookingsBetween, filmers, spanText } from "@/lib/filmer-availability";
import { FilmTabs } from "../tabs";

export const metadata = { title: "Planlægning" };

const DAYS = ["man", "tir", "ons", "tor", "fre", "lør", "søn"];

/**
 * "Planlægning" (admin): every filmer against the coming weeks - when they're free (green) and what they're booked on
 * (blue, a link to the deal). A filming is booked from the deal ("Book filming"), which shows the same.
 */
export default async function PlanPage({ searchParams }: { searchParams: Promise<{ fra?: string }> }) {
  const user = await getTeamUser();
  if (!user || !teamCan(user, "admin")) redirect("/arpo/filmninger");
  const sp = await searchParams;
  const today = todayDk();
  const monday = (d: string) => addDaysYmd(d, -((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7));
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.fra ?? "") ? monday(sp.fra!) : monday(today);
  const to = addDaysYmd(from, 13);
  const days = Array.from({ length: 14 }, (_, i) => addDaysYmd(from, i));
  const [people, avail, bookings] = await Promise.all([filmers(), availabilityBetween(from, to), bookingsBetween(from, to)]);
  const free = (uid: string, d: string) => avail.find((a) => a.userId === uid && a.date.toISOString().slice(0, 10) === d);
  const freeCount = (d: string) => people.filter((p) => free(p.id, d)).length;

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="mb-4 text-2xl font-semibold text-[#1d1d1f]">Filmninger</h1>
      <div className="max-w-3xl">
        <FilmTabs at="plan" admin />
      </div>
      <div className="mb-3 flex items-center gap-3 text-[14px]">
        <Link href={`?fra=${addDaysYmd(from, -14)}`} className="rounded-full bg-[#f2f2f7] px-3 py-1.5 font-medium">
          ‹ Før
        </Link>
        <span className="font-medium text-[#1d1d1f]">
          {new Date(`${from}T00:00:00Z`).toLocaleDateString("da-DK", { day: "numeric", month: "long", timeZone: "UTC" })} - {new Date(`${to}T00:00:00Z`).toLocaleDateString("da-DK", { day: "numeric", month: "long", timeZone: "UTC" })}
        </span>
        <Link href={`?fra=${addDaysYmd(from, 14)}`} className="rounded-full bg-[#f2f2f7] px-3 py-1.5 font-medium">
          Efter ›
        </Link>
        <span className="ml-auto flex items-center gap-3 text-[12px] text-[#6e6e73]">
          <span className="flex items-center gap-1">
            <i className="inline-block h-3 w-3 rounded bg-[#e8f8ec] ring-1 ring-[#34c759]/40" /> Ledig
          </span>
          <span className="flex items-center gap-1">
            <i className="inline-block h-3 w-3 rounded bg-[#0071e3]" /> Booket
          </span>
        </span>
      </div>
      <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-black/[.06]">
        <table className="w-full min-w-[980px] border-collapse text-[12px]">
          <thead>
            <tr className="bg-[#f9f9fb]">
              <th className="w-36 p-2 text-left font-semibold text-[#6e6e73]">Filmer</th>
              {days.map((d, i) => (
                <th key={d} className={`p-1.5 text-center font-semibold ${d === today ? "text-[#0071e3]" : "text-[#6e6e73]"} ${i === 7 ? "border-l border-black/[.08]" : ""}`}>
                  {DAYS[i % 7]} {Number(d.slice(8))}.<div className="font-normal text-[#8e8e93]">{freeCount(d)} ledig</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.id} className="border-t border-black/[.05]">
                <td className="p-2 font-medium text-[#1d1d1f]">{p.name}</td>
                {days.map((d, i) => {
                  const a = free(p.id, d);
                  const bs = bookings.filter((b) => b.date === d && b.userIds.includes(p.id));
                  return (
                    <td key={d} className={`h-14 p-0.5 align-top ${i === 7 ? "border-l border-black/[.08]" : ""}`}>
                      <div className={`h-full rounded-md p-1 ${a ? "bg-[#e8f8ec]" : d < today ? "" : "bg-[#fafafa]"}`}>
                        {a && <div className="font-medium text-[#1b7a35]">{spanText(a)}</div>}
                        {bs.map((b) => (
                          <Link key={b.dealId + b.time} href={`/arpo/deals/${b.dealId}`} className="mt-0.5 block truncate rounded bg-[#0071e3] px-1 text-[10.5px] font-medium text-white" title={`${b.kind} ${b.time} ${b.name}`}>
                            {b.time.replace(":", ".")} {b.name}
                          </Link>
                        ))}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!people.length && <p className="mt-3 text-[14px] text-[#6e6e73]">Ingen har rollen Filmer endnu. Giv en bruger rollen under Brugere.</p>}
      <p className="mt-3 text-[13px] text-[#6e6e73]">En filmning bookes fra dealen med &quot;Book filming&quot;. Dér står det også, hvem der er ledig den dag.</p>
    </div>
  );
}
