import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getGrowthDashboardData } from "@/lib/growth-dashboard-data";
import { formatDKK } from "@/lib/labels";
import { NewCustomersChart } from "./new-customers-chart";

function StatTile({ label, value, sub, money }: { label: string; value: string; sub?: string; money?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold text-slate-900 ${money ? "money" : ""}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

function Row({ label, value, strong, money }: { label: string; value: string; strong?: boolean; money?: boolean }) {
  return (
    <div className="flex justify-between py-1 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className={`${strong ? "font-semibold text-slate-900" : "text-slate-800"} ${money ? "money" : ""}`}>
        {value}
      </span>
    </div>
  );
}

export default async function GrowthDashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/");

  const d = await getGrowthDashboardData();
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
          <StatTile label="Aktiv MRR" value={formatDKK(d.activeMRR)} money />
          <StatTile label="Inaktiv MRR (pipeline)" value={formatDKK(d.pipelineMRR)} money />
          <StatTile label="MRR i alt (potentiel)" value={formatDKK(d.totalMRR)} money />
          <StatTile label="ARR (aktiv × 12)" value={formatDKK(d.arr)} money />
          <StatTile label="Kvartalsvis fakturering" value={formatDKK(d.quarterlyBilling)} money />
          <StatTile label="Gns. MRR pr. aktiv kunde" value={formatDKK(d.avgMRRPerActive)} money />
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
              <Row key={`mrr-${r.days}`} label={`MRR i risiko ${riskLabelFor(r.days)}`} value={formatDKK(r.mrr)} strong money />
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Kontraktværdi</h2>
          <div className="mt-3 divide-y divide-slate-100">
            <Row label="Aktiv kontraktværdi (fuld binding)" value={formatDKK(d.activeContractValue)} money />
            <Row label="Realiseret til dato (aktive, mod fuld binding)" value={formatDKK(d.realizedToDate)} money />
            <Row label="Resterende kontraktværdi (aktiv)" value={formatDKK(d.remainingContractValue)} money />
            <Row label="Pipeline kontraktværdi (fuld binding)" value={formatDKK(d.pipelineContractValue)} money />
            <Row label="Opstart i alt" value={formatDKK(d.establishmentTotal)} money />
            <Row
              label="Realiseret kontraktværdi i alt (alle solgte, ekskl. fremtidig binding)"
              value={formatDKK(d.realizedContractTotal)}
              money
            />
            <Row label="Samlet booket værdi" value={formatDKK(d.totalBookedValue)} strong money />
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Nøgletal</h2>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatTile label="Gns. bindingsperiode" value={`${d.avgBindingMonths.toFixed(1)} mdr`} />
          <StatTile label="Gns. kontraktværdi" value={formatDKK(d.avgContractValue)} money />
          <StatTile label="Gns. kundelevetidsværdi (LTV)" value={formatDKK(d.ltv)} money />
          <StatTile label="Højeste månedspris" value={formatDKK(d.maxMonthlyPrice)} sub="Enkeltkunde" money />
          <StatTile label="Kundekoncentration" value={`${d.concentration.toFixed(1)}%`} sub="Største ÷ aktiv MRR" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <NewCustomersChart bySignedDate={d.monthlyNewBySignedDate} byLiveDate={d.monthlyNewByLiveDate} />

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
                  <td className="money py-1.5 text-right text-slate-600">{formatDKK(s.total)}</td>
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
