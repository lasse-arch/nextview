import { formatDKK } from "@/lib/labels";

export type CommissionBar = { label: string; value: number };

/** Same custom-div-bar style as the dashboard's own MonthlySalesChart -
 * no charting library in this codebase, so matching it keeps the look
 * consistent rather than introducing a second visual language. */
export function CommissionBarChart({ title, bars }: { title: string; bars: CommissionBar[] }) {
  const max = Math.max(1, ...bars.map((b) => b.value));

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      {bars.length === 0 ? (
        <p className="mt-4 text-xs text-slate-400">Ingen provision med kendt salgsdato endnu.</p>
      ) : (
        <div className="mt-4 flex h-40 items-end gap-2 overflow-x-auto">
          {bars.map((b, i) => (
            <div key={i} className="flex min-w-[52px] flex-1 flex-col items-center gap-1" title={formatDKK(b.value)}>
              <span className="money text-[10px] font-medium text-slate-600">{formatDKK(b.value)}</span>
              <div className="flex h-24 w-full items-end">
                <div
                  className="w-full rounded-t-md bg-blue-600"
                  style={{ height: `${Math.max(b.value > 0 ? 4 : 0, (b.value / max) * 100)}%` }}
                />
              </div>
              <span className="whitespace-nowrap text-[10px] text-slate-400 capitalize">{b.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
