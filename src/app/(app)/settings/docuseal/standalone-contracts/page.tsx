import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatDate, formatDKK, contractStatusLabels, dealName } from "@/lib/labels";
import { LinkContractRow } from "./link-contract-row";

export default async function StandaloneContractsPage() {
  const [contracts, unsortedDeals] = await Promise.all([
    prisma.standaloneContract.findMany({ orderBy: { createdAt: "desc" }, include: { createdBy: true } }),
    prisma.deal.findMany({ select: { id: true, companyName: true, displayName: true } }),
  ]);
  const deals = unsortedDeals.sort((a, b) => dealName(a).localeCompare(dealName(b), "da"));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Kontrakter uden deal</h1>
          <p className="mt-1 text-sm text-slate-500">
            Send en kontrakt til underskrift uden at have en deal endnu — kæd den sammen med en deal bagefter, så
            dealen automatisk får produkt, pris, binding og kontraktstatus fra kontrakten.
          </p>
        </div>
        <Link
          href="/settings/docuseal/standalone-contracts/new"
          className="shrink-0 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          + Send ny kontrakt
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-slate-200 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Firma</th>
              <th className="px-4 py-2 font-medium">Kontakt</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 text-right font-medium">Månedspris</th>
              <th className="px-4 py-2 font-medium">Sendt af</th>
              <th className="px-4 py-2 font-medium">Sendt</th>
              <th className="px-4 py-2 font-medium">Kæd sammen med deal</th>
            </tr>
          </thead>
          <tbody>
            {contracts.map((c) => (
              <tr key={c.id} className="border-t border-slate-100 align-top">
                <td className="px-4 py-3 font-medium text-slate-800">{c.displayName || c.companyName}</td>
                <td className="px-4 py-3 text-slate-600">
                  {c.contactName}
                  <br />
                  <span className="text-xs text-slate-400">{c.contactEmail}</span>
                </td>
                <td className="px-4 py-3 text-slate-600">{contractStatusLabels[c.contractStatus]}</td>
                <td className="money px-4 py-3 text-right text-slate-600">{formatDKK(c.saleAmount)}</td>
                <td className="px-4 py-3 text-slate-500">{c.createdBy.name}</td>
                <td className="px-4 py-3 text-slate-500">{c.contractSentAt ? formatDate(c.contractSentAt) : "–"}</td>
                <td className="px-4 py-3">
                  <LinkContractRow contractId={c.id} deals={deals} />
                </td>
              </tr>
            ))}
            {contracts.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  Ingen kontrakter sendt uden deal endnu.
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
