import Link from "next/link";
import { startOfMonth, subMonths, endOfMonth, startOfWeek, subWeeks, endOfWeek, isWithinInterval, format } from "date-fns";
import { da } from "date-fns/locale";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isCommissionOverdue } from "@/lib/commission";
import { commissionFrequencyLabels, formatDKK, formatDate, dealName } from "@/lib/labels";
import { MarkPaidButton } from "@/app/(app)/deals/[id]/mark-paid-button";
import { CommissionBarChart, type CommissionBar } from "./commission-charts";
import { CommissionFilters } from "./commission-filters";

const MONTHS_BACK = 6;
const WEEKS_BACK = 10;

export default async function CommissionPage({
  searchParams,
}: {
  searchParams: Promise<{ seller?: string; month?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) return null;

  const isAdmin = user.role === "ADMIN";
  const params = await searchParams;
  const selectedSellerId = isAdmin ? params.seller || "all" : user.id;
  const selectedMonth = params.month || "all";

  const allCommissions = await prisma.commission.findMany({
    where: isAdmin ? {} : { sellerId: user.id },
    include: { deal: true, seller: true },
    orderBy: { dueDate: "asc" },
  });

  // The "sortere/graf pr måned" request is about when the deal was actually
  // sold and signed - not the commission's own due date, which is a
  // separate payout-scheduling concern. "Underskrevet" (contractSignedAt) is
  // the fallback for the rare deal whose soldAt somehow never got set,
  // matching the same soldAt-first convention used on the dashboard.
  const withSaleDate = allCommissions.map((c) => ({ ...c, saleDate: c.deal.soldAt ?? c.deal.contractSignedAt ?? null }));

  const sellerFiltered =
    selectedSellerId === "all" ? withSaleDate : withSaleDate.filter((c) => c.sellerId === selectedSellerId);

  const commissions =
    selectedMonth === "all"
      ? sellerFiltered
      : sellerFiltered.filter((c) => c.saleDate && format(c.saleDate, "yyyy-MM") === selectedMonth);

  const pending = sellerFiltered.filter((c) => c.status !== "PAID");
  const overdue = pending.filter((c) => isCommissionOverdue(c.dueDate, c.paidAt));
  const paid = sellerFiltered.filter((c) => c.status === "PAID");

  const sumPending = pending.reduce((sum, c) => sum + c.amount, 0);
  const sumOverdue = overdue.reduce((sum, c) => sum + c.amount, 0);
  const sumPaid = paid.reduce((sum, c) => sum + c.amount, 0);

  const sellerMap = new Map<string, string>();
  for (const c of allCommissions) sellerMap.set(c.sellerId, c.seller.name);
  const sellers = Array.from(sellerMap.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const monthOptionValues = new Set<string>();
  for (const c of sellerFiltered) {
    if (c.saleDate) monthOptionValues.add(format(c.saleDate, "yyyy-MM"));
  }
  const monthOptions = Array.from(monthOptionValues)
    .sort((a, b) => b.localeCompare(a))
    .map((value) => ({ value, label: format(new Date(`${value}-01`), "MMMM yyyy", { locale: da }) }));

  const now = new Date();

  const monthlyBars: CommissionBar[] = [];
  for (let i = MONTHS_BACK - 1; i >= 0; i--) {
    const m = subMonths(startOfMonth(now), i);
    const mEnd = endOfMonth(m);
    const value = sellerFiltered
      .filter((c) => c.saleDate && isWithinInterval(c.saleDate, { start: m, end: mEnd }))
      .reduce((sum, c) => sum + c.amount, 0);
    monthlyBars.push({ label: format(m, "MMM yy", { locale: da }), value });
  }

  const weeklyBars: CommissionBar[] = [];
  for (let i = WEEKS_BACK - 1; i >= 0; i--) {
    const w = subWeeks(startOfWeek(now, { weekStartsOn: 1 }), i);
    const wEnd = endOfWeek(w, { weekStartsOn: 1 });
    const value = sellerFiltered
      .filter((c) => c.saleDate && isWithinInterval(c.saleDate, { start: w, end: wEnd }))
      .reduce((sum, c) => sum + c.amount, 0);
    weeklyBars.push({ label: format(w, "'uge' I", { locale: da }), value });
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">
        {isAdmin ? "Provisionsoverblik (alle sælgere)" : "Min provision"}
      </h1>

      <CommissionFilters
        sellers={sellers}
        monthOptions={monthOptions}
        selectedSellerId={selectedSellerId}
        selectedMonth={selectedMonth}
        isAdmin={isAdmin}
      />

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Afventer udbetaling" value={formatDKK(sumPending)} />
        <StatCard label="Forfaldne" value={formatDKK(sumOverdue)} highlight={sumOverdue > 0} />
        <StatCard label="Udbetalt i alt" value={formatDKK(sumPaid)} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CommissionBarChart title={`Provision pr. måned, seneste ${MONTHS_BACK}`} bars={monthlyBars} />
        <CommissionBarChart title={`Provision pr. uge, seneste ${WEEKS_BACK}`} bars={weeklyBars} />
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Deal</th>
              {isAdmin && <th className="px-4 py-2 font-medium">Sælger</th>}
              <th className="px-4 py-2 font-medium">Grundlag</th>
              <th className="px-4 py-2 font-medium">Sats</th>
              <th className="px-4 py-2 font-medium">Provision</th>
              <th className="px-4 py-2 font-medium">Solgt</th>
              <th className="px-4 py-2 font-medium">Udbetaling</th>
              <th className="px-4 py-2 font-medium">Forfald</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {commissions.map((c) => {
              const overdueRow = isCommissionOverdue(c.dueDate, c.paidAt);
              return (
                <tr key={c.id} className="border-t border-slate-100">
                  <td className="px-4 py-2">
                    <Link href={`/deals/${c.dealId}`} className="font-medium text-slate-900 hover:underline">
                      {dealName(c.deal)}
                    </Link>
                  </td>
                  {isAdmin && <td className="px-4 py-2 text-slate-600">{c.seller.name}</td>}
                  <td className="money px-4 py-2 text-slate-600">{formatDKK(c.baseAmount)}</td>
                  <td className="px-4 py-2 text-slate-600">{c.rate}%</td>
                  <td className="money px-4 py-2 font-medium text-slate-900">{formatDKK(c.amount)}</td>
                  <td className="px-4 py-2 text-slate-600">{c.saleDate ? formatDate(c.saleDate) : "–"}</td>
                  <td className="px-4 py-2 text-slate-600">{commissionFrequencyLabels[c.frequency]}</td>
                  <td className={`px-4 py-2 ${overdueRow ? "font-medium text-red-600" : "text-slate-600"}`}>
                    {formatDate(c.dueDate)}
                  </td>
                  <td className="px-4 py-2">
                    {c.status === "PAID" ? (
                      <span className="whitespace-nowrap rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        Udbetalt {formatDate(c.paidAt)}
                      </span>
                    ) : overdueRow ? (
                      <span className="whitespace-nowrap rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                        Forfalden
                      </span>
                    ) : (
                      <span className="whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                        Afventer
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {isAdmin && c.status !== "PAID" && <MarkPaidButton commissionId={c.id} />}
                  </td>
                </tr>
              );
            })}
            {commissions.length === 0 && (
              <tr>
                <td colSpan={isAdmin ? 10 : 9} className="px-4 py-8 text-center text-slate-400">
                  Ingen provisioner endnu.
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

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`money mt-1 text-xl font-semibold ${highlight ? "text-red-600" : "text-slate-900"}`}>{value}</p>
    </div>
  );
}
