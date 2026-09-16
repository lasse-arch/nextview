"use client";

import { useTransition } from "react";
import Link from "next/link";
import { linkDealToParent, unlinkDealFromParent } from "@/lib/actions/deals";
import { dealName } from "@/lib/labels";
import { useToast } from "@/components/toast";

type LinkableDeal = { id: string; companyName: string; displayName: string | null };
type Branch = { id: string; companyName: string; displayName: string | null; cvrNumber: string | null };

export function CustomerLinkSection({
  dealId,
  parent,
  branches,
  linkableDeals,
}: {
  dealId: string;
  parent: LinkableDeal | null;
  branches: Branch[];
  linkableDeals: LinkableDeal[];
}) {
  const [pending, startTransition] = useTransition();
  const showToast = useToast();
  const linkWithId = linkDealToParent.bind(null, dealId);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Kunde-sammenkædning</h2>
      <p className="mt-1 text-xs text-slate-500">
        Saml flere afdelinger/filialer under én kunde til overblik — hver afdeling beholder sit eget CVR-nummer,
        kontrakt og fakturering uafhængigt.
      </p>

      {parent ? (
        <div className="mt-4 rounded-md bg-slate-50 p-3 text-sm">
          <p className="text-slate-600">
            Denne deal er en afdeling under{" "}
            <Link href={`/deals/${parent.id}`} className="font-medium text-slate-900 hover:underline">
              {dealName(parent)}
            </Link>
            .
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await unlinkDealFromParent(dealId);
                showToast("Sammenkædning fjernet");
              })
            }
            className="mt-2 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Fjern sammenkædning
          </button>
        </div>
      ) : (
        <form action={linkWithId} className="mt-4 flex flex-wrap items-end gap-2">
          <div className="flex-1">
            <label className="block text-xs font-medium text-slate-500">Kæd sammen med kunde</label>
            <select
              name="parentDealId"
              defaultValue=""
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="" disabled>
                Vælg kunde…
              </option>
              {linkableDeals.map((d) => (
                <option key={d.id} value={d.id}>
                  {dealName(d)}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Kæd sammen
          </button>
        </form>
      )}

      {branches.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <h3 className="text-xs font-semibold text-slate-500">Afdelinger under denne kunde</h3>
          <ul className="mt-2 space-y-1.5">
            {branches.map((b) => (
              <li key={b.id} className="flex items-center justify-between text-sm">
                <Link href={`/deals/${b.id}`} className="text-slate-800 hover:underline">
                  {dealName(b)}
                </Link>
                {b.cvrNumber && <span className="text-xs text-slate-400">CVR: {b.cvrNumber}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
