import { prisma } from "@/lib/db";
import { dealName } from "@/lib/labels";
import { BetalingTable, type BetalingRow } from "./betaling-table";

/**
 * Per-customer payment overview for every live customer - a flat invoice log
 * ("Seneste kladder" on /settings/dinero) can't answer "which customers are
 * fully paid up vs. still owe money vs. have never been invoiced at all",
 * since that needs invoices rolled up per deal rather than shown one row
 * each. Settled under Indstillinger alongside the other invoicing/billing
 * pages rather than a new top-level nav entry.
 */
export default async function BetalingPage() {
  const deals = await prisma.deal.findMany({
    where: { stage: "LIVE", churnedAt: null },
    include: { invoices: true },
  });

  const rows: BetalingRow[] = deals
    .map((deal) => {
      const invoices = deal.invoices;
      const unpaid = invoices.filter((inv) => !inv.paidAt && (inv.status === "DRAFT_CREATED" || inv.status === "SENT_MANUALLY"));
      const unpaidAmount = unpaid.reduce((sum, inv) => sum + inv.amount, 0);
      const paidDates = invoices.map((inv) => inv.paidAt).filter((d): d is Date => d !== null);
      const lastPaidAt = paidDates.length > 0 ? new Date(Math.max(...paidDates.map((d) => d.getTime()))) : null;
      const latestInvoice = [...invoices].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;

      const status: BetalingRow["status"] =
        invoices.length === 0 ? "INGEN_FAKTURA" : unpaidAmount > 0 ? "MANGLER_BETALING" : "BETALT";

      return {
        dealId: deal.id,
        name: dealName(deal),
        liveAt: deal.liveAt ? deal.liveAt.toISOString() : null,
        invoiceCount: invoices.length,
        unpaidAmount,
        lastPaidAt: lastPaidAt ? lastPaidAt.toISOString() : null,
        lastInvoiceStatus: latestInvoice?.status ?? null,
        lastInvoiceFailureReason: latestInvoice?.failureReason ?? null,
        status,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "da"));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Betalingsstatus</h1>
        <p className="mt-1 text-sm text-slate-500">
          Alle live kunder, med hvor meget de mangler at betale, om de overhovedet har fået en faktura, og hvornår de
          sidst betalte. Klik en kolonneoverskrift for at sortere.
        </p>
      </div>
      <BetalingTable rows={rows} />
    </div>
  );
}
