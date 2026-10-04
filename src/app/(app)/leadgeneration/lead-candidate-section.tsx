"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addLeadCandidateAsDeal,
  addLeadCandidateToCallList,
  dismissLeadCandidate,
  deleteLeadCandidates,
  renameLeadFilter,
  hideLeadMatch,
} from "@/lib/actions/lead-generation";
import { renameWatchedUrl } from "@/lib/actions/lead-url-scan";
import { importLeadCsv, renameLeadImportList } from "@/lib/actions/lead-import";
import { createCallList } from "@/lib/actions/call-lists";
import { stageLabels } from "@/lib/labels";
import { useToast } from "@/components/toast";
import Link from "next/link";

function alreadyExistsWarning(stage?: string): string | null {
  if (!stage) return null;
  return `⚠️ Findes allerede som deal (${stageLabels[stage] ?? stage}) - ikke flyttet til ringelisten.`;
}

export type LeadCandidateData = {
  id: string;
  companyName: string;
  /** Null only for a CSV-imported lead without a CVR column. */
  cvrNumber: string | null;
  address: string | null;
  industryText: string | null;
  industryCode: string | null;
  website: string | null;
  foundedDate: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  ownerName: string | null;
  sourceLabel: string | null;
  /** Which filter/page found it - candidates are grouped by this, not by the
   * display name. */
  groupKey: string;
  /** What the group's "Omdøb" renames: the filter itself, or a watched page's
   * label. Null for finds with nothing renameable behind them (a one-off
   * "Scan nu" of an unwatched page, or a since-deleted filter). */
  renameTarget: RenameTarget | null;
  /** The filter whose list this entry is in (null for a scanned page's
   * list) - review actions only drop it from this list. */
  listFilterId: string | null;
  known: KnownLeadStatus | null;
  /** How many unreviewed candidates the whole group has - can exceed the
   * ones actually loaded, since each group only loads its newest finds. */
  groupTotal: number;
  createdAt: string;
};

export type RenameTarget =
  | { kind: "filter"; id: string }
  | { kind: "import"; id: string }
  | { kind: "url"; url: string };

/** Why a lead in a filter's list has already been dealt with elsewhere -
 * another filter's list, or a deal that existed already. Null for a lead
 * that's genuinely new. */
export type KnownLeadStatus =
  | { kind: "deal"; dealId: string; stage: string; callListName: string | null }
  | { kind: "dismissed" };

function knownLeadNote(known: KnownLeadStatus): string {
  if (known.kind === "dismissed") return "Afvist tidligere";
  if (known.callListName) return `Allerede tilføjet til ringelisten "${known.callListName}"`;
  return `Findes allerede som deal (${stageLabels[known.stage] ?? known.stage})`;
}

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
      const result = await addLeadCandidateAsDeal(candidate.id, candidate.listFilterId);
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
      const result = await addLeadCandidateToCallList(candidate.id, targetListId, candidate.listFilterId);
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
      await dismissLeadCandidate(candidate.id, candidate.listFilterId);
      hide();
    });
  }

  function hideFromList() {
    // Outside a filter's list (an imported CSV or scanned page) a lead
    // belongs to just that one list, so hiding it is simply dismissing it.
    if (!candidate.listFilterId) {
      dismiss();
      return;
    }
    const filterId = candidate.listFilterId;
    startTransition(async () => {
      await hideLeadMatch(filterId, candidate.id);
      hide();
    });
  }

  if (hidden) return null;

  const known = candidate.known;

  return (
    <div className={`rounded-lg border bg-white p-4 ${known ? "border-amber-200" : "border-slate-200"}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 sm:flex-1">
          <p className="font-medium text-slate-900">{candidate.companyName}</p>
          {known && (
            <p className="mt-1 inline-block rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
              ⚠️ {knownLeadNote(known)}
            </p>
          )}
          <p className="mt-0.5 text-xs text-slate-500">
            {[
              candidate.cvrNumber && (
                <a
                  key="cvr"
                  href={`https://datacvr.virk.dk/enhed/virksomhed/${candidate.cvrNumber}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-600 underline decoration-dotted hover:text-slate-900"
                  onClick={(e) => e.stopPropagation()}
                >
                  CVR {candidate.cvrNumber}
                </a>
              ),
              candidate.industryText && (
                <span key="industry">
                  {candidate.industryText}
                  {candidate.industryCode && ` (${candidate.industryCode})`}
                </span>
              ),
              candidate.website && (
                <a
                  key="website"
                  href={websiteHref(candidate.website)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline decoration-dotted hover:text-slate-900"
                  onClick={(e) => e.stopPropagation()}
                >
                  {candidate.website}
                </a>
              ),
              candidate.address && <span key="address">{candidate.address}</span>,
            ]
              .filter(Boolean)
              .flatMap((part, i) => (i === 0 ? [part] : [" · ", part]))}
          </p>
          {/* A CSV import rarely carries a founding date - only shown when known. */}
          {(candidate.cvrNumber || candidate.foundedDate) && (
            <p className="mt-0.5 text-xs text-slate-400">Stiftet {formatDate(candidate.foundedDate)}</p>
          )}
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
        {known?.kind === "deal" ? (
          <div className="flex shrink-0 flex-wrap gap-1.5 whitespace-nowrap">
            <button
              type="button"
              onClick={hideFromList}
              disabled={pending}
              title="Fjern fra denne liste - dealen røres ikke"
              className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              Skjul
            </button>
            <Link
              href={`/deals/${known.dealId}`}
              className="rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-800"
            >
              Åbn deal
            </Link>
          </div>
        ) : (
          <div className="flex shrink-0 flex-wrap gap-1.5 whitespace-nowrap">
            <button
              type="button"
              onClick={known ? hideFromList : dismiss}
              disabled={pending}
              className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              {known ? "Skjul" : "Afvis"}
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
        )}
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
  renameTarget,
  candidates,
  targetListId,
  onAddAll,
}: {
  sourceLabel: string;
  renameTarget: RenameTarget | null;
  candidates: LeadCandidateData[];
  targetListId: string | null;
  onAddAll: (ids: string[], filterId: string | null) => Promise<void>;
}) {
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [addingAll, startAddingAll] = useTransition();
  const [deleting, startDeleting] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(sourceLabel);
  const [renaming, startRenaming] = useTransition();
  const router = useRouter();
  const showToast = useToast();
  const visible = candidates.filter((c) => !hiddenIds.has(c.id));
  const total = (candidates[0]?.groupTotal ?? candidates.length) - (candidates.length - visible.length);
  const notLoaded = total - visible.length;

  // Leads already handled elsewhere (see KnownLeadStatus) are left alone by
  // "Tilføj alle" - they're only listed here for information.
  const addable = visible.filter((c) => !c.known);

  function addAll() {
    startAddingAll(async () => {
      await onAddAll(addable.map((c) => c.id), candidates[0]?.listFilterId ?? null);
      setHiddenIds((prev) => new Set([...prev, ...addable.map((c) => c.id)]));
    });
  }

  function deleteList() {
    if (!confirm(`Slet denne liste (${visible.length} leads)? De forsvinder fra listen og kan ikke genskabes.`)) return;
    startDeleting(async () => {
      await deleteLeadCandidates(visible.map((c) => c.id), candidates[0]?.listFilterId ?? null);
      showToast(`${visible.length} leads fjernet fra listen.`);
      router.refresh();
    });
  }

  function startEditing() {
    setDraftName(sourceLabel);
    setEditing(true);
  }

  function saveName() {
    if (!renameTarget) return;
    const name = draftName.trim();
    if (name === sourceLabel) {
      setEditing(false);
      return;
    }
    if (!name && renameTarget.kind !== "url") {
      showToast("Giv listen et navn.");
      return;
    }
    startRenaming(async () => {
      const result =
        renameTarget.kind === "filter"
          ? await renameLeadFilter(renameTarget.id, name)
          : renameTarget.kind === "import"
            ? await renameLeadImportList(renameTarget.id, name)
            : await renameWatchedUrl(renameTarget.url, name);
      if (!result.ok) {
        showToast(result.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  if (visible.length === 0) return null;

  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        {editing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveName();
            }}
            className="flex w-full min-w-0 items-center gap-1.5 sm:w-auto sm:flex-1"
          >
            <input
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setEditing(false);
              }}
              disabled={renaming}
              maxLength={100}
              aria-label="Listens navn"
              className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm sm:max-w-xs"
            />
            <button
              type="submit"
              disabled={renaming}
              className="rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {renaming ? "Gemmer…" : "Gem"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={renaming}
              className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:text-slate-700"
            >
              Annuller
            </button>
          </form>
        ) : (
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
            {sourceLabel} <span className="font-normal normal-case text-slate-400">({total})</span>
          </button>
        )}
        <div className="flex gap-1.5">
          {renameTarget && !editing && (
            <button
              type="button"
              onClick={startEditing}
              title={
                renameTarget.kind === "filter"
                  ? "Omdøb listen (ændrer også filterets navn, så fremtidige fund lander her)"
                  : renameTarget.kind === "import"
                    ? "Omdøb den importerede liste"
                    : "Omdøb listen (vises i stedet for sidens URL)"
              }
              className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              Omdøb
            </button>
          )}
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
            disabled={addingAll || !targetListId || addable.length === 0}
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
          {notLoaded > 0 && (
            <p className="px-1 text-center text-xs text-slate-400">
              Viser de {visible.length} nyeste - {notLoaded} ældre vises, når disse er gennemgået.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** "Importér CSV" - uploads a lead list (e.g. every højskole with phone,
 * email and website) as its own list under Fundne leads; see importLeadCsv
 * for which columns are understood. */
function ImportCsvForm({ onClose }: { onClose: () => void }) {
  const [listName, setListName] = useState("");
  const [importing, startImport] = useTransition();
  const showToast = useToast();
  const router = useRouter();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startImport(async () => {
      const result = await importLeadCsv(formData);
      if (!result.ok) {
        showToast(result.error);
        return;
      }
      let message = `${result.imported} leads importeret.`;
      if (result.alreadyKnown > 0) message += ` ${result.alreadyKnown} findes allerede som deal og er markeret.`;
      if (result.skipped > 0) message += ` ${result.skipped} rækker sprunget over (uden navn eller dubletter).`;
      showToast(message);
      onClose();
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={submit}
      className="mt-3 w-full space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600"
    >
      <p>
        Vælg en CSV-fil med en <span className="font-medium">Navn</span>-kolonne - Telefon, Email, Hjemmeside, Adresse,
        Postnr, By og CVR bruges også, hvis de er der. Den bliver sin egen liste her under Fundne leads.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="file"
          name="file"
          accept=".csv,text/csv"
          required
          disabled={importing}
          onChange={(e) => {
            const fileName = e.target.files?.[0]?.name;
            if (fileName && !listName) setListName(fileName.replace(/\.[^.]+$/, ""));
          }}
          className="min-w-0 text-xs"
        />
        <input
          type="text"
          name="name"
          value={listName}
          onChange={(e) => setListName(e.target.value)}
          placeholder="Listens navn"
          maxLength={100}
          disabled={importing}
          className="min-w-0 rounded-md border border-slate-300 px-2 py-1 text-sm sm:w-56"
        />
        <div className="flex gap-1.5">
          <button
            type="submit"
            disabled={importing}
            className="rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {importing ? "Importerer…" : "Importér"}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={importing}
            className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:text-slate-700"
          >
            Annuller
          </button>
        </div>
      </div>
    </form>
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
  const [importOpen, setImportOpen] = useState(false);
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

  async function addAllToCallList(ids: string[], filterId: string | null) {
    if (!targetListId) {
      showToast("Vælg eller opret en ringeliste først.");
      return;
    }
    let added = 0;
    let alreadyExisted = 0;
    for (const id of ids) {
      const result = await addLeadCandidateToCallList(id, targetListId, filterId);
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
    const key = c.groupKey;
    const existing = groups.get(key);
    if (existing) existing.push(c);
    else groups.set(key, [c]);
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-slate-900">Fundne leads</h2>
          {!importOpen && (
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              Importér CSV
            </button>
          )}
        </div>
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
      {importOpen && <ImportCsvForm onClose={() => setImportOpen(false)} />}
      <div className="mt-3 space-y-4">
        {[...groups.entries()].map(([groupKey, group]) => (
          <CandidateGroup
            key={groupKey}
            sourceLabel={group[0].sourceLabel ?? "Uden kilde"}
            renameTarget={group[0].renameTarget}
            candidates={group}
            targetListId={targetListId}
            onAddAll={addAllToCallList}
          />
        ))}
        {candidates.length === 0 && (
          <p className="py-4 text-center text-sm text-slate-400">
            Ingen fundne leads endnu - opret et filter og tryk &quot;Kør nu&quot;, eller importér en CSV-fil.
          </p>
        )}
      </div>
    </section>
  );
}
