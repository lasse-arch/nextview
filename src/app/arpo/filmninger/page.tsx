import { redirect } from "next/navigation";
import { getTeamUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { teamCan } from "@/lib/team-roles";
import { FilmTabs } from "./tabs";

export const metadata = { title: "Mine opgaver" };

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
  // What's needed on the day: the place, who to meet and how to reach them, and our seller who knows the customer.
  const dealSelect = { id: true, companyName: true, displayName: true, address: true, contactName: true, contactPhone: true, contactEmail: true, websiteUrl: true, owner: { select: { name: true, lastName: true, phone: true } } } as const;
  const [deals, refilms] = await Promise.all([
    prisma.deal.findMany({
      where: { filmingAt: { gte: since }, filmingCrewIds: { contains: user.id } },
      orderBy: { filmingAt: "asc" },
      select: { ...dealSelect, filmingAt: true, filmingDurationMinutes: true, filmingCrewIds: true, filmingDrone: true, filmingBrief: true },
    }),
    prisma.refilming.findMany({ where: { at: { gte: since }, crewIds: { contains: user.id }, cancelledAt: null }, orderBy: { at: "asc" }, include: { deal: { select: dealSelect } } }),
  ]);
  // The first filming and refilmings (Genoptagelse) as one list - each with what the seller agreed with the customer.
  const all = [
    ...deals.map((d) => ({ key: d.id, kind: "Optagelse", at: d.filmingAt!, minutes: d.filmingDurationMinutes, crewIds: d.filmingCrewIds, drone: d.filmingDrone, brief: d.filmingBrief, d })),
    ...refilms.map((r) => ({ key: r.id, kind: "Genoptagelse", at: r.at, minutes: r.durationMinutes, crewIds: r.crewIds, drone: r.drone, brief: r.brief, d: r.deal })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());
  // Exact crew membership (the ids are comma-separated - "contains" alone could match part of another id).
  const mine = all.filter((f) => f.crewIds?.split(",").includes(user.id));
  const crewIds = [...new Set(mine.flatMap((f) => f.crewIds?.split(",") ?? []))];
  const crew = new Map((await prisma.user.findMany({ where: { id: { in: crewIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const now = clock() - 12 * 3_600_000;
  const upcoming = mine.filter((f) => f.at.getTime() >= now);
  const past = mine.filter((f) => f.at.getTime() < now).reverse();

  const card = (f: (typeof mine)[number]) => {
    const d = f.d;
    const others = (f.crewIds?.split(",") ?? []).filter((id) => id !== user.id).map((id) => crew.get(id)).filter(Boolean);
    return (
      <li key={f.key} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/[.05]">
        <p className="text-[13px] font-semibold text-[#0071e3] first-letter:uppercase">
          {when(f.at)}
          {hours(f.minutes) && <span className="font-normal text-[#6e6e73]"> · ca. {hours(f.minutes)}</span>}
          {f.kind === "Genoptagelse" && <span className="ml-2 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold normal-case text-rose-700">Genoptagelse</span>}
        </p>
        <p className="mt-1 text-[17px] font-semibold text-[#1d1d1f]">{d.displayName ?? d.companyName}</p>
        {d.address && (
          <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(d.address)}`} target="_blank" rel="noopener" className="mt-1 block text-[14px] text-[#1d1d1f] underline decoration-black/20 underline-offset-2 hover:text-[#0071e3]">
            {d.address}
          </a>
        )}
        <dl className="mt-3 grid grid-cols-[110px_1fr] gap-x-3 gap-y-1 rounded-xl bg-[#f9f9fb] p-3 text-[14px]">
          {d.contactName && (
            <>
              <dt className="text-[#6e6e73]">Kontaktperson</dt>
              <dd className="font-medium text-[#1d1d1f]">{d.contactName}</dd>
            </>
          )}
          {d.contactPhone && (
            <>
              <dt className="text-[#6e6e73]">Telefon</dt>
              <dd>
                <a href={`tel:${d.contactPhone.replace(/\s+/g, "")}`} className="text-[#0071e3]">
                  {d.contactPhone}
                </a>
              </dd>
            </>
          )}
          {d.contactEmail && (
            <>
              <dt className="text-[#6e6e73]">E-mail</dt>
              <dd className="truncate">
                <a href={`mailto:${d.contactEmail}`} className="text-[#0071e3]">
                  {d.contactEmail}
                </a>
              </dd>
            </>
          )}
          {d.websiteUrl && /^https?:\/\//.test(d.websiteUrl) && (
            <>
              <dt className="text-[#6e6e73]">Hjemmeside</dt>
              <dd className="truncate">
                <a href={d.websiteUrl} target="_blank" rel="noopener noreferrer" className="text-[#0071e3]">
                  {d.websiteUrl.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                </a>
              </dd>
            </>
          )}
          <dt className="text-[#6e6e73]">Solgt af</dt>
          <dd className="text-[#1d1d1f]">
            {d.owner.name}
            {d.owner.lastName ? ` ${d.owner.lastName}` : ""}
            {d.owner.phone && (
              <>
                {", "}
                <a href={`tel:${d.owner.phone.replace(/\s+/g, "")}`} className="text-[#0071e3]">
                  {d.owner.phone}
                </a>
              </>
            )}
          </dd>
        </dl>
        {others.length > 0 && <p className="mt-1 text-[13px] text-[#6e6e73]">Sammen med {others.join(", ")}</p>}
        <div className={`mt-3 rounded-xl p-3 text-[14px] ${f.brief ? "bg-[#f5f5f7] text-[#1d1d1f]" : "bg-amber-50 text-amber-900"}`}>
          {f.brief ? (
            <>
              <p className="font-semibold">Drone: {f.drone ? "Ja" : "Nej"}</p>
              <p className="mt-1 whitespace-pre-line">{f.brief}</p>
            </>
          ) : (
            <p>Sælgeren har ikke skrevet, hvad der er aftalt med kunden endnu. Spørg før du tager ud.</p>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif' }}>
      <div>
        <h1 className="mb-4 text-2xl font-semibold text-[#1d1d1f]">Filmninger</h1>
        <FilmTabs at="opgaver" admin={teamCan(user, "admin")} />
        <h2 className="text-[20px] font-semibold tracking-tight text-[#1d1d1f]">Mine opgaver</h2>
        <p className="text-[14px] text-[#6e6e73]">Filmninger og genoptagelser, du er sat på - hvornår, hvor, hvem du skal møde, og hvad der er aftalt med kunden.</p>
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
