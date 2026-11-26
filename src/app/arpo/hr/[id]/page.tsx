import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getTeamUser } from "@/lib/auth";
import { isHrAdmin, maySeePay, reachOf } from "@/lib/hr-access";
import { addHrTask, addPayTerms, giveNotice, reopenWeek, toggleHrTask, updateEmployee, withdrawNotice } from "@/lib/actions/hr";
import { KIND_NAMES, addDays, hoursText, isYmd, mondayOf, noticeEnd, registersTime, sickDays12Months, todayDk } from "@/lib/hr";
import { holidayBalance, loadWeek, spansOf, tripsOfYear, warningsFor } from "@/lib/hr-data";
import { TEAM_ROLE_NAMES, rolesOf } from "@/lib/team-roles";
import { AbsenceForm, AbsenceList, Card, HolidayBox, Saved, TripList, WeekForm, Warnings, btn, btnLight, fmtDate, input, label } from "../hr-ui";
import { EmploymentFields, PayFields } from "../employee-form";
import { PayLine } from "../pay-view";

const CATEGORY_NAMES: Record<string, string> = { FILMING: "Filmning", TOUR_EDITING: "Tour-opbygning", REFILMING: "Genoptagelse", CORRECTIONS: "Rettelser", WEBSITE: "Hjemmeside" };

/*
 * One person in HR (admin): the employment, pay and its history (each look logged), the registered weeks,
 * absence and holiday - and what they've worked on in Arpo.
 */
export default async function EmployeePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ uge?: string; saved?: string }> }) {
  const user = await getTeamUser();
  if (!user) redirect("/api/auth/session-ended?next=/arpo/hr");
  if (!isHrAdmin(user)) redirect("/arpo/mig");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const e = await prisma.employee.findUnique({
    where: { id },
    include: { user: { select: { id: true, name: true, lastName: true, email: true, role: true, extraRoles: true, disabledAt: true } }, manager: { select: { name: true } }, pay: { orderBy: { effectiveFrom: "desc" } }, absences: { orderBy: { from: "desc" } }, tasks: { orderBy: [{ sort: "asc" }, { label: "asc" }] } },
  });
  if (!e) notFound();
  const reach = reachOf(user, e)!;
  const today = todayDk();
  const time = registersTime(e.kind);
  const monday = isYmd(sp.uge) ? mondayOf(sp.uge) : mondayOf(today);
  const showPay = await maySeePay(user, e, reach);
  const since = new Date(`${addDays(today, -30)}T00:00:00Z`);
  const [week, warnings, work, leaders, changes] = await Promise.all([
    time ? loadWeek(e, monday) : null,
    time ? warningsFor(e, today) : [],
    prisma.timeEntry.groupBy({ by: ["category"], where: { userId: e.userId, date: { gte: since } }, _sum: { minutes: true } }),
    prisma.user.findMany({ where: { disabledAt: null, id: { not: e.userId } }, select: { id: true, name: true, lastName: true }, orderBy: { name: "asc" } }),
    time ? prisma.workDayChange.findMany({ where: { employeeId: e.id, date: { gte: new Date(`${monday}T00:00:00Z`), lte: new Date(`${addDays(monday, 6)}T00:00:00Z`) } }, orderBy: { at: "desc" }, take: 20 }) : [],
  ]);
  const byIds = [...new Set(changes.map((c) => c.byId))];
  const by = new Map((await prisma.user.findMany({ where: { id: { in: byIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const name = `${e.user.name}${e.user.lastName ? ` ${e.user.lastName}` : ""}`;
  const here = `/arpo/hr/${e.id}`;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link href="/arpo/hr" className="text-sm text-slate-500 hover:text-slate-800">
        ‹ HR
      </Link>
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{name}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {e.title}, {KIND_NAMES[e.kind].toLowerCase()}. I Arpo: {rolesOf(e.user).map((r) => TEAM_ROLE_NAMES[r]).join(", ")}. {e.user.email}
          {e.user.disabledAt ? " (deaktiveret)" : ""}
        </p>
      </div>
      <Saved msg={sp.saved} />
      <Warnings list={warnings} />

      {week && (
        <>
          <WeekForm employee={e} monday={monday} rows={week.rows} week={week.week} approverName={week.approverName} basePath={here} canEdit canApprove />
          {week.week?.approvedAt && (
            <form action={reopenWeek.bind(null, e.id, monday)}>
              <button className={btnLight}>Åbn ugen igen</button>
            </form>
          )}
          {changes.length > 0 && (
            <Card title="Ændringer i ugen" sub="Alle registreringer og rettelser gemmes og kan ikke slettes.">
              <ul className="space-y-1 text-xs text-slate-600">
                {changes.map((c) => (
                  <li key={c.id}>
                    {fmtDate(c.date)}: {c.oldMinutes == null ? "registreret" : `${hoursText(c.oldMinutes)} →`} {hoursText(c.newMinutes)} af {by.get(c.byId) ?? "ukendt"}, {c.at.toLocaleString("da-DK", { timeZone: "Europe/Copenhagen" })}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}

      {e.rule120 && !e.endDate && (() => {
        const n = sickDays12Months(spansOf(e.absences), today);
        const now = n >= 120;
        const near = n >= 100;
        return (
          <div className={`rounded-xl border p-4 text-sm ${now ? "border-rose-300 bg-rose-50 text-rose-900" : near ? "border-amber-300 bg-amber-50 text-amber-900" : "border-slate-200 bg-white text-slate-700"}`}>
            <span className="font-semibold">120-dages-reglen: {n} sygedage med løn de seneste 12 måneder.</span>{" "}
            {now
              ? "Grænsen er nået. Skal I bruge reglen, skal opsigelsen gives nu, mens medarbejderen stadig er syg: 1 måneds varsel til udgangen af en måned. Venter I, mister I retten denne gang."
              : near
                ? `${120 - n} dage til grænsen. Overvej i god tid, om I vil bruge reglen.`
                : "Alle kalenderdage i en sygeperiode tæller, også weekender. Gælder ikke graviditet og barsel."}
          </div>
        );
      })()}
      {time && <HolidayBox b={holidayBalance(e, e.absences, today)} />}
      {time && (
        <Card title="Fravær">
          <AbsenceForm employeeId={e.id} backTo={here} forOther />
          <div className="mt-5 border-t border-slate-100 pt-3">
            <AbsenceList list={e.absences} backTo={here} mode="admin" />
          </div>
        </Card>
      )}

      {time && (
        <Card
          title="Kørsel"
          sub={`${e.homeAddress ? `Adresse: ${e.homeAddress}. ` : "Ingen hjemmeadresse endnu. "}${e.carPlates ? `Bil: ${e.carPlates}.` : ""}`}
          right={
            <a href={`/api/hr/koersel?medarbejder=${e.id}&maaned=${today.slice(0, 7)}`} className={btnLight}>
              Kørselsregnskab (PDF)
            </a>
          }
        >
          {await (async () => {
            const y = await tripsOfYear(e.id, Number(today.slice(0, 4)));
            const list = await prisma.trip.findMany({ where: { employeeId: e.id, date: { gte: new Date(`${addDays(today, -62)}T00:00:00Z`) } }, orderBy: { date: "desc" } });
            return <TripList list={list} backTo={here} mode="admin" payOf={y.pay} />;
          })()}
        </Card>
      )}

      {showPay && (
        <Card title="Løn" sub="Kun admin og personen selv kan se lønnen. Hver gang en admin åbner den, logges det.">
          {e.pay.length ? (
            <ul className="space-y-3">
              {e.pay.map((p, i) => (
                <li key={p.id} className={i ? "opacity-60" : ""}>
                  <PayLine p={p} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">Ingen løn sat endnu.</p>
          )}
          <details className="mt-4 border-t border-slate-100 pt-3">
            <summary className="cursor-pointer text-sm font-semibold text-slate-700">Ny løn fra en dato</summary>
            <form action={addPayTerms.bind(null, e.id)} className="mt-3 space-y-3">
              <PayFields p={e.pay[0]} withDate />
              <button className={btn}>Gem lønnen</button>
            </form>
          </details>
        </Card>
      )}

      <Card title="Hvad de laver" sub="Timer på kunder i Arpo de seneste 30 dage (filmning, tours osv.).">
        {work.length ? (
          <ul className="flex flex-wrap gap-2 text-sm">
            {work.map((w) => (
              <li key={w.category ?? "x"} className="rounded-lg bg-slate-50 px-3 py-1.5">
                {CATEGORY_NAMES[w.category ?? ""] ?? "Mails"}: <span className="font-semibold tabular-nums">{hoursText(w._sum.minutes ?? 0)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">Ingen timer på kunder de seneste 30 dage.</p>
        )}
      </Card>

      {(["start", "stop"] as const).map((phase) => {
        const list = e.tasks.filter((t) => t.phase === phase);
        if (phase === "stop" && !list.length) return null;
        const done = list.filter((t) => t.doneAt).length;
        return (
          <Card key={phase} title={phase === "start" ? "Når de starter" : "Når de stopper"} sub={`${done} af ${list.length} klaret`}>
            <ul className="space-y-1.5">
              {list.map((t) => (
                <li key={t.id}>
                  <form action={toggleHrTask.bind(null, t.id)}>
                    <button className="flex items-start gap-2.5 text-left text-sm">
                      <span className={`mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded border text-[10px] ${t.doneAt ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300 bg-white"}`}>{t.doneAt ? "✓" : ""}</span>
                      <span className={t.doneAt ? "text-slate-400 line-through" : "text-slate-800"}>{t.label}</span>
                    </button>
                  </form>
                </li>
              ))}
            </ul>
            <form action={addHrTask.bind(null, e.id, phase)} className="mt-3 flex gap-2">
              <input name="label" maxLength={200} placeholder="Tilføj et punkt" className={input} />
              <button className={btnLight}>Tilføj</button>
            </form>
          </Card>
        );
      })}

      <Card
        title="Fratrædelse"
        sub={
          e.noticeGivenAt
            ? `Opsagt ${fmtDate(e.noticeGivenAt)} af ${e.noticeBy === "employee" ? "medarbejderen" : "Nextview360"}. Sidste arbejdsdag ${fmtDate(e.endDate)}. Adgangen til Arpo lukker dagen efter.`
            : "Når nogen siger op eller bliver opsagt: varslet regnes ud efter funktionærloven, og adgangen lukker af sig selv efter sidste dag."
        }
      >
        {e.noticeGivenAt ? (
          <form action={withdrawNotice.bind(null, e.id)}>
            <button className={btnLight}>Træk opsigelsen tilbage</button>
          </form>
        ) : (
          <form action={giveNotice.bind(null, e.id)} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label>
              <span className={label}>Opsagt af</span>
              <select name="by" className={input}>
                <option value="employer">Nextview360</option>
                <option value="employee">Medarbejderen</option>
              </select>
            </label>
            <label>
              <span className={label}>Opsagt den</span>
              <input type="date" name="noticeDay" required defaultValue={today} className={input} />
            </label>
            <label>
              <span className={label}>Sidste dag (kun ved anden aftale)</span>
              <input type="date" name="lastDay" className={input} />
            </label>
            <div className="flex items-end">
              <button className={btn}>Registrér opsigelsen</button>
            </div>
            <p className="col-span-2 text-xs text-slate-500 sm:col-span-4">
              {(() => {
                const a = noticeEnd(e.kind, e.startDate.toISOString().slice(0, 10), e.probationEnd?.toISOString().slice(0, 10) ?? null, today, "employer");
                const b = noticeEnd(e.kind, e.startDate.toISOString().slice(0, 10), e.probationEnd?.toISOString().slice(0, 10) ?? null, today, "employee");
                return a && b
                  ? `Opsagt i dag: af Nextview360 er sidste dag ${fmtDate(a.lastDay)} (${a.why.charAt(0).toLowerCase()}${a.why.slice(1)}) Af medarbejderen: ${fmtDate(b.lastDay)}. Opsigelsen skal gives skriftligt. 120-dages-reglen gælder kun, hvis den står i kontrakten.`
                  : "Varslet følger kontrakten (ikke funktionærloven) - skriv sidste dag. Er en timelønnet funktionær (over 8 timer om ugen), gælder funktionærlovens varsel også."
              })()}
            </p>
          </form>
        )}
      </Card>

      <Card title="Ansættelse">
        <form action={updateEmployee.bind(null, e.id)} className="space-y-4">
          <EmploymentFields e={e} leaders={leaders.map((l) => ({ id: l.id, name: `${l.name}${l.lastName ? ` ${l.lastName}` : ""}` }))} />
          {time && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <label>
                <span className={label}>Overført ferie (dage)</span>
                <input name="vacationCarryDays" inputMode="decimal" defaultValue={String(e.vacationCarryDays).replace(".", ",")} className={input} />
              </label>
              <label>
                <span className={label}>Til ferieåret, der begyndte</span>
                <input type="date" name="vacationCarryFrom" defaultValue={e.vacationCarryFrom?.toISOString().slice(0, 10) ?? ""} className={input} />
              </label>
            </div>
          )}
          <button className={btn}>Gem</button>
        </form>
      </Card>
    </div>
  );
}
