"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addManualTimeEntry, deleteTimeEntry } from "@/lib/actions/time-entries";
import { timeEntryCategoryLabels } from "@/lib/labels";
import { useToast } from "@/components/toast";

export type TimeEntryRow = {
  id: string;
  date: string;
  minutes: number;
  source: "MANUAL" | "EMAIL";
  category: string | null;
  userId: string;
  userName: string;
  canDelete: boolean;
};

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours} t`;
  return `${hours} t ${rest} min`;
}

function todayInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

export function TimeTrackingSection({
  dealId,
  entries,
  users,
  currentUserId,
}: {
  dealId: string;
  entries: TimeEntryRow[];
  users: { id: string; name: string }[];
  currentUserId: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>(currentUserId ? [currentUserId] : []);
  const router = useRouter();
  const showToast = useToast();

  const totalMinutes = useMemo(() => entries.reduce((sum, e) => sum + e.minutes, 0), [entries]);

  const byDate = useMemo(() => {
    const groups = new Map<string, TimeEntryRow[]>();
    for (const entry of entries) {
      const key = entry.date;
      const existing = groups.get(key);
      if (existing) existing.push(entry);
      else groups.set(key, [entry]);
    }
    return [...groups.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [entries]);

  function toggleUser(userId: string) {
    setSelectedUserIds((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const formData = new FormData(form);
    selectedUserIds.forEach((id) => formData.append("userIds", id));
    startTransition(async () => {
      try {
        const result = await addManualTimeEntry(dealId, formData);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        form.reset();
        setSelectedUserIds(currentUserId ? [currentUserId] : []);
        showToast("Timer tilføjet");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Der opstod en fejl.");
      }
    });
  }

  function handleDelete(entryId: string) {
    if (!confirm("Slet denne tidsregistrering?")) return;
    startTransition(async () => {
      try {
        const result = await deleteTimeEntry(entryId);
        if (!result.ok) {
          showToast(result.error);
          return;
        }
        router.refresh();
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Der opstod en fejl.");
      }
    });
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Tidsregistrering</h2>
        <span className="text-sm font-medium text-slate-700">{formatMinutes(totalMinutes)} i alt</span>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Mandetimer brugt på kunden - fx 7 timer hver for to personer samme dag tæller som 14 timer i alt. En
        mail sendt fra dealen lægger automatisk 15 minutter til. Timer rundes altid op til nærmeste kvarter.
      </p>

      <form onSubmit={handleSubmit} className="mt-4 flex flex-wrap items-end gap-3 rounded-md border border-slate-200 p-3">
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Dato</label>
          <input
            type="date"
            name="date"
            defaultValue={todayInputValue()}
            required
            className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Timer</label>
          <input
            type="number"
            name="hours"
            step="any"
            min="0.01"
            placeholder="fx 7"
            required
            className="mt-1 w-24 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Brugt på</label>
          <select
            name="category"
            required
            defaultValue=""
            className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="" disabled>
              Vælg…
            </option>
            {Object.entries(timeEntryCategoryLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Hvem</label>
          <div className="mt-1 flex flex-wrap gap-2">
            {users.map((u) => (
              <label
                key={u.id}
                className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs ${
                  selectedUserIds.includes(u.id)
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 text-slate-600"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedUserIds.includes(u.id)}
                  onChange={() => toggleUser(u.id)}
                  className="hidden"
                />
                {u.name}
              </label>
            ))}
          </div>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? "Gemmer…" : "Tilføj"}
        </button>
      </form>
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}

      <div className="mt-4 space-y-3">
        {byDate.map(([date, dayEntries]) => (
          <div key={date} className="border-b border-slate-100 pb-2 last:border-0">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>{new Intl.DateTimeFormat("da-DK", { dateStyle: "medium" }).format(new Date(date))}</span>
              <span>{formatMinutes(dayEntries.reduce((sum, e) => sum + e.minutes, 0))}</span>
            </div>
            <ul className="mt-1 space-y-1">
              {dayEntries.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between text-sm text-slate-700">
                  <span>
                    {entry.userName}
                    {entry.category && (
                      <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                        {timeEntryCategoryLabels[entry.category] ?? entry.category}
                      </span>
                    )}
                    {entry.source === "EMAIL" && (
                      <span className="ml-1.5 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                        mail
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-2">
                    {formatMinutes(entry.minutes)}
                    {entry.canDelete && (
                      <button
                        type="button"
                        onClick={() => handleDelete(entry.id)}
                        disabled={pending}
                        className="text-xs font-medium text-slate-400 hover:text-red-600 disabled:opacity-50"
                        title="Slet"
                      >
                        Slet
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {entries.length === 0 && <p className="text-sm text-slate-400">Ingen timer registreret endnu.</p>}
      </div>
    </section>
  );
}
