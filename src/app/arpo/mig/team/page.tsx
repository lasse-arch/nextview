import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getTeamUser } from "@/lib/auth";
import { teamCan } from "@/lib/team-roles";
import { isHrAdmin, reachOf } from "@/lib/hr-access";
import { addDays, isYmd, mondayOf, registersTime, todayDk, weekNumber } from "@/lib/hr";
import { loadWeek, missingWeeks, warningsFor } from "@/lib/hr-data";
import { AbsenceForm, AbsenceList, Card, Saved, WeekForm, Warnings, fmtDate } from "../../hr/hr-ui";

/*
 * Mit team: a leader's people (an admin: everybody) - the weeks and absence waiting for approval, who's away,
 * and each one's week. Never anyone's pay. Only those the viewer leads (lib/hr-access.ts reachOf).
 */
export default async function TeamPage({ searchParams }: { searchParams: Promise<{ medarbejder?: string; uge?: string; saved?: string }> }) {
  const user = await getTeamUser();
  if (!user || !teamCan(user, "self")) redirect("/api/auth/session-ended?next=/arpo/mig/team");
  const sp = await searchParams;
  const admin = isHrAdmin(user);
  const team = await prisma.employee.findMany({
    where: { ...(admin ? {} : { managerId: user.id }), kind: { not: "FREELANCE" }, userId: { not: user.id } },
    include: { user: { select: { name: true, lastName: true } } },
    orderBy: { user: { name: "asc" } },
  });
  if (!team.length && !admin) redirect("/arpo/mig");
  const ids = team.map((e) => e.id);
  const names = new Map(team.map((e) => [e.id, `${e.user.name}${e.user.lastName ? ` ${e.user.lastName}` : ""}`]));
  const today = todayDk();

  // One person's week (only someone the viewer leads - or anyone, for an admin).
  const one = sp.medarbejder ? team.find((e) => e.id === sp.medarbejder) : null;
  if (one && !reachOf(user, one)) redirect("/arpo/mig/team");
  if (one && registersTime(one.kind)) {
    const monday = isYmd(sp.uge) ? mondayOf(sp.uge) : mondayOf(today);
    const [week, warnings] = await Promise.all([loadWeek(one, monday), warningsFor(one, today)]);
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <Link href="/arpo/mig/team" className="text-sm text-slate-500 hover:text-slate-800">
          ‹ Mit team
        </Link>
        <h1 className="text-2xl font-semibold text-slate-900">{names.get(one.id)}</h1>
        <Saved msg={sp.saved} />
        <Warnings list={warnings} />
        <WeekForm employee={one} monday={monday} rows={week.rows} week={week.week} approverName={week.approverName} basePath={`/arpo/mig/team?medarbejder=${one.id}`} canEdit={admin || !week.week?.approvedAt} canApprove />
        <Card title="Registrér fravær" sub="Fx sygdom, når medarbejderen har ringet ind.">
          <AbsenceForm employeeId={one.id} backTo={`/arpo/mig/team?medarbejder=${one.id}`} forOther />
        </Card>
      </div>
    );
  }

  const [weeks, pending, away, missing] = await Promise.all([
    prisma.workWeek.findMany({ where: { employeeId: { in: ids }, submittedAt: { not: null }, approvedAt: null }, orderBy: { weekStart: "asc" } }),
    prisma.absence.findMany({ where: { employeeId: { in: ids }, status: "REQUESTED" }, orderBy: { from: "asc" } }),
    prisma.absence.findMany({
      where: { employeeId: { in: ids }, status: "APPROVED", to: { gte: new Date(`${today}T00:00:00Z`) }, from: { lte: new Date(`${addDays(today, 28)}T00:00:00Z`) } },
      orderBy: { from: "asc" },
    }),
    Promise.all(team.map(async (e) => [e.id, await missingWeeks(e, today, 4)] as const)),
  ]);
  const behind = missing.filter(([, m]) => m.length);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Mit team</h1>
        <p className="mt-1 text-sm text-slate-500">{admin ? "Som admin ser du alle medarbejdere." : `Dem, du er leder for: ${team.length}.`} Du godkender timer og fravær her. Lønnen ser du ikke.</p>
      </div>
      <Saved msg={sp.saved} />
      <Card title="Uger til godkendelse">
        {weeks.length ? (
          <ul className="divide-y divide-slate-100">
            {weeks.map((w) => {
              const m = w.weekStart.toISOString().slice(0, 10);
              return (
                <li key={w.id} className="flex items-center justify-between py-2.5 text-sm">
                  <span>
                    <span className="font-medium text-slate-900">{names.get(w.employeeId)}</span> <span className="text-slate-500">uge {weekNumber(m)}</span>
                  </span>
                  <Link href={`/arpo/mig/team?medarbejder=${w.employeeId}&uge=${m}`} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700">
                    Se og godkend
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">Ingen uger venter.</p>
        )}
      </Card>
      <Card title="Fravær til godkendelse">
        <AbsenceList list={pending} backTo="/arpo/mig/team" mode="decide" names={names} />
      </Card>
      {behind.length > 0 && (
        <Card title="Mangler at registrere" sub="Uger de seneste 4 uger, som ikke er registreret.">
          <ul className="space-y-1 text-sm">
            {behind.map(([id, m]) => (
              <li key={id}>
                <span className="font-medium text-slate-900">{names.get(id)}</span>: <span className="text-slate-600">{m.map((x) => `uge ${weekNumber(x)}`).join(", ")}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card title="Væk de næste 4 uger">
        <AbsenceList list={away} backTo="/arpo/mig/team" mode={admin ? "admin" : "decide"} names={names} />
      </Card>
      <Card title="Teamet">
        <ul className="divide-y divide-slate-100">
          {team.map((e) => (
            <li key={e.id} className="flex items-center justify-between py-2.5 text-sm">
              <span>
                <span className="font-medium text-slate-900">{names.get(e.id)}</span> <span className="text-slate-500">{e.title}</span>
                {e.probationEnd && e.probationEnd.toISOString().slice(0, 10) >= today && <span className="ml-2 text-xs text-amber-700">prøvetid til {fmtDate(e.probationEnd)}</span>}
              </span>
              <Link href={`/arpo/mig/team?medarbejder=${e.id}`} className="text-xs font-semibold text-slate-600 underline hover:text-slate-900">
                Timer
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
