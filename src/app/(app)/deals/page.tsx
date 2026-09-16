import Link from "next/link";
import { prisma } from "@/lib/db";
import { stageLabels, importTypeLabels, formatDKK, formatDate } from "@/lib/labels";
import { DealsBoard, type BoardDeal } from "./board-view";
import type { Prisma, DealStage, ImportType } from "@prisma/client";

type SearchParams = {
  owner?: string;
  stage?: string;
  importType?: string;
  importBatchId?: string;
  sort?: string;
  duplicates?: string;
  skipped?: string;
  view?: string;
};

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const isBoard = params.view === "board";

  const where: Prisma.DealWhereInput = {};
  if (params.owner) where.ownerId = params.owner;
  if (!isBoard && params.stage) where.stage = params.stage as DealStage;
  if (params.importType) where.importType = params.importType as ImportType;
  if (params.importBatchId) where.importBatchId = params.importBatchId;

  const orderBy: Prisma.DealOrderByWithRelationInput =
    params.sort === "oldest"
      ? { createdAt: "asc" }
      : params.sort === "company"
      ? { companyName: "asc" }
      : { createdAt: "desc" };

  const [deals, users, importBatches] = await Promise.all([
    prisma.deal.findMany({
      where,
      orderBy,
      include: { owner: true, importBatch: true },
    }),
    prisma.user.findMany({ orderBy: { name: "asc" } }),
    prisma.importBatch.findMany({ orderBy: { createdAt: "desc" } }),
  ]);

  function toggleViewUrl(view: "list" | "board") {
    const sp = new URLSearchParams();
    if (params.owner) sp.set("owner", params.owner);
    if (!isBoard && params.stage) sp.set("stage", params.stage);
    if (params.importType) sp.set("importType", params.importType);
    if (params.importBatchId) sp.set("importBatchId", params.importBatchId);
    if (params.sort) sp.set("sort", params.sort);
    if (view === "board") sp.set("view", "board");
    const qs = sp.toString();
    return qs ? `/deals?${qs}` : "/deals";
  }

  const boardDeals: BoardDeal[] = deals.map((d) => ({
    id: d.id,
    companyName: d.companyName,
    contactName: d.contactName,
    ownerName: d.owner.name,
    saleAmount: d.saleAmount,
    stage: d.stage,
    isChurned: Boolean(d.churnedAt),
  }));

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Deals</h1>
        <div className="flex items-center gap-3">
          <div className="flex rounded-md border border-slate-300 text-sm">
            <Link
              href={toggleViewUrl("list")}
              className={`rounded-l-md px-3 py-1.5 ${!isBoard ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
            >
              Liste
            </Link>
            <Link
              href={toggleViewUrl("board")}
              className={`rounded-r-md px-3 py-1.5 ${isBoard ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
            >
              Tavle
            </Link>
          </div>
          <Link
            href="/deals/new"
            className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            + Ny lead
          </Link>
        </div>
      </div>

      {params.duplicates && (
        <div className="mt-4 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Bemærk: {params.duplicates.split(",").length} af de importerede firmanavne fandtes allerede i systemet:{" "}
          <span className="font-medium">{params.duplicates.split(",").join(", ")}</span>. De er importeret alligevel
          — tjek for evt. dubletter.
        </div>
      )}

      {params.skipped && (
        <div className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">
          {params.skipped.split(",").length} række(r) blev sprunget over pga. manglende salgsbeløb, binding eller
          startdato: <span className="font-medium">{params.skipped.split(",").join(", ")}</span>
        </div>
      )}

      <form method="get" className="mt-4 flex flex-wrap gap-3 rounded-lg border border-slate-200 bg-white p-4">
        {isBoard && <input type="hidden" name="view" value="board" />}
        <select name="owner" defaultValue={params.owner ?? ""} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
          <option value="">Alle ejere</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>

        {!isBoard && (
          <select name="stage" defaultValue={params.stage ?? ""} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
            <option value="">Alle stadier</option>
            {Object.entries(stageLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        )}

        <select name="importType" defaultValue={params.importType ?? ""} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
          <option value="">Alle importtyper</option>
          {Object.entries(importTypeLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        {importBatches.length > 0 && (
          <select name="importBatchId" defaultValue={params.importBatchId ?? ""} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
            <option value="">Alle import-batches</option>
            {importBatches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.fileName ?? b.sourceUrl ?? b.id} ({formatDate(b.createdAt)})
              </option>
            ))}
          </select>
        )}

        {!isBoard && (
          <select name="sort" defaultValue={params.sort ?? "newest"} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
            <option value="newest">Nyeste først</option>
            <option value="oldest">Ældste først</option>
            <option value="company">Firmanavn A-Å</option>
          </select>
        )}

        <button type="submit" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
          Filtrér
        </button>
        <Link href={isBoard ? "/deals?view=board" : "/deals"} className="rounded-md px-3 py-1.5 text-sm text-slate-500 hover:text-slate-900">
          Nulstil
        </Link>
      </form>

      {isBoard ? (
        <div className="mt-4">
          <DealsBoard initialDeals={boardDeals} />
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Firma</th>
                <th className="px-4 py-2 font-medium">Ejer</th>
                <th className="px-4 py-2 font-medium">Stadie</th>
                <th className="px-4 py-2 font-medium">Solgt for</th>
                <th className="px-4 py-2 font-medium">Import</th>
                <th className="px-4 py-2 font-medium">Oprettet</th>
              </tr>
            </thead>
            <tbody>
              {deals.map((deal) => (
                <tr key={deal.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-1.5">
                    <Link href={`/deals/${deal.id}`} className="font-medium text-slate-900 hover:underline">
                      {deal.companyName}
                    </Link>
                    {deal.contactName && <span className="ml-2 text-xs text-slate-400">{deal.contactName}</span>}
                    {deal.churnedAt && (
                      <span className="ml-2 rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                        Inaktiv
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-1.5 text-slate-600">{deal.owner.name}</td>
                  <td className="px-4 py-1.5 text-slate-600">{stageLabels[deal.stage]}</td>
                  <td className="px-4 py-1.5 text-slate-600">{formatDKK(deal.saleAmount)}</td>
                  <td className="px-4 py-1.5 text-slate-600">{importTypeLabels[deal.importType]}</td>
                  <td className="px-4 py-1.5 text-slate-600">{formatDate(deal.createdAt)}</td>
                </tr>
              ))}
              {deals.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    Ingen deals fundet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
