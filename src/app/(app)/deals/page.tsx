import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { stageLabels, importTypeLabels, formatDKK, formatDate, dealName } from "@/lib/labels";
import { DealsBoard, type BoardDeal } from "./board-view";
import { DealsListTable } from "./deals-list-table";
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
  const isBoard = params.view !== "list";

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

  const [deals, users, importBatches, currentUser] = await Promise.all([
    prisma.deal.findMany({
      where,
      orderBy,
      include: { owner: true, importBatch: true },
    }),
    prisma.user.findMany({ orderBy: { name: "asc" } }),
    prisma.importBatch.findMany({ orderBy: { createdAt: "desc" } }),
    getCurrentUser(),
  ]);

  function toggleViewUrl(view: "list" | "board") {
    const sp = new URLSearchParams();
    if (params.owner) sp.set("owner", params.owner);
    if (view === "list" && params.stage) sp.set("stage", params.stage);
    if (params.importType) sp.set("importType", params.importType);
    if (params.importBatchId) sp.set("importBatchId", params.importBatchId);
    if (params.sort) sp.set("sort", params.sort);
    if (view === "list") sp.set("view", "list");
    const qs = sp.toString();
    return qs ? `/deals?${qs}` : "/deals";
  }

  const boardDeals: BoardDeal[] = deals.map((d) => ({
    id: d.id,
    companyName: d.companyName,
    displayName: d.displayName,
    contactName: d.contactName,
    ownerName: d.owner.name,
    ownerAvatarUrl: d.owner.avatarUrl,
    saleAmount: d.saleAmount,
    bindingMonths: d.bindingMonths,
    establishmentFee: d.establishmentFee,
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

      <form method="get" className="mt-4 flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        {!isBoard && <input type="hidden" name="view" value="list" />}
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
        <Link href={isBoard ? "/deals" : "/deals?view=list"} className="rounded-md px-3 py-1.5 text-sm text-slate-500 hover:text-slate-900">
          Nulstil
        </Link>
      </form>

      {isBoard ? (
        <div className="mt-4">
          <DealsBoard initialDeals={boardDeals} isAdmin={currentUser?.role === "ADMIN"} />
        </div>
      ) : (
        <DealsListTable deals={deals} />
      )}
    </div>
  );
}
