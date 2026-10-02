"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addLeadCandidateAsDeal,
  addLeadCandidateToCallList,
  dismissLeadCandidate,
  deleteLeadCandidates,
} from "@/lib/actions/lead-generation";
import { createCallList } from "@/lib/actions/call-lists";
import { stageLabels } from "@/lib/labels";
import { useToast } from "@/components/toast";

function alreadyExistsWarning(stage?: string): string | null {
  if (!stage) return null;
  return `⚠️ Findes allerede som deal (${stageLabels[stage] ?? stage}) - ikke flyttet til ringelisten.`;
}

export type LeadCandidateData = {
  id: string;
  companyName: string;
  cvrNumber: string;
  address: string | null;
  industryText: string | null;
  industryCode: string | null;
  website: string | null;
  foundedDate: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  ownerName: string | null;
  sourceLabel: string | null;
  createdAt: string;
};

export type CallListOption = { id: string; name: string };

function formatDate(iso: string | null): string {
  if (!iso) return "–";
  return new Intl.DateTimeFormat("da-DK", { dateStyle: "medium" }).format(new Date(iso));
}

/** Calendar-day key (local time) a candidate was found on, for grouping a
 * daily-running filter's finds by run instead of lumping every day's batch
 * into one undifferentiated pile. */
function foundDayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function foundDayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (foundDayKey(iso) === foundDayKey(today.toISOString())) return "Fundet i dag";
  if (foundDayKey(iso) === foundDayKey(yesterday.toISOString())) return "Fundet i går";
  return `Fundet ${new Intl.DateTimeFormat("da-DK", { dateStyle: "medium" }).format(d)}`;
}

/** Splits a filter's (already newest-first) candidates into same-day
 * clusters, each labeled "Fundet i dag"/"Fundet i går"/the date - lets a
 * daily-running filter's fresh batch stand out from leads that have been
 * sitting unreviewed since an earlier run, instead of both looking identical
 * inside the same group. */
function groupByFoundDay(candidates: LeadCandidateData[]): [string, LeadCandidateData[]][] {
  const buckets: [string, LeadCandidateData[]][] = [];
  for (const c of candidates) {
    const label = foundDayLabel(c.createdAt);
    const last = buckets[buckets.length - 1];
    if (last && last[0] === label) last[1].push(c);
    else buckets.push([label, [c]]);
  }
  return buckets;
}

function websiteHref(website: string): string {
  return website.startsWith("http") ? website : `https://${website}`;
}

function CandidateCard({
  candidate,
  targetListId,
  onHidden,
}: {
  candidate: LeadCandidateData;
  targetListId: string | null;
  onHidden: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [hidden, setHidden] = useState(false);
  const showToast = useToast();
  const router = useRouter();

  function hide() {
    setHidden(true);
    onHidden();
  }

  function addAsDeal() {
    startTransition(async () => {
      const result = await addLeadCandidateAsDeal(candidate.id);
      if (!result.ok) {
        showToast(result.error);
        return;
      }
      hide();
      if (result.alreadyExisted) showToast("Findes allerede som deal - åbner den eksisterende.");
      router.push(result.duplicateId ? `/deals/${result.dealId}?dup=${result.duplicateId}` : `/deals/${result.dealId}`);
    });
  }

  function addToCallList() {
    if (!targetListId) {
      showToast("Vælg eller opret en ringeliste først.");
      return;
    }
    startTransition(async () => {
      const result = await addLeadCandidateToCallList(candidate.id, targetListId);
      if (!result.ok) {
        showToast(result.error);
        return;
      }
      hide();
      showToast(
        result.alreadyExisted
          ? (alreadyExistsWarning(result.existingStage) ?? "Fandtes allerede som deal.")
          : "Tilføjet til ringelisten."
      );
      router.refresh();
    });
  }

  function dismiss() {
    startTransition(async () => {
      await dismissLeadCandidate(candidate.id);
      hide();
    });
  }

  if (hidden) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-slate-900">{candidate.companyName}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            <a
              href={`https://datacvr.virk.dk/enhed/virksomhed/${candidate.cvrNumber}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-600 underline decoration-dotted hover:text-slate-900"
              onClick={(e) => e.stopPropagation()}
            >
              CVR {candidate.cvrNumber}
            </a>
            {candidate.industryText && (
              <>
                {" "}
                · {candidate.industryText}
                {candidate.industryCode && ` (${candidate.industryCode})`}
              </>
            )}
            {candidate.website && (
              <>
                {" "}
                ·{" "}
                <a
                  href={websiteHref(candidate.website)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline decoration-dotted hover:text-slate-900"
                  onClick={(e) => e.stopPropagation()}
                >
                  {candidate.website}
                </a>
              </>
            )}
            {candidate.address && <> · {candidate.address}</>}
          </p>
          <p className="mt-0.5 text-xs text-slate-400">Stiftet {formatDate(candidate.foundedDate)}</p>
          {(candidate.ownerName || candidate.contactPhone || candidate.contactEmail) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              {candidate.ownerName && (
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                  {candidate.ownerName}
                </span>
              )}
              {candidate.contactPhone && (
                <a
                  href={`tel:${candidate.contactPhone.replace(/\s/g, "")}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-sm font-semibold text-slate-900 hover:underline"
                >
                  {candidate.contactPhone}
                </a>
              )}
              {candidate.contactEmail && <span className="text-xs text-slate-400">{candidate.contactEmail}</span>}
            </div>
          )}
        </div>
        <div className="flex shrink-0 gap-1.5">
          <button
            type="button"
            onClick={dismiss}
            disabled={pending}
            className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Afvis
          </button>
          <button
            type="button"
            onClick={addToCallList}
            disabled={pending}
            title="Tilføj til den valgte ringeliste ovenfor"
            className="rounded-md border border-violet-300 px-2.5 py-1 text-xs font-medium text-violet-700 hover:bg-violet-50 disabled:opacity-50"
          >
            {pending ? "Tilføjer…" : "Tilføj til ringeliste"}
          </button>
          <button
            type="button"
            onClick={addAsDeal}
            disabled={pending}
            className="rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {pending ? "Tilføjer…" : "Tilføj som deal"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** One filter's (or scanned URL's) own found-leads group, shown as its own
 * named sub-list under "Fundne leads" - a filter called "Nye leads dagligt"
 * gets its own heading and candidate list, instead of every filter's finds
 * being mixed into one flat feed with just a small caption naming the
 * source. Starts collapsed (just the heading + buttons), since a broad
 * filter can easily turn up dozens of candidates at once - click the
 * heading to expand and review them. */
function CandidateGroup({
  sourceLabel,
  candidates,
  targetListId,
  onAddAll,
}: {
  sourceLabel: string;
  candidates: LeadCandidateData[];
  targetListId: string | null;
  onAddAll: (ids: string[]) => Promise<void>;
}) {
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [addingAll, startAddingAll] = useTransition();
  const [deleting, startDeleting] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const router = useRouter();
  const showToast = useToast();
  const visible = candidates.filter((c) => !hiddenIds.has(c.id));

  function addAll() {
    startAddingAll(async () => {
      await onAddAll(visible.map((c) => c.id));
      setHiddenIds(new Set(candidates.map((c) => c.id)));
    });
  }

  function deleteList() {
    if (!confirm(`Slet denne liste (${visible.length} leads)? De forsvinder fra Fundne leads og kan ikke genskabes.`)) return;
    startDeleting(async () => {
      const result = await deleteLeadCandidates(visible.map((c) => c.id));
      showToast(`${result.deleted} leads slettet.`);
      router.refresh();
    });
  }

  if (visible.length === 0) return null;

  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-700"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
          {sourceLabel} <span className="font-normal normal-case text-slate-400">({visible.length})</span>
        </button>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={deleteList}
            disabled={deleting}
            title="Slet alle leads i denne liste"
            className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            {deleting ? "Sletter…" : "Slet liste"}
          </button>
          <button
            type="button"
            onClick={addAll}
            disabled={addingAll || !targetListId}
            title={!targetListId ? "Vælg eller opret en ringeliste først" : "Tilføj alle i denne liste til den valgte ringeliste"}
            className="rounded-md border border-violet-300 px-2.5 py-1 text-xs font-medium text-violet-700 hover:bg-violet-50 disabled:opacity-50"
          >
            {addingAll ? "Tilføjer…" : "Tilføj alle til ringeliste"}
          </button>
        </div>
      </div>
      {expanded && (
        <div className="mt-2 space-y-4">
          {groupByFoundDay(visible).map(([dayLabel, dayCandidates]) => (
            <div key={dayLabel} className="space-y-2">
              <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{dayLabel}</p>
              {dayCandidates.map((c) => (
                <CandidateCard
                  key={c.id}
                  candidate={c}
                  targetListId={targetListId}
                  onHidden={() => setHiddenIds((prev) => new Set(prev).add(c.id))}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function LeadCandidateSection({
  candidates,
  callLists,
}: {
  candidates: LeadCandidateData[];
  callLists: CallListOption[];
}) {
  const router = useRouter();
  const [lists, setLists] = useState(callLists);
  const [targetListId, setTargetListId] = useState<string | null>(callLists[0]?.id ?? null);
  const [creating, startCreating] = useTransition();
  const showToast = useToast();

  function handleListChange(value: string) {
    if (value === "__new__") {
      startCreating(async () => {
        const list = await createCallList();
        setLists((prev) => [list, ...prev]);
        setTargetListId(list.id);
        router.refresh();
      });
      return;
    }
    setTargetListId(value || null);
  }

  async function addAllToCallList(ids: string[]) {
    if (!targetListId) {
      showToast("Vælg eller opret en ringeliste først.");
      return;
    }
    let added = 0;
    let alreadyExisted = 0;
    for (const id of ids) {
      const result = await addLeadCandidateToCallList(id, targetListId);
      if (result.ok && !result.alreadyExisted) added++;
      else if (result.ok && result.alreadyExisted) alreadyExisted++;
    }
    let message = `${added} af ${ids.length} tilføjet til ringelisten.`;
    if (alreadyExisted > 0) {
      message += ` ⚠️ ${alreadyExisted} fandtes allerede som deal og blev ikke flyttet.`;
    }
    showToast(message);
    router.refresh();
  }

  // Grouped by which filter (or scanned URL) found them, so a filter like
  // "Nye leads dagligt" shows as its own named list instead of blending
  // into one flat feed - most-recently-found candidate's group sorts first.
  const groups = new Map<string, LeadCandidateData[]>();
  for (const c of candidates) {
    const key = c.sourceLabel ?? "Uden kilde";
    const existing = groups.get(key);
    if (existing) existing.push(c);
    else groups.set(key, [c]);
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-900">Fundne leads</h2>
        <label className="flex items-center gap-2 text-xs text-slate-500">
          Tilføj til ringeliste:
          <select
            value={targetListId ?? ""}
            onChange={(e) => handleListChange(e.target.value)}
            disabled={creating}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs"
          >
            {lists.length === 0 && <option value="">Ingen lister endnu</option>}
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
            <option value="__new__">+ Ny liste i dag</option>
          </select>
        </label>
      </div>
      <div className="mt-3 space-y-4">
        {[...groups.entries()].map(([sourceLabel, group]) => (
          <CandidateGroup
            key={sourceLabel}
            sourceLabel={sourceLabel}
            candidates={group}
            targetListId={targetListId}
            onAddAll={addAllToCallList}
          />
        ))}
        {candidates.length === 0 && (
          <p className="py-4 text-center text-sm text-slate-400">
            Ingen fundne leads endnu - opret et filter og tryk &quot;Kør nu&quot;.
          </p>
        )}
      </div>
    </section>
  );
}
