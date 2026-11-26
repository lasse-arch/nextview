import Link from "next/link";
import { redirect } from "next/navigation";
import { getTeamUser } from "@/lib/auth";
import { isHrAdmin } from "@/lib/hr-access";
import { ABSENCE_NAMES, todayDk } from "@/lib/hr";
import { payrollMonth } from "@/lib/hr-payroll";
import { Card, btn, btnLight } from "../hr-ui";

const MONTHS = ["januar", "februar", "marts", "april", "maj", "juni", "juli", "august", "september", "oktober", "november", "december"];
const shift = (ym: string, n: number) => {
  const d = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5)) - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
const kr = (n: number | null) => (n == null ? "-" : `${n.toLocaleString("da-DK", { maximumFractionDigits: 2 })} kr.`);

/*
 * HR → Løn: the month's lønsedler-grundlag - what goes to the payroll system per person: pay terms, hours,
 * absence and the month's commission. Download as CSV (to import) or PDF. Only an admin.
 */
export default async function PayrollPage({ searchParams }: { searchParams: Promise<{ maaned?: string }> }) {
  const user = await getTeamUser();
  if (!user) redirect("/api/auth/session-ended?next=/arpo/hr/loen");
  if (!isHrAdmin(user)) redirect("/arpo/mig");
  const sp = await searchParams;
  const ym = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.maaned ?? "") ? sp.maaned! : todayDk().slice(0, 7);
  const rows = await payrollMonth(ym);
  const label = `${MONTHS[Number(ym.slice(5)) - 1]} ${ym.slice(0, 4)}`;
  const problems = rows.filter((r) => r.note).length;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Link href="/arpo/hr" className="text-sm text-slate-500 hover:text-slate-800">
        ‹ HR
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold capitalize text-slate-900">Lønsedler-grundlag, {label}</h1>
          <p className="mt-1 text-sm text-slate-500">Det, lønsystemet skal bruge for måneden. Skat, AM-bidrag, ATP og feriepenge beregnes i lønsystemet.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/arpo/hr/loen?maaned=${shift(ym, -1)}`} className={btnLight}>
            ‹
          </Link>
          <Link href={`/arpo/hr/loen?maaned=${shift(ym, 1)}`} className={btnLight}>
            ›
          </Link>
          <a href={`/api/hr/loen?maaned=${ym}&format=csv`} className={btnLight}>
            Hent CSV
          </a>
          <a href={`/api/hr/loen?maaned=${ym}&format=pdf`} className={btn}>
            Hent PDF
          </a>
        </div>
      </div>
      {problems > 0 && <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">{problems === 1 ? "1 person har" : `${problems} personer har`} en bemærkning - se den, før lønnen køres.</div>}
      <Card title={`${rows.length} ${rows.length === 1 ? "person" : "personer"}`}>
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-y border-slate-100 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-5 py-2">Medarbejder</th>
                <th className="px-3 py-2">Løn</th>
                <th className="px-3 py-2 text-right">Timer</th>
                <th className="px-3 py-2">Fravær</th>
                <th className="px-3 py-2 text-right">Provision</th>
                <th className="px-5 py-2">Bemærkning</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name} className="border-b border-slate-50 align-top">
                  <td className="px-5 py-2.5">
                    <div className="font-medium text-slate-900">{r.name}</div>
                    <div className="text-xs text-slate-500">
                      {r.kind}
                      {r.payrollNumber ? `, nr. ${r.payrollNumber}` : ""}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-slate-700">
                    {r.model}
                    {r.monthlyKr != null && <div className="text-xs text-slate-500">{kr(r.monthlyKr)} om måneden</div>}
                    {r.hourlyKr != null && <div className="text-xs text-slate-500">{kr(r.hourlyKr)} i timen</div>}
                    {r.pension && <div className="text-xs text-slate-500">Pension {r.pension}</div>}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                    {r.workedHours == null ? "-" : r.workedHours.toLocaleString("da-DK")}
                    <div className="text-xs text-slate-500">norm {r.normHours.toLocaleString("da-DK")}</div>
                  </td>
                  <td className="px-3 py-2.5 text-slate-700">
                    {Object.entries(r.absence)
                      .map(([k, n]) => `${ABSENCE_NAMES[k as keyof typeof ABSENCE_NAMES]} ${n.toLocaleString("da-DK")} d`)
                      .join(", ") || "-"}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                    {r.commissionKr ? kr(r.commissionKr) : "-"}
                    {r.commissionKr ? <div className="text-xs text-slate-500">via {r.commissionHow}</div> : null}
                  </td>
                  <td className="px-5 py-2.5 text-xs text-amber-800">{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
