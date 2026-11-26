import { redirect } from "next/navigation";
import { estimatedPay, payrollMonth } from "@/lib/hr-payroll";
import { prisma } from "@/lib/db";
import { getTeamUser } from "@/lib/auth";
import { teamCan } from "@/lib/team-roles";
import { KIND_NAMES, hoursText, isYmd, mondayOf, monthsBack, registersTime, todayDk, weekNumber } from "@/lib/hr";
import { holidayBalance, loadWeek, missingWeeks, tripSuggestions, tripsOfYear, warningsFor } from "@/lib/hr-data";
import { AbsenceForm, AbsenceList, Card, HolidayBox, Saved, TripList, WeekForm, Warnings, btnLight, fmtDate, input, label } from "../hr/hr-ui";
import { TripForm } from "../hr/trip-form";
import { saveCarDetails } from "@/lib/actions/hr";
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
  const ym = today.slice(0, 7);
  const [year, suggestions, myTrips] = await Promise.all([
    time ? tripsOfYear(e.id, Number(today.slice(0, 4))) : null,
    time ? tripSuggestions(user.id) : [],
    time ? prisma.trip.findMany({ where: { employeeId: e.id, OR: [{ date: { gte: new Date(`${ym}-01T00:00:00Z`) } }, { status: "REQUESTED" }] }, orderBy: { date: "desc" } }) : [],
  ]);
  const monthKr = myTrips.filter((t) => t.status === "APPROVED" && t.date.toISOString().slice(0, 7) === ym).reduce((n, t) => n + (year?.pay.get(t.id) ?? 0), 0);
  const plates = (e.carPlates ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  // "Timer og udbetaling": this month and last month, as lønsedler-grundlaget counts them - only their own row.
  const lastYm = monthsBack(today, 1).slice(0, 7);
  const payNow = pay
    ? (
        await Promise.all(
          [
            ["Denne måned", ym],
            ["Sidste måned", lastYm],
          ].map(async ([l, m]) => ({ label: l, row: (await payrollMonth(m, { employeeId: e.id }))[0] }))
        )
      ).flatMap(({ label: l, row }) => (row ? [{ label: l, r: row, est: estimatedPay(row) }] : []))
    : null;

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
      {payNow && (
        <Card title="Timer og udbetaling" sub="Et skøn ud fra dine registrerede timer og din løn - før skat. Lønsystemet regner den endelige løn.">
          <div className="grid gap-3 sm:grid-cols-2">
            {payNow.map(({ label: l, r, est }) => (
              <div key={l} className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{l}</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">ca. {est.grossKr.toLocaleString("da-DK", { maximumFractionDigits: 0 })} kr.</p>
                <ul className="mt-2 space-y-0.5 text-sm text-slate-600">
                  {r.workedHours != null && (
                    <li>
                      {r.workedHours.toLocaleString("da-DK")} timer registreret{r.hourlyKr ? ` × ${r.hourlyKr.toLocaleString("da-DK")} kr.` : ""}
                    </li>
                  )}
                  {r.monthlyKr != null && <li>Månedsløn {r.monthlyKr.toLocaleString("da-DK")} kr.{r.employedShare < 1 ? ` (${Math.round(r.employedShare * 100)} % af måneden)` : ""}</li>}
                  {r.commissionHow === "løn" && r.commissionKr > 0 && <li>Provision {r.commissionKr.toLocaleString("da-DK")} kr.</li>}
                  {r.guaranteeTopUpKr > 0 && <li>Tillæg op til garantilønnen {r.guaranteeTopUpKr.toLocaleString("da-DK")} kr.</li>}
                  {est.tripKr > 0 && <li>Plus skattefri kørepenge {est.tripKr.toLocaleString("da-DK")} kr.</li>}
                </ul>
              </div>
            ))}
          </div>
        </Card>
      )}
      {time && <HolidayBox b={holidayBalance(e, absences, today)} />}
      {time && (
        <Card title="Fravær" sub="Søg ferie og fri, eller meld dig syg.">
          <AbsenceForm employeeId={e.id} backTo="/arpo/mig" />
          <div className="mt-5 border-t border-slate-100 pt-3">
            <AbsenceList list={absences} backTo="/arpo/mig" mode="own" />
          </div>
        </Card>
      )}
      {time && (
        <Card
          title="Kørsel"
          sub={`Kørepenge denne måned: ${monthKr.toLocaleString("da-DK", { minimumFractionDigits: 2 })} kr. (godkendte ture). Kørt i år: ${(year?.trips.reduce((n, t) => n + t.km, 0) ?? 0).toLocaleString("da-DK")} km.`}
          right={
            <a href={`/api/hr/koersel?medarbejder=${e.id}&maaned=${ym}`} className={btnLight}>
              Kørselsregnskab (PDF)
            </a>
          }
        >
          <TripForm employeeId={e.id} backTo="/arpo/mig" suggestions={suggestions} home={e.homeAddress} plates={plates} />
          <div className="mt-5 border-t border-slate-100 pt-3">
            <TripList list={myTrips} backTo="/arpo/mig" mode="own" payOf={year?.pay} />
          </div>
          <details className="mt-4 border-t border-slate-100 pt-3">
            <summary className="cursor-pointer text-sm font-semibold text-slate-700">Din adresse og bil</summary>
            <form action={saveCarDetails.bind(null, e.id, "/arpo/mig")} className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <label className="col-span-2">
                <span className={label}>Hjemmeadresse</span>
                <input name="homeAddress" defaultValue={e.homeAddress ?? ""} maxLength={200} className={input} />
              </label>
              <label>
                <span className={label}>Nummerplader</span>
                <input name="carPlates" defaultValue={e.carPlates ?? ""} maxLength={60} placeholder="AB 12 345" className={input} />
              </label>
              <div className="flex items-end">
                <button className={btnLight}>Gem</button>
              </div>
              <p className="col-span-2 text-xs text-slate-500 sm:col-span-4">Adressen står på dit kørselsregnskab, som Skattestyrelsen kræver. Kun du og en admin kan se den.</p>
            </form>
          </details>
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
