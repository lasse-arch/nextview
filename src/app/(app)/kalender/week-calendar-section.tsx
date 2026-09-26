"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { getCalendarWeekAction, type CalendarWeekClientData } from "@/lib/actions/calendar";

const WEEKDAY_FORMAT = new Intl.DateTimeFormat("da-DK", { weekday: "long", timeZone: "UTC" });
const DAY_FORMAT = new Intl.DateTimeFormat("da-DK", { day: "numeric", month: "short", timeZone: "UTC" });
const TODAY_KEY = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(new Date());

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatHour(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * The week-nav + 7-day grid, split into its own client component so
 * switching weeks fetches just that week's data (via getCalendarWeekAction)
 * and swaps local state, instead of navigating the whole /kalender page and
 * re-running the stats tiles / monthly chart / per-seller sections above it.
 */
export function WeekCalendarSection({ initialWeek }: { initialWeek: CalendarWeekClientData }) {
  const [week, setWeek] = useState(initialWeek);
  const [pending, startTransition] = useTransition();

  function goToWeek(offset: number) {
    startTransition(async () => {
      const next = await getCalendarWeekAction(offset);
      setWeek(next);
    });
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-900">{week.weekLabel}</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => goToWeek(week.weekOffset - 1)}
            disabled={pending}
            className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            ‹ Forrige uge
          </button>
          {week.weekOffset !== 0 && (
            <button
              type="button"
              onClick={() => goToWeek(0)}
              disabled={pending}
              className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              Denne uge
            </button>
          )}
          <button
            type="button"
            onClick={() => goToWeek(week.weekOffset + 1)}
            disabled={pending}
            className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Næste uge ›
          </button>
        </div>
      </div>

      <div className={`mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7 ${pending ? "opacity-50" : ""}`}>
        {week.days.map((day) => {
          const date = new Date(day.dateIso);
          const dayMeetings = week.meetings.filter((m) => m.dayKey === day.dayKey);
          const isToday = day.dayKey === TODAY_KEY;
          return (
            <div
              key={day.dayKey}
              className={`rounded-lg border p-2.5 ${isToday ? "border-slate-900 bg-slate-50" : "border-slate-200"}`}
            >
              <div className="flex items-baseline justify-between">
                <span className={`text-xs font-semibold ${isToday ? "text-slate-900" : "text-slate-500"}`}>
                  {capitalize(WEEKDAY_FORMAT.format(date))}
                </span>
                <span className="text-[11px] text-slate-400">{DAY_FORMAT.format(date)}</span>
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
  );
}
