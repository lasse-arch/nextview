import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isCommissionOverdue } from "@/lib/commission";
import { commissionFrequencyLabels, formatDKK, formatDate, dealName } from "@/lib/labels";
import { MarkPaidButton } from "@/app/(app)/deals/[id]/mark-paid-button";

export default async function CommissionPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const isAdmin = user.role === "ADMIN";

  const commissions = await prisma.commission.findMany({
    where: isAdmin ? {} : { sellerId: user.id },
    include: { deal: true, seller: true },
    orderBy: { dueDate: "asc" },
  });

  const pending = commissions.filter((c) => c.status !== "PAID");
  const overdue = pending.filter((c) => isCommissionOverdue(c.dueDate, c.paidAt));
  const paid = commissions.filter((c) => c.status === "PAID");

  const sumPending = pending.reduce((sum, c) => sum + c.amount, 0);
  const sumOverdue = overdue.reduce((sum, c) => sum + c.amount, 0);
  const sumPaid = paid.reduce((sum, c) => sum + c.amount, 0);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">
        {isAdmin ? "Provisionsoverblik (alle sælgere)" : "Min provision"}
      </h1>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Afventer udbetaling" value={formatDKK(sumPending)} />
        <StatCard label="Forfaldne" value={formatDKK(sumOverdue)} highlight={sumOverdue > 0} />
        <StatCard label="Udbetalt i alt" value={formatDKK(sumPaid)} />
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Deal</th>
              {isAdmin && <th className="px-4 py-2 font-medium">Sælger</th>}
              <th className="px-4 py-2 font-medium">Grundlag</th>
              <th className="px-4 py-2 font-medium">Sats</th>
              <th className="px-4 py-2 font-medium">Provision</th>
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
                  <td className="px-4 py-2 text-slate-600">{commissionFrequencyLabels[c.frequency]}</td>
                  <td className={`px-4 py-2 ${overdueRow ? "font-medium text-red-600" : "text-slate-600"}`}>
                    {formatDate(c.dueDate)}
                  </td>
                  <td className="px-4 py-2">
                    {c.status === "PAID" ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        Udbetalt {formatDate(c.paidAt)}
                      </span>
                    ) : overdueRow ? (
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                        Forfalden
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
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
                <td colSpan={isAdmin ? 9 : 8} className="px-4 py-8 text-center text-slate-400">
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
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`money mt-1 text-xl font-semibold ${highlight ? "text-red-600" : "text-slate-900"}`}>{value}</p>
    </div>
  );
}
