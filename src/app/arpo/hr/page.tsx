import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getTeamUser } from "@/lib/auth";
import { isHrAdmin } from "@/lib/hr-access";
import { KIND_NAMES, addDays, registersTime, sickDays12Months, todayDk, weekNumber } from "@/lib/hr";
import { holidayBalance, missingWeeks, spansOf } from "@/lib/hr-data";
import { AbsenceList, Card, Saved, TripList, btn, btnLight } from "./hr-ui";
import { TONE, hrStatus } from "./status";

/*
 * HR (admin): the people at a glance - a few numbers, what needs doing now, and everybody with where they are. A new
 * person is added in steps (/arpo/hr/ny); each one's details are on their own card. Pay only on the card (logged).
 */
export default async function HrPage({ searchParams }: { searchParams: Promise<{ saved?: string; vis?: string }> }) {
  const user = await getTeamUser();
  if (!user) redirect("/api/auth/session-ended?next=/arpo/hr");
  if (!isHrAdmin(user)) redirect("/arpo/mig");
  const sp = await searchParams;
  const today = todayDk();
  const all = await prisma.employee.findMany({ include: { user: { select: { name: true, lastName: true, disabledAt: true } }, absences: true }, orderBy: { user: { name: "asc" } } });
  const ended = (e: (typeof all)[number]) => Boolean(e.endDate && e.endDate.toISOString().slice(0, 10) < today);
  const current = all.filter((e) => !ended(e));
  const showEnded = sp.vis === "alle";
  const list = showEnded ? all : current;
  const ids = all.map((e) => e.id);
  const names = new Map(all.map((e) => [e.id, `${e.user.name}${e.user.lastName ? ` ${e.user.lastName}` : ""}`]));
  const [weeks, pending, trips, away, missing] = await Promise.all([
    prisma.workWeek.findMany({ where: { employeeId: { in: ids }, submittedAt: { not: null }, approvedAt: null }, orderBy: { weekStart: "asc" } }),
    prisma.absence.findMany({ where: { employeeId: { in: ids }, status: "REQUESTED" }, orderBy: { from: "asc" } }),
    prisma.trip.findMany({ where: { employeeId: { in: ids }, status: "REQUESTED" }, orderBy: { date: "asc" } }),
    prisma.absence.findMany({ where: { employeeId: { in: ids }, status: "APPROVED", to: { gte: new Date(`${today}T00:00:00Z`) }, from: { lte: new Date(`${addDays(today, 28)}T00:00:00Z`) } }, orderBy: { from: "asc" } }),
    Promise.all(current.filter((e) => registersTime(e.kind) && !e.user.disabledAt).map(async (e) => [e.id, (await missingWeeks(e, today, 4)).length] as const)),
  ]);
  const missingOf = new Map(missing);
  const status = new Map(all.map((e) => [e.id, hrStatus(e, e.user, today)]));
  const awayToday = away.filter((a) => a.from.toISOString().slice(0, 10) <= today).length;

  // What needs doing now - one list, each with where to do it.
  const todo: { who: string; what: string; href: string }[] = [
    ...current.flatMap((e) => (status.get(e.id)?.todo ? [{ who: names.get(e.id)!, what: status.get(e.id)!.todo!, href: `/arpo/hr/${e.id}` }] : [])),
    ...weeks.map((w) => ({ who: names.get(w.employeeId)!, what: `Godkend uge ${weekNumber(w.weekStart.toISOString().slice(0, 10))}`, href: `/arpo/hr/${w.employeeId}?uge=${w.weekStart.toISOString().slice(0, 10)}` })),
    ...current.filter((e) => e.rule120 && sickDays12Months(spansOf(e.absences), today) >= 100).map((e) => ({ who: names.get(e.id)!, what: `${sickDays12Months(spansOf(e.absences), today)} sygedage (120-dages-reglen)`, href: `/arpo/hr/${e.id}` })),
  ];
  const tiles: [string, number][] = [
    ["Ansatte", current.filter((e) => e.kind !== "FREELANCE").length],
    ["Freelancere", current.filter((e) => e.kind === "FREELANCE").length],
    ["Væk i dag", awayToday],
    ["Kræver handling", todo.length + pending.length + trips.length],
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">HR</h1>
        <div className="flex gap-2">
          <Link href="/arpo/hr/loen" className={btnLight}>
            Lønsedler-grundlag
          </Link>
          <Link href="/arpo/hr/ny" className={btn}>
            Ny medarbejder
          </Link>
        </div>
      </div>
      <Saved msg={sp.saved} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map(([k, n]) => (
          <div key={k} className={`rounded-xl border bg-white p-4 shadow-sm ${k === "Kræver handling" && n ? "border-amber-300" : "border-slate-200"}`}>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{k}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{n}</div>
          </div>
        ))}
      </div>

      {todo.length + pending.length + trips.length > 0 && (
        <Card title="Kræver handling">
          {todo.length > 0 && (
            <ul className="divide-y divide-slate-100">
              {todo.map((t, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span>
                    <span className="font-medium text-slate-900">{t.who}</span> <span className="text-slate-600">{t.what}</span>
                  </span>
                  <Link href={t.href} className="shrink-0 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700">
                    Åbn
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {pending.length > 0 && (
            <div className="mt-3 border-t border-slate-100 pt-3">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Fravær</div>
              <AbsenceList list={pending} backTo="/arpo/hr" mode="decide" names={names} />
            </div>
          )}
          {trips.length > 0 && (
            <div className="mt-3 border-t border-slate-100 pt-3">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Kørsel</div>
              <TripList list={trips} backTo="/arpo/hr" mode="decide" names={names} />
            </div>
          )}
        </Card>
      )}

      <Card title="Medarbejdere" right={<Link href={showEnded ? "/arpo/hr" : "/arpo/hr?vis=alle"} className="text-xs text-slate-500 underline">{showEnded ? "Skjul fratrådte" : "Vis også fratrådte"}</Link>}>
        {list.length ? (
          <ul className="divide-y divide-slate-100">
            {list.map((e) => {
              const s = status.get(e.id)!;
              const miss = missingOf.get(e.id) ?? 0;
              return (
                <li key={e.id}>
                  <Link href={`/arpo/hr/${e.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 hover:bg-slate-50">
                    <span className="min-w-[180px] flex-1">
                      <span className="block font-medium text-slate-900">{names.get(e.id)}</span>
                      <span className="block text-xs text-slate-500">
                        {e.title}, {KIND_NAMES[e.kind].toLowerCase()}
                      </span>
                    </span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE[s.tone]}`}>{s.label}</span>
                    <span className="w-28 text-right text-xs text-slate-500">
                      {registersTime(e.kind) && !e.user.disabledAt ? (miss ? <span className="text-amber-700">{miss} uge{miss > 1 ? "r" : ""} uden timer</span> : "Timer ajour") : ""}
                    </span>
                    <span className="w-24 text-right text-xs tabular-nums text-slate-500">{registersTime(e.kind) ? `${holidayBalance(e, e.absences, today).balance.toLocaleString("da-DK")} feriedage` : ""}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">
            Ingen endnu.{" "}
            <Link href="/arpo/hr/ny" className="underline">
              Tilføj den første
            </Link>
            .
          </p>
        )}
      </Card>

      {away.length > 0 && (
        <Card title="Væk de næste 4 uger">
          <AbsenceList list={away} backTo="/arpo/hr" mode="admin" names={names} />
        </Card>
      )}
    </div>
  );
}
