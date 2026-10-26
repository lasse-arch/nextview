import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { formatDate } from "@/lib/labels";
import { RestoreButton } from "./restore-button";

/** Slettede kunder: every deleted deal, kept whole, with "Gendan". Admins only. */
export default async function DeletedDealsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/api/auth/session-ended");
  if (user.role !== "ADMIN") redirect("/deals");
  const deleted = await prisma.deletedDeal.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  const counts = (data: unknown) => {
    const rows = (data as { rows?: Record<string, unknown[]> }).rows ?? {};
    const n = (t: string) => rows[t]?.length ?? 0;
    return [n("Note") && `${n("Note")} noter`, n("EmailMessage") && `${n("EmailMessage")} mails`, n("Invoice") && `${n("Invoice")} fakturaer`].filter(Boolean).join(" · ");
  };
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <div>
        <Link href="/deals" className="text-sm text-slate-500 hover:underline">
          ← Deals
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Slettede kunder</h1>
        <p className="text-sm text-slate-500">En slettet deal gemmes her med alt, der hørte til (noter, mails, fakturaer, provision), og kan sættes tilbage.</p>
      </div>
      {deleted.length === 0 && <p className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-500">Ingen slettede kunder.</p>}
      <ul className="divide-y divide-slate-200 rounded-md border border-slate-200 bg-white">
        {deleted.map((d) => (
          <li key={d.id} className="flex items-center gap-3 p-3 text-sm">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-slate-900">{d.restoredAt ? <Link href={`/deals/${d.dealId}`} className="hover:underline">{d.name}</Link> : d.name}</p>
              <p className="text-xs text-slate-500">
                Slettet {formatDate(d.createdAt)} af {d.deletedByName}
                {counts(d.data) && ` · ${counts(d.data)}`}
                {d.restoredAt && ` · sat tilbage ${formatDate(d.restoredAt)}`}
              </p>
            </div>
            {!d.restoredAt && <RestoreButton id={d.id} name={d.name} />}
          </li>
        ))}
      </ul>
    </div>
  );
}
