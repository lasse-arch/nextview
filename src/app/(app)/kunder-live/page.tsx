import { prisma } from "@/lib/db";
import { dealName } from "@/lib/labels";

export default async function LiveCustomersPage() {
  const deals = await prisma.deal.findMany({
    where: { stage: "LIVE", churnedAt: null },
    include: { items: { orderBy: { createdAt: "asc" } } },
    orderBy: { companyName: "asc" },
  });

  return (
    <div>
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Live kunder</h1>
        <p className="mt-1 text-sm text-slate-500">
          Til fremvisning i møder — ingen salgstal her. Klik på et produkt for at åbne det (fx Matterport-tour eller
          hjemmeside).
        </p>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <ul className="divide-y divide-slate-100">
          {deals.map((deal) => (
            <li key={deal.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <span className="font-medium text-slate-900">{dealName(deal)}</span>
              <div className="flex flex-wrap items-center gap-2">
                {deal.items.length === 0 && <span className="text-xs text-slate-400">Ingen produkter tilføjet</span>}
                {deal.items.map((item) =>
                  item.url ? (
                    <a
                      key={item.id}
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
                    >
                      {item.productType} ↗
                    </a>
                  ) : (
                    <span
                      key={item.id}
                      className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500"
                    >
                      {item.productType}
                    </span>
                  )
                )}
              </div>
            </li>
          ))}
          {deals.length === 0 && <li className="px-5 py-8 text-center text-sm text-slate-400">Ingen live kunder endnu.</li>}
        </ul>
      </div>
    </div>
  );
}
