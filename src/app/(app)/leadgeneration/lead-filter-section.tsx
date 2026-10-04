"use client";

import { useState, useTransition } from "react";
import {
  createLeadFilter,
  updateLeadFilter,
  setLeadFilterEnabled,
  deleteLeadFilter,
  runLeadFilterNowAction,
} from "@/lib/actions/lead-generation";
import { useToast } from "@/components/toast";
import { DANISH_MUNICIPALITIES } from "@/lib/danish-municipalities";

/** Checkbox multi-select for `municipality` (kept as the same comma-separated
 * string the form field always was, via a hidden input) - a plain free-text
 * field was too easy to mistype/misspell against the CVR register's own
 * exact kommuneNavn spelling, silently matching nothing. */
function MunicipalityPicker({ name, defaultValue }: { name: string; defaultValue: string }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(() =>
    defaultValue
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );

  function toggle(m: string) {
    setSelected((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  }

  return (
    <div className="relative">
      <input type="hidden" name={name} value={selected.join(", ")} />
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-left text-sm text-slate-700"
      >
        {selected.length > 0
          ? `${selected.length} valgt: ${selected.slice(0, 3).join(", ")}${selected.length > 3 ? "…" : ""}`
          : "Vælg kommuner…"}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-slate-300 bg-white p-2 shadow-lg">
            {DANISH_MUNICIPALITIES.map((m) => (
              <label key={m} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50">
                <input type="checkbox" checked={selected.includes(m)} onChange={() => toggle(m)} />
                {m}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export type LeadFilterData = {
  id: string;
  name: string;
  industryQuery: string | null;
  municipality: string | null;
  activeOnly: boolean;
  foundedFrom: string | null;
  foundedTo: string | null;
  maxResults: number;
  enabled: boolean;
  lastRunAt: string | null;
  newCandidateCount: number;
  autoCreateDailyList: boolean;
  targetCallListId: string | null;
};

export type CallListOption = { id: string; name: string };

const MAX_RESULTS_OPTIONS = [25, 50, 100, 200, 500, 1000] as const;

function formatDateShort(iso: string): string {
  return new Intl.DateTimeFormat("da-DK", { dateStyle: "medium" }).format(new Date(iso));
}

function criteriaSummary(
  f: Pick<LeadFilterData, "industryQuery" | "municipality" | "activeOnly" | "foundedFrom" | "foundedTo" | "maxResults">
): string {
  const parts: string[] = [];
  if (f.industryQuery) parts.push(`Branche: ${f.industryQuery}`);
  if (f.municipality) parts.push(`Område: ${f.municipality}`);
  if (f.foundedFrom || f.foundedTo) {
    const from = f.foundedFrom ? formatDateShort(f.foundedFrom) : "…";
    const to = f.foundedTo ? formatDateShort(f.foundedTo) : "nu";
    parts.push(`Stiftet: ${from} – ${to}`);
  }
  parts.push(f.activeOnly ? "Kun aktive" : "Inkl. ophørte");
  parts.push(`Op til ${f.maxResults} pr. kørsel`);
  return parts.join(" · ");
}

function formatRelative(iso: string | null): string {
  if (!iso) return "Aldrig kørt";
  const diffMs = Date.now() - new Date(iso).getTime();
  const hours = Math.round(diffMs / (60 * 60 * 1000));
  if (hours < 1) return "Kørt for lidt siden";
  if (hours < 24) return `Kørt for ${hours} t. siden`;
  const days = Math.round(hours / 24);
  return `Kørt for ${days} dag${days === 1 ? "" : "e"} siden`;
}

function FilterForm({
  initial,
  callLists,
  onDone,
}: {
  initial?: LeadFilterData;
  callLists: CallListOption[];
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const showToast = useToast();

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = initial
        ? await updateLeadFilter(initial.id, formData)
        : await createLeadFilter(formData);
      if (!result.ok) {
        showToast(result.error);
        return;
      }
      showToast(initial ? "Filter opdateret." : "Filter oprettet.");
      onDone();
    });
  }

  return (
    <form action={submit} className="mt-3 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div>
        <label className="block text-xs font-medium text-slate-600">Navn</label>
        <input
          name="name"
          defaultValue={initial?.name}
          required
          placeholder="fx Restauranter i Aarhus"
          className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-slate-600">Branche eller branchekode (kommasepareret)</label>
          <input
            name="industryQuery"
            defaultValue={initial?.industryQuery ?? ""}
            placeholder="fx restaurant, café, 931300"
            className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600">Kommune(r)</label>
          <MunicipalityPicker name="municipality" defaultValue={initial?.municipality ?? ""} />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-slate-600">Stiftet fra</label>
          <input
            type="date"
            name="foundedFrom"
            defaultValue={initial?.foundedFrom ? initial.foundedFrom.slice(0, 10) : ""}
            className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600">Stiftet til</label>
          <input
            type="date"
            name="foundedTo"
            defaultValue={initial?.foundedTo ? initial.foundedTo.slice(0, 10) : ""}
            className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600">Antal resultater pr. kørsel</label>
        <select
          name="maxResults"
          defaultValue={initial?.maxResults ?? 50}
          className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm sm:w-40"
        >
          {MAX_RESULTS_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" name="activeOnly" defaultChecked={initial?.activeOnly ?? true} />
        Kun aktive virksomheder
      </label>
      <div>
        <label className="block text-xs font-medium text-slate-600">Ringeliste (automatisk)</label>
        <select
          name="ringelisteTarget"
          defaultValue={initial?.autoCreateDailyList ? "__daily__" : initial?.targetCallListId ?? ""}
          className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm sm:w-72"
        >
          <option value="">Nej - vis kun under &quot;Fundne leads&quot;</option>
          <option value="__daily__">Opret ny liste hver dag</option>
          {callLists.map((l) => (
            <option key={l.id} value={l.id}>
              Tilføj til: {l.name}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-slate-400">
          Når slået til, springer automatiske (og &quot;Kør nu&quot;) kørsler &quot;Fundne leads&quot; over og
          opretter fundne leads direkte som deals på den valgte ringeliste.
        </p>
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? "Gemmer…" : initial ? "Gem ændringer" : "Opret filter"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-white"
        >
          Annullér
        </button>
      </div>
    </form>
  );
}

function FilterCard({ filter, callLists }: { filter: LeadFilterData; callLists: CallListOption[] }) {
  const [editing, setEditing] = useState(false);
  const [running, startRun] = useTransition();
  const [toggling, startToggle] = useTransition();
  const showToast = useToast();

  function runNow() {
    startRun(async () => {
      const result = await runLeadFilterNowAction(filter.id);
      if (!result.ok) {
        showToast(result.error);
        return;
      }
      // Says how many the register matched and how many were already in the
      // CRM, so a low "nye" count reads as "the rest were found earlier",
      // not as the filter being broken.
      const found = result.added > 0 ? `${result.added} nye leads fundet.` : "Ingen nye leads denne gang.";
      const parts: string[] = [];
      if (result.matched != null) parts.push(`${result.matched.toLocaleString("da-DK")} matcher i CVR`);
      if (result.alreadyKnown > 0) parts.push(`${result.alreadyKnown.toLocaleString("da-DK")} fandtes allerede`);
      showToast(parts.length > 0 ? `${found} (${parts.join(", ")})` : found);
    });
  }

  function toggleEnabled() {
    startToggle(() => setLeadFilterEnabled(filter.id, !filter.enabled));
  }

  async function remove() {
    if (!confirm(`Slet filteret "${filter.name}"?`)) return;
    await deleteLeadFilter(filter.id);
  }

  if (editing) {
    return <FilterForm initial={filter} callLists={callLists} onDone={() => setEditing(false)} />;
  }

  const targetListName = filter.targetCallListId ? callLists.find((l) => l.id === filter.targetCallListId)?.name : null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium text-slate-900">{filter.name}</p>
          {filter.newCandidateCount > 0 && (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
              {filter.newCandidateCount} nye
            </span>
          )}
          {(filter.autoCreateDailyList || targetListName) && (
            <span
              className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700"
              title="Fundne leads tilføjes automatisk som deals på denne ringeliste, uden om manuel gennemgang"
            >
              → {filter.autoCreateDailyList ? "Ny liste hver dag" : targetListName}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-slate-500">{criteriaSummary(filter)}</p>
        <p className="mt-0.5 text-xs text-slate-400">{formatRelative(filter.lastRunAt)}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <label className="flex items-center gap-1.5 text-xs text-slate-500" title="Kør automatisk hver dag">
          <input type="checkbox" checked={filter.enabled} disabled={toggling} onChange={toggleEnabled} />
          Daglig
        </label>
        <button
          type="button"
          onClick={runNow}
          disabled={running}
          className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {running ? "Søger…" : "Kør nu"}
        </button>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          Redigér
        </button>
        <button
          type="button"
          onClick={remove}
          className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
        >
          Slet
        </button>
      </div>
    </div>
  );
}

export function LeadFilterSection({ filters, callLists }: { filters: LeadFilterData[]; callLists: CallListOption[] }) {
  const [creating, setCreating] = useState(false);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Dine filtre</h2>
        {!creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
          >
            + Nyt filter
          </button>
        )}
      </div>

      {creating && <FilterForm callLists={callLists} onDone={() => setCreating(false)} />}

      <div className="mt-3 space-y-2">
        {filters.map((f) => (
          <FilterCard key={f.id} filter={f} callLists={callLists} />
        ))}
        {filters.length === 0 && !creating && (
          <p className="py-4 text-center text-sm text-slate-400">Ingen filtre endnu - opret et for at komme i gang.</p>
        )}
      </div>
    </section>
  );
}
