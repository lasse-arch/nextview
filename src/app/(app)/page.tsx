import { getCurrentUser } from "@/lib/auth";
import { getDashboardData } from "@/lib/dashboard-data";
import { stageLabels, invoiceStatusLabels, formatDKK } from "@/lib/labels";

const FUNNEL_SHADES = [
  "bg-blue-200",
  "bg-blue-300",
  "bg-blue-400",
  "bg-blue-500",
  "bg-blue-600",
  "bg-blue-700",
  "bg-blue-800",
];

const INVOICE_STATUS_STYLE: Record<string, { dot: string; text: string }> = {
  DRAFT_CREATED: { dot: "bg-emerald-500", text: "text-emerald-700" },
  PENDING: { dot: "bg-amber-500", text: "text-amber-700" },
  FAILED: { dot: "bg-red-500", text: "text-red-700" },
  IMPORTED: { dot: "bg-slate-400", text: "text-slate-600" },
};

function StatTile({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "good" | "critical";
}) {
  const valueColor = tone === "good" ? "text-emerald-700" : tone === "critical" ? "text-red-700" : "text-slate-900";
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${valueColor}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const data = await getDashboardData();

  const funnelMax = Math.max(1, ...data.funnel.map((f) => f.count));
  const monthlyMax = Math.max(1, ...data.monthly.map((m) => m.value));
  const totalInvoices = data.invoiceStatuses.reduce((s, i) => s + i.count, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Velkommen, {user?.name}</h1>
        <p className="mt-1 text-sm text-slate-500">Overblik over pipeline, salg, provision og fakturering</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile
          label="Aktiv pipeline"
          value={formatDKK(data.pipelineValue)}
          sub={`${data.pipelineCount} åbne deals`}
        />
        <StatTile label="Aktive kunder (Live)" value={formatDKK(data.liveValue)} sub={`${data.liveCount} kunder`} />
        <StatTile
          label="Solgt denne måned"
          value={formatDKK(data.soldThisMonthValue)}
          sub={`${data.soldThisMonthCount} deals`}
        />
        <StatTile label="Opstart i alt" value={formatDKK(data.establishmentFeeTotal)} sub="Etableringspriser" />
        <StatTile label="Provision skyldig" value={formatDKK(data.commissionOwed)} sub="Afventer + forfalden" />
        <StatTile
          label="Fejlede fakturaer"
          value={String(data.failedInvoices)}
          sub={data.failedInvoices > 0 ? "Kræver handling" : "Alt kører"}
          tone={data.failedInvoices > 0 ? "critical" : "good"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Pipeline pr. stadie</h2>
            {data.lostCount > 0 && (
              <span className="text-xs text-slate-500">
                Tabt: <span className="font-medium text-red-600">{data.lostCount} stk</span> (
                {formatDKK(data.lostValue)})
              </span>
            )}
          </div>
          <div className="mt-4 space-y-2.5">
            {data.funnel.map((f, i) => (
              <div key={f.stage} className="flex items-center gap-3" title={`${f.count} deals · ${formatDKK(f.value)}`}>
                <div className="w-36 shrink-0 text-xs text-slate-500">{stageLabels[f.stage]}</div>
                <div className="h-4 flex-1 rounded-full bg-slate-100">
                  <div
                    className={`h-4 rounded-full ${FUNNEL_SHADES[i]}`}
                    style={{ width: `${Math.max(3, (f.count / funnelMax) * 100)}%` }}
                  />
                </div>
                <div className="w-14 shrink-0 text-right text-xs font-medium text-slate-700">{f.count}</div>
                <div className="w-24 shrink-0 text-right text-xs text-slate-400">{formatDKK(f.value)}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Fakturastatus</h2>
          <div className="mt-4 space-y-3">
            {data.invoiceStatuses.map((row) => {
              const style = INVOICE_STATUS_STYLE[row.status];
              const pct = totalInvoices > 0 ? (row.count / totalInvoices) * 100 : 0;
              return (
                <div key={row.status}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-slate-600">
                      <span className={`h-2 w-2 rounded-full ${style.dot}`} />
                      {invoiceStatusLabels[row.status]}
                    </span>
                    <span className={`font-medium ${style.text}`}>{row.count}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                    <div className={`h-1.5 rounded-full ${style.dot}`} style={{ width: `${Math.max(row.count > 0 ? 3 : 0, pct)}%` }} />
                  </div>
                </div>
              );
            })}
            {totalInvoices === 0 && <p className="text-xs text-slate-400">Ingen fakturaer endnu.</p>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Salg, seneste 6 måneder</h2>
          <div className="mt-4 flex h-32 items-end gap-3">
            {data.monthly.map((m) => (
              <div key={m.label} className="flex flex-1 flex-col items-center gap-1" title={formatDKK(m.value)}>
                <span className="text-[11px] font-medium text-slate-600">{formatDKK(m.value)}</span>
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
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <h2 className="text-sm font-semibold text-slate-900">Sælgere</h2>
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="py-1.5 font-medium">Sælger</th>
                <th className="py-1.5 text-right font-medium">Live-kunder</th>
                <th className="py-1.5 text-right font-medium">Værdi</th>
                <th className="py-1.5 text-right font-medium">Provision afventer</th>
                <th className="py-1.5 text-right font-medium">Provision udbetalt</th>
              </tr>
            </thead>
            <tbody>
              {data.sellers.map((s) => (
                <tr key={s.id} className="border-t border-slate-100">
                  <td className="py-1.5 text-slate-800">
                    {s.name}
                    {!s.isCommissionBased && (
                      <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                        Ikke provision
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 text-right text-slate-600">{s.wonCount}</td>
                  <td className="py-1.5 text-right text-slate-600">{formatDKK(s.wonValue)}</td>
                  <td className="py-1.5 text-right text-amber-700">{formatDKK(s.commissionPending)}</td>
                  <td className="py-1.5 text-right text-emerald-700">{formatDKK(s.commissionPaid)}</td>
                </tr>
              ))}
              {data.sellers.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-slate-400">
                    Ingen data endnu.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
