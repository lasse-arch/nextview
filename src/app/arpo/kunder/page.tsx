import Link from "next/link";
import { prisma } from "@/lib/db";
import { dealName } from "@/lib/labels";
import { DealItemPill } from "./deal-item-pill";
import type { Prisma } from "@prisma/client";

export default async function LiveCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;

  const where: Prisma.DealWhereInput = { stage: "LIVE", churnedAt: null };
  if (q) {
    where.OR = [
      { companyName: { contains: q, mode: "insensitive" } },
      { displayName: { contains: q, mode: "insensitive" } },
    ];
  }

  const deals = (
    await prisma.deal.findMany({
      where,
      include: { items: { orderBy: { createdAt: "asc" } }, _count: { select: { customerAccounts: true } } },
    })
  ).sort((a, b) => dealName(a).localeCompare(dealName(b), "da"));

  return (
    <div>
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Live kunder</h1>
        <p className="mt-1 text-sm text-slate-500">
          Klik på en kunde for at se alt om dem samlet: betaling, tours og statistik, login til kundesiden og alle mails. Klik på et
          produkt for at åbne det (fx Nextview360 Tour eller hjemmeside) - selve listen viser ingen salgstal, så den kan bruges i møder.
        </p>
      </div>

      <form method="get" className="mt-4">
        <input
          type="text"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Søg på navn…"
          className="w-full max-w-sm rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </form>

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <ul className="divide-y divide-slate-100">
          {deals.map((deal) => (
            <li key={deal.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <Link href={`/arpo/kunder/${deal.id}`} className="min-w-0">
                <span className="font-medium text-slate-900 hover:underline">{dealName(deal)}</span>
                <span className="block text-xs text-slate-400">
                  Live siden {deal.liveAt ? deal.liveAt.toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" }) : "–"}
                  {deal._count.customerAccounts ? " · har login til kundesiden" : ""}
                </span>
              </Link>
              <div className="flex flex-wrap items-center gap-2">
                {deal.items.length === 0 && <span className="text-xs text-slate-400">Ingen produkter tilføjet</span>}
                {deal.items.map((item) => (
                  <DealItemPill key={item.id} item={item} />
                ))}
              </div>
            </li>
          ))}
          {deals.length === 0 && (
            <li className="px-5 py-8 text-center text-sm text-slate-400">
              {q ? "Ingen live kunder matcher søgningen." : "Ingen live kunder endnu."}
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
