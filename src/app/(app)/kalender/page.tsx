import { getCalendarWeek, getMeetingStats, getMeetingsPerMonth } from "@/lib/calendar-page-data";
import { StatTile } from "../stat-tile";
import { WeekCalendarSection } from "./week-calendar-section";

type SearchParams = { week?: string };

export default async function KalenderPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const weekOffset = Number.isFinite(Number(params.week)) ? Math.trunc(Number(params.week)) : 0;

  const week = await getCalendarWeek(weekOffset);
  const [stats, monthlyMeetings] = await Promise.all([
    getMeetingStats(weekOffset === 0 ? week : undefined),
    getMeetingsPerMonth(),
  ]);
  const monthlyMax = Math.max(1, ...monthlyMeetings.map((m) => m.value));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Kalender</h1>
        <p className="mt-1 text-sm text-slate-500">
          Møder booket i CRM'en, samlet med det I har liggende direkte i Google Kalender.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Møder denne uge" value={String(stats.thisWeekTotal)} />
        <StatTile label="Møder denne måned" value={String(stats.thisMonthTotal)} />
        <StatTile label="Timer i møder denne uge" value={stats.hoursThisWeek.toLocaleString("da-DK")} />
        <StatTile label="Timer i møder denne måned" value={stats.hoursThisMonth.toLocaleString("da-DK")} />
        <StatTile
          label="Arbejdstimer denne uge"
          value={String(stats.workHoursThisWeek)}
          sub={`Norm: ${stats.workHoursThisWeek / 37} sælger${stats.workHoursThisWeek / 37 === 1 ? "" : "e"} × 37 t - ikke registreret fremmøde`}
        />
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Møder booket pr. måned</h2>
        <div className="mt-4 flex h-32 items-end gap-3">
          {monthlyMeetings.map((m) => (
            <div key={m.label} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-[11px] font-medium text-slate-600">{m.value}</span>
              <div className="flex h-24 w-full items-end">
                <div
                  className="w-full rounded-t-md bg-blue-600"
                  style={{ height: `${Math.max(m.value > 0 ? 4 : 0, (m.value / monthlyMax) * 100)}%` }}
                />
              </div>
              <span className="text-[11px] text-slate-400 capitalize">{m.label}</span>
            </div>
          ))}
        </div>
      </section>

      {stats.bySeller.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Møder booket pr. sælger</h2>
          <div className="mt-3 divide-y divide-slate-100">
            {stats.bySeller.map((s) => (
              <div key={s.userId} className="py-3">
                <p className="text-sm font-medium text-slate-900">{s.name}</p>
                <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    <p className="font-semibold uppercase tracking-wide text-slate-400">Denne uge</p>
                    <p className="mt-0.5">
                      <span className="font-semibold text-slate-900">{s.thisWeek}</span> møder ·{" "}
                      <span className="font-semibold text-slate-900">{s.hoursThisWeek.toLocaleString("da-DK")}</span> af 37 t
                    </p>
                  </div>
                  <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    <p className="font-semibold uppercase tracking-wide text-slate-400">Denne måned</p>
                    <p className="mt-0.5">
                      <span className="font-semibold text-slate-900">{s.thisMonth}</span> møder ·{" "}
                      <span className="font-semibold text-slate-900">{s.hoursThisMonth.toLocaleString("da-DK")}</span> af{" "}
                      {stats.workHoursThisMonthPerPerson.toLocaleString("da-DK")} t
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <WeekCalendarSection
        initialWeek={{
          weekOffset,
          weekLabel: week.weekLabel,
          days: week.days.map((d) => ({ dayKey: d.dayKey, dateIso: d.date.toISOString() })),
          meetings: week.meetings,
        }}
      />
    </div>
  );
}
