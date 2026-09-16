import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getGrowthDashboardData } from "@/lib/growth-dashboard-data";
import { formatDKK } from "@/lib/labels";

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-slate-900">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between py-1 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className={strong ? "font-semibold text-slate-900" : "text-slate-800"}>{value}</span>
    </div>
  );
}

export default async function GrowthDashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/");

  const d = await getGrowthDashboardData();
  const monthlyMax = Math.max(1, ...d.monthlyNew.map((m) => m.count));
  const riskLabelFor = (days: number) => (days === 30 ? "< 30 dage" : days === 60 ? "< 60 dage" : "< 90 dage");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Vækst</h1>
        <p className="mt-1 text-sm text-slate-500">Måned-for-måned overblik over MRR, fastholdelse og kontraktværdi</p>
      </div>

      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Kunder</h2>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Aktive kunder" value={String(d.activeCount)} />
          <StatTile label="Pipeline (afventer start)" value={String(d.pipelineCount)} />
          <StatTile label="Kunder i alt" value={String(d.totalCount)} />
          <StatTile label="Udløbne kontrakter" value={String(d.expiredCount)} />
        </div>
      </div>

      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">MRR</h2>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatTile label="Aktiv MRR" value={formatDKK(d.activeMRR)} />
          <StatTile label="Inaktiv MRR (pipeline)" value={formatDKK(d.pipelineMRR)} />
          <StatTile label="MRR i alt (potentiel)" value={formatDKK(d.totalMRR)} />
          <StatTile label="ARR (aktiv × 12)" value={formatDKK(d.arr)} />
          <StatTile label="Kvartalsvis fakturering" value={formatDKK(d.quarterlyBilling)} />
          <StatTile label="Gns. MRR pr. aktiv kunde" value={formatDKK(d.avgMRRPerActive)} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Fastholdelse · MRR i risiko</h2>
          <p className="mt-1 text-xs text-slate-500">Aktive kunder med en registreret opsigelse, der ophører snart.</p>
          <div className="mt-3 divide-y divide-slate-100">
            {d.risk.map((r) => (
              <Row
                key={r.days}
                label={`Kunder der udløber ${riskLabelFor(r.days)}`}
                value={`${r.count} stk`}
              />
            ))}
            {d.risk.map((r) => (
              <Row key={`mrr-${r.days}`} label={`MRR i risiko ${riskLabelFor(r.days)}`} value={formatDKK(r.mrr)} strong />
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Kontraktværdi</h2>
          <div className="mt-3 divide-y divide-slate-100">
            <Row label="Aktiv kontraktværdi (fuld binding)" value={formatDKK(d.activeContractValue)} />
            <Row label="Realiseret til dato" value={formatDKK(d.realizedToDate)} />
            <Row label="Resterende kontraktværdi (aktiv)" value={formatDKK(d.remainingContractValue)} />
            <Row label="Pipeline kontraktværdi" value={formatDKK(d.pipelineContractValue)} />
            <Row label="Opstart i alt" value={formatDKK(d.establishmentTotal)} />
            <Row label="Samlet booket værdi" value={formatDKK(d.totalBookedValue)} strong />
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Nøgletal</h2>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatTile label="Gns. bindingsperiode" value={`${d.avgBindingMonths.toFixed(1)} mdr`} />
          <StatTile label="Gns. kontraktværdi" value={formatDKK(d.avgContractValue)} />
          <StatTile label="Gns. kundelevetidsværdi (LTV)" value={formatDKK(d.ltv)} />
          <StatTile label="Højeste månedspris" value={formatDKK(d.maxMonthlyPrice)} sub="Enkeltkunde" />
          <StatTile label="Kundekoncentration" value={`${d.concentration.toFixed(1)}%`} sub="Største ÷ aktiv MRR" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <h2 className="text-sm font-semibold text-slate-900">Nye kunder pr. måned (12 mdr)</h2>
          <div className="mt-4 flex h-40 items-end gap-1.5">
            {d.monthlyNew.map((m) => (
              <div key={m.label} className="flex flex-1 flex-col items-center gap-1" title={`${m.count} nye · ${formatDKK(m.newMRR)} ny MRR`}>
                <span className="text-[10px] font-medium text-slate-600">{m.count}</span>
                <div className="flex h-28 w-full items-end">
                  <div
                    className="w-full rounded-t-md bg-blue-600"
                    style={{ height: `${Math.max(m.count > 0 ? 4 : 0, (m.count / monthlyMax) * 100)}%` }}
                  />
                </div>
                <span className="text-[10px] text-slate-400 capitalize">{m.label.split(" ")[0]}</span>
              </div>
            ))}
          </div>
          <table className="mt-4 w-full text-xs">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="py-1 font-medium">Måned</th>
                <th className="py-1 text-right font-medium">Nye</th>
                <th className="py-1 text-right font-medium">Ny MRR</th>
              </tr>
            </thead>
            <tbody>
              {d.monthlyNew.map((m) => (
                <tr key={m.label} className="border-t border-slate-100">
                  <td className="py-1 capitalize text-slate-700">{m.label}</td>
                  <td className="py-1 text-right text-slate-600">{m.count}</td>
                  <td className="py-1 text-right text-slate-600">{formatDKK(m.newMRR)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Service mix</h2>
          <p className="mt-1 text-xs text-slate-500">Ydelser på tværs af aktive/ikke-opsagte kunder (ekskl. gratis).</p>
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="py-1 font-medium">Service</th>
                <th className="py-1 text-right font-medium">Antal</th>
                <th className="py-1 text-right font-medium">Beløb i alt</th>
              </tr>
            </thead>
            <tbody>
              {d.serviceMix.map((s) => (
                <tr key={s.productType} className="border-t border-slate-100">
                  <td className="py-1.5 text-slate-800">{s.productType}</td>
                  <td className="py-1.5 text-right text-slate-600">{s.count}</td>
                  <td className="py-1.5 text-right text-slate-600">{formatDKK(s.total)}</td>
                </tr>
              ))}
              {d.serviceMix.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-4 text-center text-slate-400">
                    Ingen tilføjelser registreret endnu.
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
