"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { linkDealToParent, linkBranchesToDeal, unlinkDealFromParent } from "@/lib/actions/deals";
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
  const [linkError, setLinkError] = useState<string | null>(null);
  const [branchError, setBranchError] = useState<string | null>(null);
  const showToast = useToast();

  function handleLinkSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLinkError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await linkDealToParent(dealId, formData);
      if (!result.ok) {
        setLinkError(result.error);
        return;
      }
      showToast("Kunde sammenkædet");
    });
  }

  function handleBranchesSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBranchError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await linkBranchesToDeal(dealId, formData);
      if (!result.ok) {
        setBranchError(result.error);
        return;
      }
      showToast("Afdelinger kædet sammen");
    });
  }

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
        <form onSubmit={handleLinkSubmit} className="mt-4 flex flex-wrap items-end gap-2">
          <div className="flex-1">
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Denne kunde er selv en afdeling under…
            </label>
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
            disabled={pending}
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {pending ? "Gemmer…" : "Kæd sammen"}
          </button>
          {linkError && <p className="w-full text-xs text-red-600">{linkError}</p>}
        </form>
      )}

      {!parent && linkableDeals.length > 0 && (
        <form onSubmit={handleBranchesSubmit} className="mt-4 border-t border-slate-100 pt-4">
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Tilføj flere afdelinger (vælg flere med Ctrl/Cmd)
          </label>
          <select
            name="branchDealIds"
            multiple
            size={Math.min(6, linkableDeals.length)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            {linkableDeals.map((d) => (
              <option key={d.id} value={d.id}>
                {dealName(d)}
              </option>
            ))}
          </select>
          {branchError && <p className="mt-1 text-xs text-red-600">{branchError}</p>}
          <button
            type="submit"
            disabled={pending}
            className="mt-2 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {pending ? "Gemmer…" : "Kæd sammen som afdelinger"}
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
                <span className="flex items-center gap-2">
                  {b.cvrNumber && <span className="text-xs text-slate-400">CVR: {b.cvrNumber}</span>}
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        await unlinkDealFromParent(b.id);
                        showToast("Afdeling fjernet");
                      })
                    }
                    className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Fjern
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
