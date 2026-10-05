import type { MeetingsBookedDay } from "@/lib/meetings-booked-data";

/** "Møder booket i dag" with the last two weeks as small bars underneath. */
export function MeetingsBookedCard({ days }: { days: MeetingsBookedDay[] }) {
  const today = days[days.length - 1];
  const max = Math.max(1, ...days.map((d) => d.count));
  const weekTotal = days.slice(-7).reduce((s, d) => s + d.count, 0);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Møder booket i dag</h2>
          <p className="mt-1 text-3xl font-semibold text-slate-900">
            {today.count}
            <span className="ml-2 text-sm font-normal text-slate-500">
              {today.count === 1 ? "møde" : "møder"} · {today.label}
            </span>
          </p>
          {today.bySeller.length > 0 && (
            <p className="mt-1 text-xs text-slate-500">
              {today.bySeller.map((s) => `${s.name} ${s.count}`).join(" · ")}
            </p>
          )}
        </div>
        <p className="text-xs text-slate-500">
          Sidste 7 dage: <span className="font-semibold text-slate-700">{weekTotal}</span>
        </p>
      </div>
      <div className="mt-4 flex h-24 items-end gap-1.5">
        {days.map((d) => (
          <div
            key={d.dayKey}
            className="flex h-full flex-1 flex-col items-center justify-end gap-1"
            title={`${d.label}: ${d.count} ${d.count === 1 ? "møde" : "møder"}${
              d.bySeller.length > 0 ? ` (${d.bySeller.map((s) => `${s.name} ${s.count}`).join(", ")})` : ""
            }`}
          >
            {d.count > 0 && <span className="text-[10px] font-medium text-slate-500">{d.count}</span>}
            <div
              className={`w-full rounded-t ${d.dayKey === today.dayKey ? "bg-indigo-600" : "bg-indigo-200"}`}
              style={{ height: `${d.count === 0 ? 2 : Math.max(6, (d.count / max) * 72)}px` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1.5">
        {days.map((d) => (
          <span key={d.dayKey} className="flex-1 truncate text-center text-[9px] text-slate-400">
            {d.label.split(" ")[1]}
          </span>
        ))}
      </div>
    </div>
  );
}
