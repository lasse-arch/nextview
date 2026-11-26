import Link from "next/link";
import type { Absence, Employee } from "@prisma/client";
import { approveWeek, cancelAbsence, decideAbsence, requestAbsence, saveWeek } from "@/lib/actions/hr";
import { ABSENCE_NAMES, ABSENCE_STATUS_NAMES, addDays, hoursText, weekNumber, type Warning, type Ymd } from "@/lib/hr";
import type { WeekRow, holidayBalance } from "@/lib/hr-data";

/* HR's shared pieces - server components; the actions behind them check who is asking themselves. */

const DAY_NAMES = ["Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag", "Lørdag", "Søndag"];
const fmtDay = (d: Ymd) => `${Number(d.slice(8))}/${Number(d.slice(5, 7))}`;
export const fmtDate = (d: Date | Ymd | null | undefined) => {
  if (!d) return "-";
  const s = typeof d === "string" ? d : d.toISOString().slice(0, 10);
  return `${Number(s.slice(8))}. ${["jan.", "feb.", "mar.", "apr.", "maj", "jun.", "jul.", "aug.", "sep.", "okt.", "nov.", "dec."][Number(s.slice(5, 7)) - 1]} ${s.slice(0, 4)}`;
};
const decimal = (minutes: number) => (Math.round((minutes / 60) * 100) / 100).toString().replace(".", ",");
const days = (n: number) => `${n.toLocaleString("da-DK", { maximumFractionDigits: 2 })} ${n === 1 ? "dag" : "dage"}`;

export function Saved({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">{msg}</div>;
}

export function Card({ title, sub, children, right }: { title: string; sub?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          {sub && <p className="mt-0.5 text-sm text-slate-500">{sub}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

export const input = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none";
export const label = "block text-[11px] font-semibold uppercase tracking-wide text-slate-500";
export const btn = "rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-40";
export const btnLight = "rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40";

/**
 * The week's registered time: each day filled in with the agreed hours (less approved absence), to be corrected
 * where the day was different - then "Registrér ugen" confirms it (arbejdstidsloven).
 */
export function WeekForm({
  employee,
  monday,
  rows,
  week,
  approverName,
  basePath,
  canEdit,
  canApprove,
}: {
  employee: Employee;
  monday: Ymd;
  rows: WeekRow[];
  week: { submittedAt: Date | null; approvedAt: Date | null } | null;
  approverName: string | null;
  basePath: string;
  canEdit: boolean;
  canApprove: boolean;
}) {
  const sep = basePath.includes("?") ? "&" : "?";
  const here = `${basePath}${sep}uge=${monday}`;
  const value = (r: WeekRow) => (r.minutes ?? r.prefill);
  const total = rows.reduce((n, r) => n + (r.future || r.outside ? 0 : value(r)), 0);
  const norm = rows.reduce((n, r) => n + r.norm, 0);
  const begun = rows.some((r) => !r.future);
  const status = week?.approvedAt
    ? `Godkendt${approverName ? ` af ${approverName}` : ""} ${fmtDate(week.approvedAt)}`
    : week?.submittedAt
      ? `Registreret ${fmtDate(week.submittedAt)} - venter på godkendelse`
      : begun
        ? "Ikke registreret endnu"
        : "Ugen er ikke begyndt";
  return (
    <Card
      title={`Uge ${weekNumber(monday)}`}
      sub={`${fmtDay(monday)} - ${fmtDay(addDays(monday, 6))}  |  ${status}`}
      right={
        <div className="flex gap-1.5">
          <Link href={`${basePath}${sep}uge=${addDays(monday, -7)}`} className={btnLight} aria-label="Ugen før">
            ‹
          </Link>
          <Link href={`${basePath}${sep}uge=${addDays(monday, 7)}`} className={btnLight} aria-label="Ugen efter">
            ›
          </Link>
        </div>
      }
    >
      <form action={saveWeek.bind(null, employee.id, monday, here)}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <th className="py-2">Dag</th>
              <th className="py-2 text-right">Aftalt</th>
              <th className="w-32 py-2 pl-4">Arbejdet (timer)</th>
              <th className="py-2 pl-3"> </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const off = r.future || r.outside;
              const changed = r.minutes !== null && r.minutes !== r.prefill;
              const why = r.outside ? "Ikke ansat" : r.holiday ?? (r.absence ? `${ABSENCE_NAMES[r.absence.split(":")[0] as keyof typeof ABSENCE_NAMES]}${r.absence.endsWith(":half") ? " (halv dag)" : ""}` : r.norm === 0 ? "Fridag" : "");
              return (
                <tr key={r.date} className="border-b border-slate-50">
                  <td className="py-2 text-slate-800">
                    {DAY_NAMES[i]} <span className="text-slate-400">{fmtDay(r.date)}</span>
                  </td>
                  <td className="py-2 text-right tabular-nums text-slate-500">{r.norm ? decimal(r.norm) : "-"}</td>
                  <td className="py-1.5 pl-4">
                    <input
                      name={`d_${r.date}`}
                      defaultValue={off ? "" : decimal(value(r))}
                      disabled={off || !canEdit}
                      inputMode="decimal"
                      aria-label={`Timer ${DAY_NAMES[i]} ${fmtDay(r.date)}`}
                      className={`${input} py-1.5 text-right tabular-nums ${changed ? "border-amber-400 bg-amber-50" : ""}`}
                    />
                  </td>
                  <td className="py-2 pl-3 text-xs text-slate-500">{why}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td className="pt-3 font-semibold text-slate-900">I alt</td>
              <td className="pt-3 text-right tabular-nums text-slate-500">{decimal(norm)}</td>
              <td className="pt-3 pl-4 text-right font-semibold tabular-nums text-slate-900">{decimal(total)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
        <p className="mt-3 text-xs text-slate-500">
          Dagene er udfyldt med den aftalte tid. Ret de dage, hvor du har arbejdet mere eller mindre, og registrér ugen. Det er den samlede tid pr. dag, der tæller - ikke klokkeslæt. Fx 7,4 eller 7:24.
        </p>
        {canEdit && (
          <div className="mt-4 flex flex-wrap gap-2">
            <button name="submit" value="1" className={btn} disabled={!begun}>
              {week?.submittedAt ? "Registrér ugen igen" : "Registrér ugen"}
            </button>
            <button name="submit" value="0" className={btnLight}>
              Gem uden at registrere
            </button>
          </div>
        )}
      </form>
      {canApprove && week?.submittedAt && !week.approvedAt && (
        <form action={approveWeek.bind(null, employee.id, monday, here)} className="mt-3">
          <button className={btn}>Godkend ugen</button>
        </form>
      )}
      <p className="mt-2 text-xs text-slate-400">Normtid {hoursText(employee.weeklyMinutes)} om ugen.</p>
    </Card>
  );
}

export function Warnings({ list }: { list: Warning[] }) {
  if (!list.length) return null;
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
      <p className="text-sm font-semibold text-amber-900">Hold øje med arbejdstiden</p>
      <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-amber-900">
        {list.slice(0, 6).map((w, i) => (
          <li key={i}>{w.text}</li>
        ))}
      </ul>
    </div>
  );
}

export function HolidayBox({ b }: { b: ReturnType<typeof holidayBalance> }) {
  return (
    <Card title={`Ferie ${b.year.label}`} sub={`Ferieåret ${fmtDate(b.year.from)} - ${fmtDate(b.year.to)}. Der optjenes 2,08 dage pr. måned.`}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Optjent indtil nu", days(b.earned)],
          ["Overført", days(b.carry)],
          ["Holdt eller godkendt", days(b.used)],
          ["Tilbage", days(b.balance)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg bg-slate-50 px-3 py-2.5">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{k}</div>
            <div className={`mt-0.5 text-lg font-semibold tabular-nums ${k === "Tilbage" && b.balance < 0 ? "text-rose-700" : "text-slate-900"}`}>{v}</div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-500">
        {b.planned > 0 && `${days(b.planned)} venter på godkendelse. `}
        Hele ferieåret giver {days(b.wholeYear)}. Ferie kan holdes på forskud efter aftale. Det officielle ferieregnskab ligger i lønsystemet.
      </p>
    </Card>
  );
}

/** Ask for holiday or time off - or report sickness (no approval needed). */
export function AbsenceForm({ employeeId, backTo, forOther = false }: { employeeId: string; backTo: string; forOther?: boolean }) {
  return (
    <form action={requestAbsence.bind(null, employeeId, backTo)} className="grid grid-cols-2 gap-3 sm:grid-cols-6">
      <label className="col-span-2">
        <span className={label}>Hvad</span>
        <select name="kind" className={input} defaultValue="VACATION">
          {Object.entries(ABSENCE_NAMES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className={label}>Fra</span>
        <input type="date" name="from" required className={input} />
      </label>
      <label>
        <span className={label}>Til og med</span>
        <input type="date" name="to" className={input} />
      </label>
      <label className="col-span-2">
        <span className={label}>Note</span>
        <input name="note" maxLength={500} className={input} placeholder="Valgfri" />
      </label>
      <label className="col-span-2 flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" name="halfDay" /> Kun halve dage
      </label>
      <div className="col-span-2 sm:col-span-4 sm:text-right">
        <button className={btn}>{forOther ? "Registrér fravær" : "Send"}</button>
      </div>
      <p className="col-span-2 text-xs text-slate-500 sm:col-span-6">
        {forOther ? "Fravær, du registrerer for en anden, er godkendt med det samme." : "Ferie, fri og orlov sendes til godkendelse. Sygdom og barns sygdom er registreret med det samme."}
      </p>
    </form>
  );
}

export function AbsenceList({
  list,
  backTo,
  mode,
  names,
}: {
  list: Absence[];
  backTo: string;
  /** "own": may cancel their own requests; "decide": may approve/reject; "admin": may cancel any. */
  mode: "own" | "decide" | "admin";
  names?: Map<string, string>;
}) {
  if (!list.length) return <p className="text-sm text-slate-500">Intet fravær.</p>;
  return (
    <ul className="divide-y divide-slate-100">
      {list.map((a) => (
        <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
          <div>
            <span className="font-medium text-slate-900">
              {names?.get(a.employeeId) ? `${names.get(a.employeeId)}: ` : ""}
              {ABSENCE_NAMES[a.kind]}
              {a.halfDay ? " (halve dage)" : ""}
            </span>{" "}
            <span className="text-slate-500">
              {fmtDate(a.from)}
              {a.to.getTime() !== a.from.getTime() ? ` - ${fmtDate(a.to)}` : ""}
            </span>
            {a.note && <span className="block text-xs text-slate-500">{a.note}</span>}
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${a.status === "APPROVED" ? "bg-emerald-50 text-emerald-700" : a.status === "REQUESTED" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-500"}`}
            >
              {ABSENCE_STATUS_NAMES[a.status]}
            </span>
            {mode === "decide" && a.status === "REQUESTED" && (
              <>
                <form action={decideAbsence.bind(null, a.id, true, backTo)}>
                  <button className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700">Godkend</button>
                </form>
                <form action={decideAbsence.bind(null, a.id, false, backTo)}>
                  <button className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">Afvis</button>
                </form>
              </>
            )}
            {(mode === "admin" ? a.status !== "CANCELLED" && a.status !== "REJECTED" : mode === "own" && (a.status === "REQUESTED" || (a.status === "APPROVED" && a.from.toISOString().slice(0, 10) > new Date().toISOString().slice(0, 10)))) && (
              <form action={cancelAbsence.bind(null, a.id, backTo)}>
                <button className="text-xs font-medium text-slate-500 underline hover:text-slate-800">Annullér</button>
              </form>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
