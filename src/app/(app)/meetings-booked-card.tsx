import type { MeetingsBookedDay } from "@/lib/meetings-booked-data";

/** "Møder booket denne uge", Monday to Sunday, with a bar per day. */
export function MeetingsBookedCard({ days }: { days: MeetingsBookedDay[] }) {
  const total = days.reduce((s, d) => s + d.count, 0);
  const max = Math.max(1, ...days.map((d) => d.count));
  const sellers = new Map<string, number>();
  for (const d of days) for (const s of d.bySeller) sellers.set(s.name, (sellers.get(s.name) ?? 0) + s.count);
  const bySeller = [...sellers.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Møder booket denne uge</h2>
      <p className="mt-1 text-3xl font-semibold text-slate-900">
        {total}
        <span className="ml-2 text-sm font-normal text-slate-500">{total === 1 ? "møde" : "møder"}</span>
      </p>
      {bySeller.length > 0 && (
        <p className="mt-1 text-xs text-slate-500">{bySeller.map(([name, count]) => `${name} ${count}`).join(" · ")}</p>
      )}
      <div className="mt-4 flex h-24 items-end gap-2">
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
              className={`w-full rounded-t ${d.isToday ? "bg-indigo-600" : "bg-indigo-200"}`}
              style={{ height: `${d.count === 0 ? 2 : Math.max(6, (d.count / max) * 72)}px` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-2">
        {days.map((d) => (
          <span
            key={d.dayKey}
            className={`flex-1 truncate text-center text-[10px] ${d.isToday ? "font-semibold text-slate-700" : "text-slate-400"}`}
          >
            {d.label.split(" ")[0].replace(".", "")}
          </span>
        ))}
      </div>
    </div>
  );
}
