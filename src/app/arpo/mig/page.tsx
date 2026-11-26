import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getTeamUser } from "@/lib/auth";
import { teamCan } from "@/lib/team-roles";
import { KIND_NAMES, hoursText, isYmd, mondayOf, registersTime, todayDk, weekNumber } from "@/lib/hr";
import { holidayBalance, loadWeek, missingWeeks, warningsFor } from "@/lib/hr-data";
import { AbsenceForm, AbsenceList, Card, HolidayBox, Saved, WeekForm, Warnings, fmtDate } from "../hr/hr-ui";
import { PayLine } from "../hr/pay-view";

/*
 * Mig: one's own hours, absence, holiday and employment - for everybody on the team (HR). Only one's own: the
 * employee is found from the login, never from the address.
 */
export default async function MigPage({ searchParams }: { searchParams: Promise<{ uge?: string; saved?: string }> }) {
  const user = await getTeamUser();
  if (!user || !teamCan(user, "self")) redirect("/api/auth/session-ended?next=/arpo/mig");
  const sp = await searchParams;
  const e = await prisma.employee.findUnique({ where: { userId: user.id }, include: { manager: { select: { name: true } }, pay: { orderBy: { effectiveFrom: "desc" }, take: 1 } } });
  const first = user.name.split(" ")[0];

  if (!e)
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <h1 className="text-2xl font-semibold text-slate-900">Hej {first}</h1>
        <Card title="Du er ikke oprettet i HR endnu">
          <p className="text-sm text-slate-600">Når en admin har oprettet din ansættelse, kan du registrere din arbejdstid, søge ferie og se din ansættelse her.</p>
        </Card>
      </div>
    );

  const today = todayDk();
  const monday = isYmd(sp.uge) ? mondayOf(sp.uge) : mondayOf(today);
  const time = registersTime(e.kind);
  const [week, absences, warnings, missing] = await Promise.all([
    time ? loadWeek(e, monday) : null,
    prisma.absence.findMany({ where: { employeeId: e.id }, orderBy: { from: "desc" }, take: 30 }),
    time ? warningsFor(e, today) : [],
    time ? missingWeeks(e, today) : [],
  ]);
  const pay = e.pay[0];

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Hej {first}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {e.title}, {KIND_NAMES[e.kind].toLowerCase()}
          {e.manager ? `. Din leder er ${e.manager.name}.` : "."}
        </p>
      </div>
      <Saved msg={sp.saved} />
      {missing.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          Du mangler at registrere {missing.length === 1 ? "en uge" : `${missing.length} uger`}:{" "}
          {missing.map((m, i) => (
            <a key={m} href={`/arpo/mig?uge=${m}`} className="font-semibold underline">
              {i ? ", " : ""}uge {weekNumber(m)}
            </a>
          ))}
          .
        </div>
      )}
      <Warnings list={warnings} />
      {week && <WeekForm employee={e} monday={monday} rows={week.rows} week={week.week} approverName={week.approverName} basePath="/arpo/mig" canEdit={!week.week?.approvedAt} canApprove={false} />}
      {time && <HolidayBox b={holidayBalance(e, absences, today)} />}
      {time && (
        <Card title="Fravær" sub="Søg ferie og fri, eller meld dig syg.">
          <AbsenceForm employeeId={e.id} backTo="/arpo/mig" />
          <div className="mt-5 border-t border-slate-100 pt-3">
            <AbsenceList list={absences} backTo="/arpo/mig" mode="own" />
          </div>
        </Card>
      )}
      <Card title="Min ansættelse">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          {[
            ["Ansat som", KIND_NAMES[e.kind]],
            ["Stilling", e.title],
            ["Første dag", fmtDate(e.startDate)],
            ...(e.probationEnd ? [["Prøvetid til", fmtDate(e.probationEnd)]] : []),
            ...(e.endDate ? [["Sidste dag", fmtDate(e.endDate)]] : []),
            ...(time ? [["Normtid", `${hoursText(e.weeklyMinutes)} om ugen`]] : []),
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{k}</dt>
              <dd className="mt-0.5 text-slate-900">{v}</dd>
            </div>
          ))}
        </dl>
        {pay && (
          <div className="mt-4 border-t border-slate-100 pt-3">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Løn</div>
            <PayLine p={pay} />
            <p className="mt-2 text-xs text-slate-500">Lønsedler og skat ligger i lønsystemet. Er noget forkert, så sig det til en admin.</p>
          </div>
        )}
      </Card>
    </div>
  );
}
