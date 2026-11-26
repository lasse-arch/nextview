import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getTeamUser } from "@/lib/auth";
import { isHrAdmin } from "@/lib/hr-access";
import { createEmployee } from "@/lib/actions/hr";
import { KIND_NAMES, addDays, registersTime, todayDk, weekNumber } from "@/lib/hr";
import { holidayBalance, missingWeeks } from "@/lib/hr-data";
import { TEAM_ROLES, TEAM_ROLE_NAMES } from "@/lib/team-roles";
import { AbsenceList, Card, Saved, btn, btnLight, fmtDate, input, label } from "./hr-ui";
import { EmploymentFields, PayFields } from "./employee-form";

/*
 * HR (admin): everybody who works for Nextview360 - employees and freelancers - what waits for approval, who's
 * away, and a new person. Pay is only on each one's own card (each look is logged).
 */
export default async function HrPage({ searchParams }: { searchParams: Promise<{ saved?: string; vis?: string }> }) {
  const user = await getTeamUser();
  if (!user) redirect("/api/auth/session-ended?next=/arpo/hr");
  if (!isHrAdmin(user)) redirect("/arpo/mig");
  const sp = await searchParams;
  const today = todayDk();
  const [all, users] = await Promise.all([
    prisma.employee.findMany({ include: { user: { select: { name: true, lastName: true, role: true, extraRoles: true, disabledAt: true } }, absences: true }, orderBy: { user: { name: "asc" } } }),
    prisma.user.findMany({ where: { disabledAt: null }, select: { id: true, name: true, lastName: true, employee: { select: { id: true } } }, orderBy: { name: "asc" } }),
  ]);
  const showEnded = sp.vis === "alle";
  const ended = (e: (typeof all)[number]) => Boolean(e.endDate && e.endDate.toISOString().slice(0, 10) < today);
  const list = all.filter((e) => showEnded || !ended(e));
  const ids = all.map((e) => e.id);
  const names = new Map(all.map((e) => [e.id, `${e.user.name}${e.user.lastName ? ` ${e.user.lastName}` : ""}`]));
  const [weeks, pending, away, missing] = await Promise.all([
    prisma.workWeek.findMany({ where: { employeeId: { in: ids }, submittedAt: { not: null }, approvedAt: null }, orderBy: { weekStart: "asc" } }),
    prisma.absence.findMany({ where: { employeeId: { in: ids }, status: "REQUESTED" }, orderBy: { from: "asc" } }),
    prisma.absence.findMany({ where: { employeeId: { in: ids }, status: "APPROVED", to: { gte: new Date(`${today}T00:00:00Z`) }, from: { lte: new Date(`${addDays(today, 28)}T00:00:00Z`) } }, orderBy: { from: "asc" } }),
    Promise.all(all.filter((e) => registersTime(e.kind) && !ended(e)).map(async (e) => [e.id, (await missingWeeks(e, today, 4)).length] as const)),
  ]);
  const missingOf = new Map(missing);
  const free = users.filter((u) => !u.employee);
  const leaders = users.map((u) => ({ id: u.id, name: `${u.name}${u.lastName ? ` ${u.lastName}` : ""}` }));

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">HR</h1>
          <p className="mt-1 text-sm text-slate-500">Alle, der arbejder for Nextview360: ansatte og freelancere. Kun admin ser denne side.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/arpo/hr/loen" className={btnLight}>
            Lønsedler-grundlag
          </Link>
          <a href="#ny" className={btn}>
            Tilføj medarbejder
          </a>
        </div>
      </div>
      <Saved msg={sp.saved} />

      <Card title="Medarbejdere" right={<Link href={showEnded ? "/arpo/hr" : "/arpo/hr?vis=alle"} className="text-xs text-slate-500 underline">{showEnded ? "Skjul fratrådte" : "Vis også fratrådte"}</Link>}>
        {list.length ? (
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-y border-slate-100 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-2">Navn</th>
                  <th className="px-3 py-2">Ansat som</th>
                  <th className="px-3 py-2">Stilling</th>
                  <th className="px-3 py-2">Siden</th>
                  <th className="px-3 py-2 text-right">Ferie tilbage</th>
                  <th className="px-5 py-2">Timer</th>
                </tr>
              </thead>
              <tbody>
                {list.map((e) => {
                  const time = registersTime(e.kind);
                  const miss = missingOf.get(e.id) ?? 0;
                  return (
                    <tr key={e.id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="px-5 py-2.5">
                        <Link href={`/arpo/hr/${e.id}`} className="font-medium text-slate-900 hover:underline">
                          {names.get(e.id)}
                        </Link>
                        {ended(e) && <span className="ml-2 text-xs text-slate-400">fratrådt</span>}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">{KIND_NAMES[e.kind]}</td>
                      <td className="px-3 py-2.5 text-slate-600">{e.title}</td>
                      <td className="px-3 py-2.5 text-slate-600">{fmtDate(e.startDate)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{time ? `${holidayBalance(e, e.absences, today).balance.toLocaleString("da-DK")} dage` : "-"}</td>
                      <td className="px-5 py-2.5">{!time ? <span className="text-slate-400">Registreres ikke</span> : miss ? <span className="text-amber-700">{miss} uge{miss > 1 ? "r" : ""} mangler</span> : <span className="text-emerald-700">Ajour</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Ingen endnu. Tilføj den første nedenfor.</p>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
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
                    <Link href={`/arpo/hr/${w.employeeId}?uge=${m}`} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700">
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
          <AbsenceList list={pending} backTo="/arpo/hr" mode="decide" names={names} />
        </Card>
      </div>
      <Card title="Væk de næste 4 uger">
        <AbsenceList list={away} backTo="/arpo/hr" mode="admin" names={names} />
      </Card>

      <div id="ny">
        <Card title="Tilføj medarbejder" sub="En, der allerede har adgang til Arpo, eller en ny person. En ny person logger ind med Google på sin e-mail.">
          <form action={createEmployee} className="space-y-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <label className="col-span-2 sm:col-span-4">
                <span className={label}>Findes i Arpo</span>
                <select name="userId" className={input} defaultValue="">
                  <option value="">Nej, opret en ny person nedenfor</option>
                  {free.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} {u.lastName ?? ""}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className={label}>Fornavn</span>
                <input name="name" maxLength={80} className={input} />
              </label>
              <label>
                <span className={label}>Efternavn</span>
                <input name="lastName" maxLength={80} className={input} />
              </label>
              <label>
                <span className={label}>E-mail</span>
                <input name="email" type="email" maxLength={200} className={input} />
              </label>
              <label>
                <span className={label}>Rolle i Arpo</span>
                <select name="role" defaultValue="EMPLOYEE" className={input}>
                  {TEAM_ROLES.filter((r) => r !== "ADMIN").map((r) => (
                    <option key={r} value={r}>
                      {TEAM_ROLE_NAMES[r]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="border-t border-slate-100 pt-4">
              <h3 className="mb-3 text-sm font-semibold text-slate-900">Ansættelsen</h3>
              <EmploymentFields leaders={leaders} />
            </div>
            <div className="border-t border-slate-100 pt-4">
              <h3 className="mb-3 text-sm font-semibold text-slate-900">Løn fra første dag</h3>
              <PayFields />
            </div>
            <button className={btn}>Opret medarbejder</button>
          </form>
        </Card>
      </div>
    </div>
  );
}
