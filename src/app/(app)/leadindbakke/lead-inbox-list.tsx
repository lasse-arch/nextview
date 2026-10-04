"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { moveLeadsToDeals, reopenInboxLead } from "@/lib/actions/lead-inbox";
import { formatDate, stageLabels } from "@/lib/labels";
import { useToast } from "@/components/toast";

export type InboxLead = {
  id: string;
  name: string;
  stage: string;
  callListName: string | null;
  ownerName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  address: string | null;
  updatedAt: string;
};

const STAGE_PILL: Record<string, string> = {
  LEAD: "bg-slate-100 text-slate-600",
  CONTACTED: "bg-blue-50 text-blue-700",
  LOST: "bg-red-50 text-red-700",
};

export function LeadInboxList({ leads, total }: { leads: InboxLead[]; total: number }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const showToast = useToast();
  const visible = leads.filter((l) => !hidden.has(l.id));
  const allChecked = visible.length > 0 && visible.every((l) => selected.has(l.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function moveToDeals(ids: string[]) {
    if (ids.length === 0) return;
    startTransition(async () => {
      try {
        const { moved } = await moveLeadsToDeals(ids);
        setHidden((prev) => new Set([...prev, ...ids]));
        setSelected(new Set());
        showToast(`${moved} flyttet til Deals.`);
        router.refresh();
      } catch {
        showToast("Kunne ikke flytte - genindlæs siden og prøv igen.");
      }
    });
  }

  function reopen(id: string) {
    startTransition(async () => {
      try {
        await reopenInboxLead(id);
        setHidden((prev) => new Set([...prev, id]));
        showToast("Genåbnet - ligger nu under Ikke ringet.");
        router.refresh();
      } catch {
        showToast("Kunne ikke genåbne - genindlæs siden og prøv igen.");
      }
    });
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={allChecked}
            onChange={() => setSelected(allChecked ? new Set() : new Set(visible.map((l) => l.id)))}
            disabled={visible.length === 0}
          />
          {selected.size > 0 ? `${selected.size} valgt` : `Vælg alle · viser ${visible.length} af ${total}`}
        </label>
        <button
          type="button"
          onClick={() => moveToDeals([...selected])}
          disabled={selected.size === 0 || pending}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-40"
        >
          {pending ? "Flytter…" : `Flyt til Deals (${selected.size})`}
        </button>
      </div>

      <ul className="mt-3 divide-y divide-slate-100">
        {visible.map((lead) => (
          <li key={lead.id} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-2.5">
              <input
                type="checkbox"
                checked={selected.has(lead.id)}
                onChange={() => toggle(lead.id)}
                className="mt-1"
                aria-label={`Vælg ${lead.name}`}
              />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/deals/${lead.id}`} className="font-medium text-slate-900 hover:underline">
                    {lead.name}
                  </Link>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STAGE_PILL[lead.stage] ?? STAGE_PILL.LEAD}`}>
                    {lead.stage === "LEAD" ? "Ikke ringet" : (stageLabels[lead.stage] ?? lead.stage)}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  {[lead.callListName, lead.ownerName, lead.address].filter(Boolean).join(" · ")}
                </p>
                {(lead.contactPhone || lead.contactEmail) && (
                  <p className="mt-0.5 text-xs">
                    {lead.contactPhone && (
                      <a href={`tel:${lead.contactPhone.replace(/\s/g, "")}`} className="font-semibold text-slate-900 hover:underline">
                        {lead.contactPhone}
                      </a>
                    )}
                    {lead.contactEmail && <span className="ml-2 text-slate-400">{lead.contactEmail}</span>}
                  </p>
                )}
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-1.5 whitespace-nowrap pl-6 sm:pl-0">
              <span className="mr-1 text-[11px] text-slate-400">{formatDate(lead.updatedAt)}</span>
              {lead.stage === "LOST" && (
                <button
                  type="button"
                  onClick={() => reopen(lead.id)}
                  disabled={pending}
                  className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  Genåbn
                </button>
              )}
              <button
                type="button"
                onClick={() => moveToDeals([lead.id])}
                disabled={pending}
                title="Vis på Deals-tavlen fra nu af - fx et lead du vil arbejde videre med før et møde"
                className="rounded-md border border-violet-300 px-2.5 py-1 text-xs font-medium text-violet-700 hover:bg-violet-50 disabled:opacity-50"
              >
                Flyt til Deals
              </button>
              <Link
                href={`/deals/${lead.id}`}
                className="rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-800"
              >
                Åbn / book møde
              </Link>
            </div>
          </li>
        ))}
        {visible.length === 0 && <li className="py-6 text-center text-sm text-slate-400">Ingen leads her.</li>}
      </ul>
    </section>
  );
}
