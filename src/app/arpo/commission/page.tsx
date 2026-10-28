import Link from "next/link";
import { startOfMonth, subMonths, endOfMonth, startOfWeek, subWeeks, endOfWeek, isWithinInterval, format } from "date-fns";
import { da } from "date-fns/locale";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isCommissionOverdue } from "@/lib/commission";
import { commissionFrequencyLabels, formatDKK, formatDate, dealName } from "@/lib/labels";
import { MarkPaidButton } from "@/app/arpo/deals/[id]/mark-paid-button";
import { CommissionBarChart, type CommissionBar } from "./commission-charts";
import { CommissionFilters } from "./commission-filters";
import { breakEvenRows, type BreakEvenRow } from "@/lib/break-even";
import { BreakEvenSettingsForm } from "./break-even-settings";

const MONTHS_BACK = 6;
/** How many months "Salg pr. måned" goes back. */
const SALES_MONTHS = 12;

type SalesMonth = { key: string; label: string; count: number; establishment: number; mrr: number; commission: number };
const WEEKS_BACK = 6;

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
  for (let i = 0; i < SALES_MONTHS; i++) monthOptionValues.add(format(subMonths(startOfMonth(new Date()), i), "yyyy-MM"));
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

  // "Salg pr. måned": what the seller sold each month - the same counting as
  // the goals (soldAt, the deal's owner, MRR = monthly price, etablering = the fee).
  const salesStart = subMonths(startOfMonth(now), SALES_MONTHS - 1);
  const salesDeals = await prisma.deal.findMany({
    where: { soldAt: { gte: salesStart }, ...(selectedSellerId === "all" ? {} : { ownerId: selectedSellerId }) },
    select: { soldAt: true, saleAmount: true, establishmentFee: true, ownerId: true, owner: { select: { name: true } } },
  });
  const salesMonths: SalesMonth[] = [];
  for (let i = 0; i < SALES_MONTHS; i++) {
    const m = subMonths(startOfMonth(now), i);
    const key = format(m, "yyyy-MM");
    const inMonth = salesDeals.filter((d) => format(d.soldAt!, "yyyy-MM") === key);
    salesMonths.push({
      key,
      label: format(m, "MMMM yyyy", { locale: da }),
      count: inMonth.length,
      establishment: inMonth.reduce((n, d) => n + (d.establishmentFee ?? 0), 0),
      mrr: inMonth.reduce((n, d) => n + (d.saleAmount ?? 0), 0),
      commission: sellerFiltered.filter((c) => c.saleDate && format(c.saleDate, "yyyy-MM") === key).reduce((n, c) => n + c.amount, 0),
    });
  }
  // The month in focus: the one picked in the filter, else this month.
  const focusKey = selectedMonth !== "all" && salesMonths.some((m) => m.key === selectedMonth) ? selectedMonth : salesMonths[0].key;
  const focus = salesMonths.find((m) => m.key === focusKey)!;
  const before = salesMonths[salesMonths.findIndex((m) => m.key === focusKey) + 1] ?? null;
  const bySeller =
    isAdmin && selectedSellerId === "all"
      ? [...salesDeals.filter((d) => format(d.soldAt!, "yyyy-MM") === focusKey).reduce((m, d) => {
          const x = m.get(d.ownerId) ?? { name: d.owner.name, count: 0, establishment: 0, mrr: 0 };
          return m.set(d.ownerId, { ...x, count: x.count + 1, establishment: x.establishment + (d.establishmentFee ?? 0), mrr: x.mrr + (d.saleAmount ?? 0) });
        }, new Map<string, { name: string; count: number; establishment: number; mrr: number }>()).values()].sort((a, b) => b.mrr - a.mrr)
      : [];

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

      <SalesOverview months={salesMonths} focus={focus} before={before} bySeller={bySeller} seller={isAdmin && selectedSellerId !== "all" ? selectedSellerId : null} />

      <h2 className="mt-10 text-lg font-semibold text-slate-900">Provision</h2>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
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
                    <Link href={`/arpo/deals/${c.dealId}`} className="font-medium text-slate-900 hover:underline">
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

      {isAdmin && <BreakEven sellerId={selectedSellerId === "all" ? undefined : selectedSellerId} />}
    </div>
  );
}

const STATUS: Record<BreakEvenRow["status"], { label: string; cls: string }> = {
  plus: { label: "Tjener penge", cls: "bg-emerald-50 text-emerald-700" },
  "paying-back": { label: "Tjener sig hjem", cls: "bg-amber-50 text-amber-700" },
  "not-started": { label: "Ikke live endnu", cls: "bg-slate-100 text-slate-600" },
  lost: { label: "Opsagt i minus", cls: "bg-red-50 text-red-700" },
  never: { label: "Dækker ikke driften", cls: "bg-red-50 text-red-700" },
};

/*
 * "Hvornår tjener vi penge?" - per sale, when the customer's payments have
 * covered what the sale cost us (the seller's commission), and
 * where it stands now. Admin only: it shows our own costs.
 */
async function BreakEven({ sellerId }: { sellerId?: string }) {
  const { rows, settings } = await breakEvenRows(sellerId);
  const now = new Date();
  const order = { "paying-back": 0, never: 1, lost: 2, "not-started": 3, plus: 4 };
  rows.sort((a, b) => order[a.status] - order[b.status] || (a.breakEvenAt?.getTime() ?? Infinity) - (b.breakEvenAt?.getTime() ?? Infinity));

  const live = rows.filter((r) => r.start);
  const inPlus = rows.filter((r) => r.status === "plus").length;
  const outstanding = live.filter((r) => r.resultNow < 0 && r.status !== "lost").reduce((s, r) => s - r.resultNow, 0);
  const resultNow = live.reduce((s, r) => s + r.resultNow, 0);
  const overBinding = rows.filter((r) => r.status !== "lost").reduce((s, r) => s + r.resultOverBinding, 0);
  const months = rows.map((r) => r.breakEvenMonths).filter((m): m is number => m != null);
  const avgMonths = months.length ? Math.round((months.reduce((s, m) => s + m, 0) / months.length) * 10) / 10 : null;

  const bySeller = new Map<string, BreakEvenRow[]>();
  for (const r of rows) bySeller.set(r.seller, [...(bySeller.get(r.seller) ?? []), r]);
  const sellers = [...bySeller.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const signed = (n: number) => (n > 0 ? "+" : "") + formatDKK(n);
  const tone = (n: number) => (n >= 0 ? "text-emerald-700" : "text-red-600");

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Hvornår tjener vi penge?</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Et salg koster med det samme: sælgerens provision. Den tjenes hjem af etableringen og den månedlige betaling, minus driften pr. kunde. Regnet ud fra kontrakten.
          </p>
        </div>
        <BreakEvenSettingsForm monthlyCost={settings.monthlyCost} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Salg der tjener penge" value={`${inPlus} af ${rows.length}`} />
        <StatCard label="Mangler at blive tjent hjem" value={formatDKK(outstanding)} />
        <StatCard label="Resultat indtil nu" value={signed(resultNow)} highlight={resultNow < 0} />
        <StatCard label="Over bindingsperioden" value={signed(overBinding)} highlight={overBinding < 0} />
      </div>
      {avgMonths != null && <p className="mt-2 text-xs text-slate-500">Et salg er i gennemsnit tjent hjem efter {String(avgMonths).replace(".", ",")} måneder.</p>}

      {sellers.length > 1 && (
        <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Sælger</th>
                <th className="px-4 py-2 font-medium">Salg</th>
                <th className="px-4 py-2 font-medium">Tjener penge</th>
                <th className="px-4 py-2 font-medium">Tjent hjem efter (gns.)</th>
                <th className="px-4 py-2 font-medium">Resultat nu</th>
                <th className="px-4 py-2 font-medium">Over binding</th>
              </tr>
            </thead>
            <tbody>
              {sellers.map(([name, rs]) => {
                const ms = rs.map((r) => r.breakEvenMonths).filter((m): m is number => m != null);
                const now_ = rs.filter((r) => r.start).reduce((s, r) => s + r.resultNow, 0);
                const total = rs.filter((r) => r.status !== "lost").reduce((s, r) => s + r.resultOverBinding, 0);
                return (
                  <tr key={name} className="border-t border-slate-100">
                    <td className="px-4 py-2 font-medium text-slate-900">{name}</td>
                    <td className="px-4 py-2 text-slate-600">{rs.length}</td>
                    <td className="px-4 py-2 text-slate-600">{rs.filter((r) => r.status === "plus").length}</td>
                    <td className="px-4 py-2 text-slate-600">{ms.length ? `${String(Math.round((ms.reduce((s, m) => s + m, 0) / ms.length) * 10) / 10).replace(".", ",")} mdr.` : "–"}</td>
                    <td className={`money px-4 py-2 font-medium ${rs.some((r) => r.start) ? tone(now_) : "text-slate-400"}`}>{rs.some((r) => r.start) ? signed(now_) : "–"}</td>
                    <td className={`money px-4 py-2 font-medium ${tone(total)}`}>{signed(total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Deal</th>
              <th className="px-4 py-2 font-medium">Sælger</th>
              <th className="px-4 py-2 font-medium">Betaler</th>
              <th className="px-4 py-2 font-medium">Koster</th>
              <th className="px-4 py-2 font-medium">Tjent hjem</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Resultat nu</th>
              <th className="px-4 py-2 font-medium">Over binding</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const paidBack = r.upfront > 0 ? Math.max(0, Math.min(1, (r.resultNow + r.upfront) / r.upfront)) : 1;
              return (
                <tr key={r.dealId} className="border-t border-slate-100 align-top">
                  <td className="px-4 py-2">
                    <Link href={`/arpo/deals/${r.dealId}`} className="font-medium text-slate-900 hover:underline">
                      {r.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-slate-600">{r.seller}</td>
                  <td className="px-4 py-2 text-slate-600">
                    <span className="money">{formatDKK(r.monthly)}</span>/md.
                    {r.establishment > 0 && <span className="block text-xs text-slate-400">+ {formatDKK(r.establishment)} etablering</span>}
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    <span className="money">{formatDKK(r.upfront)}</span>
                    <span className="block text-xs text-slate-400">provision</span>
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {r.breakEvenMonths == null ? "Aldrig" : r.breakEvenMonths === 0 ? "Med det samme" : `Efter ${r.breakEvenMonths} md.`}
                    {r.breakEvenAt && r.breakEvenMonths !== 0 && (
                      <span className="block text-xs text-slate-400">
                        {r.breakEvenAt <= now ? "nået" : "ca."} {format(r.breakEvenAt, "MMM yyyy", { locale: da })}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span>
                    {r.status === "paying-back" && (
                      <span className="mt-1.5 block h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                        <span className="block h-full rounded-full bg-amber-400" style={{ width: `${Math.round(paidBack * 100)}%` }} />
                      </span>
                    )}
                  </td>
                  <td className={`money px-4 py-2 font-medium ${r.start ? tone(r.resultNow) : "text-slate-400"}`}>{r.start ? signed(r.resultNow) : "–"}</td>
                  <td className={`money px-4 py-2 font-medium ${tone(r.resultOverBinding)}`}>
                    {signed(r.resultOverBinding)}
                    <span className="block text-xs font-normal text-slate-400">{r.bindingMonths} md. binding</span>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-400">Ingen salg endnu.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-400">
        Vores egen tid regnes ikke med. Starter fra fakturastart (ellers live-dato).
      </p>
    </section>
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

/** "Salg pr. måned": the month in focus as cards (with the change from the month before), each month in a table, and - for all sellers - who sold what that month. */
function SalesOverview({
  months,
  focus,
  before,
  bySeller,
  seller,
}: {
  /** The seller picked in the filter - kept when a month is clicked. */
  seller: string | null;
  months: SalesMonth[];
  focus: SalesMonth;
  before: SalesMonth | null;
  bySeller: { name: string; count: number; establishment: number; mrr: number }[];
}) {
  const diff = (now: number, then: number | undefined, money: boolean) => {
    if (then === undefined || now === then) return null;
    const d = now - then;
    return <span className={d > 0 ? "text-emerald-700" : "text-slate-500"}>{`${d > 0 ? "+" : "−"}${money ? formatDKK(Math.abs(d)) : Math.abs(d)} ift. måneden før`}</span>;
  };
  const totals = months.reduce((t, m) => ({ count: t.count + m.count, establishment: t.establishment + m.establishment, mrr: t.mrr + m.mrr, commission: t.commission + m.commission }), { count: 0, establishment: 0, mrr: 0, commission: 0 });
  const cards: [string, string, React.ReactNode][] = [
    ["Salg", String(focus.count), diff(focus.count, before?.count, false)],
    ["Etablering solgt", formatDKK(focus.establishment), diff(focus.establishment, before?.establishment, true)],
    ["MRR solgt", formatDKK(focus.mrr), diff(focus.mrr, before?.mrr, true)],
    ["Provision", formatDKK(focus.commission), diff(focus.commission, before?.commission, true)],
  ];
  return (
    <section className="mt-6">
      <h2 className="text-lg font-semibold text-slate-900">
        Salg i <span className="capitalize">{focus.label}</span>
      </h2>
      <div className="mt-3 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map(([label, value, sub]) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
            <p className="money mt-1 text-xl font-semibold text-slate-900">{value}</p>
            <p className="mt-0.5 min-h-4 text-xs">{sub}</p>
          </div>
        ))}
      </div>

      {bySeller.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Sælger</th>
                <th className="px-4 py-2 text-right font-medium">Salg</th>
                <th className="px-4 py-2 text-right font-medium">Etablering</th>
                <th className="px-4 py-2 text-right font-medium">MRR</th>
              </tr>
            </thead>
            <tbody>
              {bySeller.map((r) => (
                <tr key={r.name} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium text-slate-900">{r.name}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{r.count}</td>
                  <td className="money px-4 py-2 text-right">{formatDKK(r.establishment)}</td>
                  <td className="money px-4 py-2 text-right">{formatDKK(r.mrr)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Måned</th>
              <th className="px-4 py-2 text-right font-medium">Salg</th>
              <th className="px-4 py-2 text-right font-medium">Etablering solgt</th>
              <th className="px-4 py-2 text-right font-medium">MRR solgt</th>
              <th className="px-4 py-2 text-right font-medium">Provision</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.key} className={`border-t border-slate-100 ${m.key === focus.key ? "bg-blue-50/50" : ""} ${m.count === 0 && m.commission === 0 ? "text-slate-400" : ""}`}>
                <td className="px-4 py-2 font-medium capitalize">
                  <Link href={`?${new URLSearchParams({ ...(seller ? { seller } : {}), month: m.key })}`} className="hover:underline">
                    {m.label}
                  </Link>
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{m.count}</td>
                <td className="money px-4 py-2 text-right">{formatDKK(m.establishment)}</td>
                <td className="money px-4 py-2 text-right">{formatDKK(m.mrr)}</td>
                <td className="money px-4 py-2 text-right">{formatDKK(m.commission)}</td>
              </tr>
            ))}
            <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-900">
              <td className="px-4 py-2">Seneste {months.length} måneder</td>
              <td className="px-4 py-2 text-right tabular-nums">{totals.count}</td>
              <td className="money px-4 py-2 text-right">{formatDKK(totals.establishment)}</td>
              <td className="money px-4 py-2 text-right">{formatDKK(totals.mrr)}</td>
              <td className="money px-4 py-2 text-right">{formatDKK(totals.commission)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
