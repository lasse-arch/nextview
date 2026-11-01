import { redirect } from "next/navigation";
import { getTeamUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { teamCan } from "@/lib/team-roles";

export const metadata = { title: "Mine filmninger" };

/** Wall-clock-as-UTC (like meetingDate): its UTC digits are the Danish time. */
const when = (d: Date) => new Intl.DateTimeFormat("da-DK", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(d);
/** The clock, outside render (the React compiler's purity rule). */
const clock = () => Date.now();
const hours = (m: number | null) => (m ? (m % 60 ? `${Math.floor(m / 60)} t ${m % 60} min` : `${m / 60} t`) : null);

/**
 * "Mine filmninger": the filmings this person is on the crew of - when, where
 * and who to meet. Only what's needed on the day: no prices, contracts or
 * other customers (the deal's other fields are never read).
 */
export default async function FilmingsPage() {
  const user = await getTeamUser();
  if (!user || !teamCan(user, "filming")) redirect("/arpo");
  const since = new Date(clock() - 14 * 86_400_000);
  const deals = await prisma.deal.findMany({
    where: { filmingAt: { gte: since }, filmingCrewIds: { contains: user.id } },
    orderBy: { filmingAt: "asc" },
    select: { id: true, companyName: true, displayName: true, address: true, contactName: true, contactPhone: true, filmingAt: true, filmingDurationMinutes: true, filmingCrewIds: true },
  });
  // Exact crew membership (the ids are comma-separated - "contains" alone could match part of another id).
  const mine = deals.filter((d) => d.filmingCrewIds?.split(",").includes(user.id));
  const crewIds = [...new Set(mine.flatMap((d) => d.filmingCrewIds?.split(",") ?? []))];
  const crew = new Map((await prisma.user.findMany({ where: { id: { in: crewIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const now = clock() - 12 * 3_600_000;
  const upcoming = mine.filter((d) => d.filmingAt!.getTime() >= now);
  const past = mine.filter((d) => d.filmingAt!.getTime() < now).reverse();

  const card = (d: (typeof mine)[number]) => {
    const others = (d.filmingCrewIds?.split(",") ?? []).filter((id) => id !== user.id).map((id) => crew.get(id)).filter(Boolean);
    return (
      <li key={d.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/[.05]">
        <p className="text-[13px] font-semibold capitalize text-[#0071e3]">
          {when(d.filmingAt!)}
          {hours(d.filmingDurationMinutes) && <span className="font-normal text-[#6e6e73]"> · ca. {hours(d.filmingDurationMinutes)}</span>}
        </p>
        <p className="mt-1 text-[17px] font-semibold text-[#1d1d1f]">{d.displayName ?? d.companyName}</p>
        {d.address && (
          <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(d.address)}`} target="_blank" rel="noopener" className="mt-1 block text-[14px] text-[#1d1d1f] underline decoration-black/20 underline-offset-2 hover:text-[#0071e3]">
            {d.address}
          </a>
        )}
        {(d.contactName || d.contactPhone) && (
          <p className="mt-2 text-[14px] text-[#3a3a3c]">
            Mød {d.contactName ?? "kontaktpersonen"}
            {d.contactPhone && (
              <>
                {" · "}
                <a href={`tel:${d.contactPhone.replace(/\s+/g, "")}`} className="text-[#0071e3]">
                  {d.contactPhone}
                </a>
              </>
            )}
          </p>
        )}
        {others.length > 0 && <p className="mt-1 text-[13px] text-[#6e6e73]">Sammen med {others.join(", ")}</p>}
      </li>
    );
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif' }}>
      <div>
        <h1 className="text-[28px] font-semibold tracking-tight text-[#1d1d1f]">Mine filmninger</h1>
        <p className="text-[14px] text-[#6e6e73]">Filmninger, du er sat på - hvornår, hvor og hvem du skal møde.</p>
      </div>
      {upcoming.length ? <ul className="space-y-3">{upcoming.map(card)}</ul> : <p className="rounded-2xl bg-white p-4 text-[14px] text-[#6e6e73] ring-1 ring-black/[.05]">Ingen kommende filmninger lige nu.</p>}
      {past.length > 0 && (
        <details>
          <summary className="cursor-pointer select-none text-[14px] text-[#6e6e73]">De seneste to uger ({past.length})</summary>
          <ul className="mt-3 space-y-3 opacity-80">{past.map(card)}</ul>
        </details>
      )}
    </div>
  );
}
