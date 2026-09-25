import Link from "next/link";
import { getCalendarWeek, getMeetingStats, getMeetingsPerMonth } from "@/lib/calendar-page-data";
import { StatTile } from "../stat-tile";

type SearchParams = { week?: string };

const WEEKDAY_FORMAT = new Intl.DateTimeFormat("da-DK", { weekday: "long", timeZone: "UTC" });
const DAY_FORMAT = new Intl.DateTimeFormat("da-DK", { day: "numeric", month: "short", timeZone: "UTC" });

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatHour(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export default async function KalenderPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const weekOffset = Number.isFinite(Number(params.week)) ? Math.trunc(Number(params.week)) : 0;

  const week = await getCalendarWeek(weekOffset);
  const [stats, monthlyMeetings] = await Promise.all([
    getMeetingStats(weekOffset === 0 ? week : undefined),
    getMeetingsPerMonth(),
  ]);
  const monthlyMax = Math.max(1, ...monthlyMeetings.map((m) => m.value));

  const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(new Date());

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
          sub={`${stats.workHoursThisWeek / 37} sælger${stats.workHoursThisWeek / 37 === 1 ? "" : "e"} × 37 t (norm, ikke registreret fremmøde)`}
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
            <div className="flex items-center justify-between py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              <span>Sælger</span>
              <span className="flex gap-6">
                <span className="w-16 text-right">Denne uge</span>
                <span className="w-16 text-right">Denne måned</span>
                <span className="w-20 text-right">Timer uge</span>
                <span className="w-20 text-right">Timer måned</span>
              </span>
            </div>
            {stats.bySeller.map((s) => (
              <div key={s.userId} className="flex items-center justify-between py-2 text-sm">
                <span className="text-slate-700">{s.name}</span>
                <span className="flex gap-6">
                  <span className="w-16 text-right font-medium text-slate-900">{s.thisWeek}</span>
                  <span className="w-16 text-right font-medium text-slate-900">{s.thisMonth}</span>
                  <span className="w-20 text-right font-medium text-slate-900">{s.hoursThisWeek.toLocaleString("da-DK")}</span>
                  <span className="w-20 text-right font-medium text-slate-900">{s.hoursThisMonth.toLocaleString("da-DK")}</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900">{week.weekLabel}</h2>
          <div className="flex items-center gap-2">
            <Link
              href={`/kalender?week=${weekOffset - 1}`}
              className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              ‹ Forrige uge
            </Link>
            {weekOffset !== 0 && (
              <Link
                href="/kalender"
                className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Denne uge
              </Link>
            )}
            <Link
              href={`/kalender?week=${weekOffset + 1}`}
              className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              Næste uge ›
            </Link>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
          {week.days.map((day) => {
            const dayMeetings = week.meetings.filter((m) => m.dayKey === day.dayKey);
            const isToday = day.dayKey === todayKey;
            return (
              <div
                key={day.dayKey}
                className={`rounded-lg border p-2.5 ${isToday ? "border-slate-900 bg-slate-50" : "border-slate-200"}`}
              >
                <div className="flex items-baseline justify-between">
                  <span className={`text-xs font-semibold ${isToday ? "text-slate-900" : "text-slate-500"}`}>
                    {capitalize(WEEKDAY_FORMAT.format(day.date))}
                  </span>
                  <span className="text-[11px] text-slate-400">{DAY_FORMAT.format(day.date)}</span>
                </div>

                <div className="mt-2 space-y-1.5">
                  {dayMeetings.length === 0 && <p className="text-xs text-slate-300">Ingen møder</p>}
                  {dayMeetings.map((m) => {
                    const invitedTitle = m.isInternal
                      ? `Internt møde - tæller ikke med i møde-stats${
                          m.invitedNames && m.invitedNames.length > 0 ? `. Også med: ${m.invitedNames.join(", ")}` : ""
                        }`
                      : m.invitedNames && m.invitedNames.length > 0
                      ? `Også inviteret: ${m.invitedNames.join(", ")}`
                      : undefined;
                    const content = (
                      <div
                        title={invitedTitle}
                        className={`rounded-md border px-2 py-1.5 text-xs ${
                          m.source === "google" ? "border-blue-100 bg-blue-50" : "border-slate-200 bg-white"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-medium text-slate-900">
                            {m.hour === -1 ? "Hele dagen" : formatHour(m.hour, m.minute)}
                          </span>
                          {m.isInternal ? (
                            <span className="shrink-0 rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                              Internt
                            </span>
                          ) : (
                            m.source === "google" && (
                              <span className="shrink-0 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                                Google
                              </span>
                            )
                          )}
                        </div>
                        <p className="mt-0.5 truncate text-slate-700">{m.label}</p>
                        <p className="truncate text-[11px] text-slate-400">
                          {m.ownerName}
                          {m.invitedNames && m.invitedNames.length > 0 && (
                            <span className="text-slate-300"> +{m.invitedNames.length}</span>
                          )}
                        </p>
                      </div>
                    );
                    return m.href ? (
                      <Link key={m.id} href={m.href} className="block hover:opacity-80">
                        {content}
                      </Link>
                    ) : (
                      <div key={m.id}>{content}</div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
