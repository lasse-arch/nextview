"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { createTask, toggleTaskDone, updateTaskAssignee, deleteTask, bulkReassignTasks } from "@/lib/actions/tasks";
import { formatDate, needsDeliveryLink } from "@/lib/labels";
import { useToast } from "@/components/toast";
import { TaskDetailModal, type ModalTask } from "../task-detail-modal";
import { Avatar } from "@/components/avatar";
import { extractDueDateFromTitle } from "@/lib/task-date-parser";

/** "2026-10-06", for a <input type="date">'s value. */
export function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export type BoardTask = {
  id: string;
  title: string;
  description: string | null;
  done: boolean;
  dueDate: Date | null;
  assigneeId: string | null;
  dealId: string | null;
  recurringWeekday: number | null;
};

/** Monday-first display order, but values match Date.getDay() (0=søndag)
 * so they compose directly with plain Date arithmetic elsewhere. */
export const WEEKDAY_OPTIONS = [
  { value: 1, label: "mandag" },
  { value: 2, label: "tirsdag" },
  { value: 3, label: "onsdag" },
  { value: 4, label: "torsdag" },
  { value: 5, label: "fredag" },
  { value: 6, label: "lørdag" },
  { value: 0, label: "søndag" },
];

/** Mirrors resolveDueDate in lib/actions/tasks.ts - a recurring task with no
 * due date typed in gets one filled in immediately (nearest upcoming
 * occurrence of its weekday), so the optimistically-added card shows a date
 * right away instead of blank until the next server round-trip. */
export function resolveDueDate(dueDate: Date | null, recurringWeekday: number | null): Date | null {
  if (dueDate || recurringWeekday === null) return dueDate;
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  const diff = (recurringWeekday - base.getDay() + 7) % 7;
  base.setDate(base.getDate() + diff);
  return base;
}

export type BoardUser = { id: string; name: string; avatarUrl?: string | null };
export type BoardDealOption = { id: string; name: string };

const UNASSIGNED = "__unassigned__";
const NO_DEAL = "__no_deal__";

function userName(users: BoardUser[], id: string | null): string | null {
  return users.find((u) => u.id === id)?.name ?? null;
}

function findUser(users: BoardUser[], id: string | null): BoardUser | null {
  return users.find((u) => u.id === id) ?? null;
}

function dealLabel(deals: BoardDealOption[], id: string | null): string | null {
  return deals.find((d) => d.id === id)?.name ?? null;
}

function NewTaskModal({
  users,
  deals,
  onClose,
  onCreated,
}: {
  users: BoardUser[];
  deals: BoardDealOption[];
  onClose: () => void;
  onCreated: (task: BoardTask) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const showToast = useToast();

  /** Typing a date/week number/weekday into the title (e.g. "Status på
   * Hotel Royal 6 oktober") fills Forfaldsdato automatically and strips it
   * back out of the title - only when Forfaldsdato isn't already set by
   * hand, so this never overwrites a date the user picked deliberately. */
  function handleTitleBlur() {
    if (dueDate) return;
    const result = extractDueDateFromTitle(title);
    if (result.dueDate) {
      setTitle(result.cleanedTitle);
      setDueDate(toDateInputValue(result.dueDate));
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    const title = String(formData.get("title") || "").trim();
    const assigneeId = String(formData.get("assigneeId") || "") || null;
    const dealId = String(formData.get("dealId") || "") || null;
    const dueDateRaw = String(formData.get("dueDate") || "");
    const recurringWeekdayRaw = String(formData.get("recurringWeekday") || "");

    startTransition(async () => {
      const result = await createTask(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const recurringWeekday = recurringWeekdayRaw ? Number(recurringWeekdayRaw) : null;
      onCreated({
        id: result.id,
        title,
        description: String(formData.get("description") || "").trim() || null,
        done: false,
        dueDate: resolveDueDate(dueDateRaw ? new Date(dueDateRaw) : null, recurringWeekday),
        assigneeId,
        dealId,
        recurringWeekday,
      });
      showToast("Opgave oprettet");
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      {/* max-h + overflow-y-auto (matching TaskDetailModal's already-proven
         pattern) - without it, this modal's full height (title, assignee,
         due date, recurring, deal, description, buttons) had nowhere to
         shrink or scroll when the on-screen keyboard appeared on mobile,
         pushing most of the form out of view. */}
      <form
        onSubmit={handleSubmit}
        className="relative max-h-[85vh] w-full max-w-md space-y-3 overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
      >
        <h2 className="text-sm font-semibold text-slate-900">Ny opgave</h2>
        {/* scroll-mt reserves space above this field for when the mobile
           keyboard opening makes the browser auto-scroll the focused input
           into view - without it, the scroll lands flush at the very top
           (cutting the "Ny opgave"/"Titel *" labels off awkwardly against
           the edge) instead of leaving them visible with some breathing
           room. */}
        <div className="scroll-mt-6">
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Titel *</label>
          <input
            name="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleTitleBlur}
            required
            autoFocus
            // Suppresses iOS Safari's QuickType autofill bar (password/
            // payment-card/address suggestions) - irrelevant for a task
            // title and, combined with the keyboard, was eating even more
            // of the already-tight mobile screen.
            autoComplete="off"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Tildel til</label>
            <select name="assigneeId" defaultValue="" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              <option value="">Fælles (ingen)</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Forfaldsdato</label>
            <input
              name="dueDate"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Gentages (valgfri)</label>
          <select name="recurringWeekday" defaultValue="" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="">Gentages ikke</option>
            {WEEKDAY_OPTIONS.map((w) => (
              <option key={w.value} value={w.value}>
                Hver {w.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Koblet til deal (valgfri)</label>
          <select name="dealId" defaultValue="" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="">Ingen deal</option>
            {deals.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Beskrivelse (valgfri)</label>
          <textarea name="description" rows={3} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
            Annullér
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {pending ? "Opretter…" : "Opret opgave"}
          </button>
        </div>
      </form>
    </div>
  );
}

export function TaskBoard({
  initialTasks,
  users,
  deals,
}: {
  initialTasks: BoardTask[];
  users: BoardUser[];
  deals: BoardDealOption[];
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [groupBy, setGroupBy] = useState<"person" | "deal">("person");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [showNewTask, setShowNewTask] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [bulkAssigneeId, setBulkAssigneeId] = useState("");
  const [quickAddColumn, setQuickAddColumn] = useState<string | null>(null);
  const [quickAddText, setQuickAddText] = useState("");
  const [, startTransition] = useTransition();
  const showToast = useToast();

  function toggleChecked(taskId: string) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  /** Selects/deselects every task currently visible in one column at once - e.g. all of a
   * deal's tasks in "Pr. deal" view - feeding the same checkedIds/toolbar as picking tasks
   * one by one, so there's a single bulk-reassign flow instead of a separate one per column. */
  function toggleColumnChecked(colTasks: BoardTask[]) {
    const ids = colTasks.map((t) => t.id);
    const allChecked = ids.length > 0 && ids.every((id) => checkedIds.has(id));
    setCheckedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (allChecked) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  function handleBulkReassign() {
    const ids = Array.from(checkedIds);
    if (ids.length === 0) return;
    const assigneeId = bulkAssigneeId || null;
    setTasks((prev) => prev.map((t) => (ids.includes(t.id) ? { ...t, assigneeId } : t)));
    setCheckedIds(new Set());
    setBulkAssigneeId("");
    startTransition(async () => {
      await bulkReassignTasks(ids, assigneeId);
      showToast(`${ids.length} opgave${ids.length === 1 ? "" : "r"} tildelt`);
    });
  }

  const personColumns = useMemo(() => {
    return [
      ...users.map((u) => ({ key: u.id, label: u.name, avatarUrl: u.avatarUrl })),
      { key: UNASSIGNED, label: "Fælles", avatarUrl: null },
    ];
  }, [users]);

  const dealColumns = useMemo(() => {
    const idsInUse = new Set(tasks.map((t) => t.dealId).filter((id): id is string => Boolean(id)));
    const cols = deals
      .filter((d) => idsInUse.has(d.id))
      .map((d) => ({ key: d.id, label: d.name, avatarUrl: null as string | null }));
    cols.push({ key: NO_DEAL, label: "Uden deal", avatarUrl: null });
    return cols;
  }, [deals, tasks]);

  const columns = groupBy === "person" ? personColumns : dealColumns;
  const selectedTask = tasks.find((t) => t.id === selectedTaskId) ?? null;

  /** Soonest due date first (most urgent at top) - tasks without a due date
   * have no urgency signal, so they sit below the dated ones rather than
   * being scattered by creation order. Array.sort is stable, so within
   * either group the original (creation) order is preserved. */
  function byDueDate(a: BoardTask, b: BoardTask): number {
    if (a.dueDate && b.dueDate) return a.dueDate.getTime() - b.dueDate.getTime();
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return 0;
  }

  function tasksForColumn(key: string) {
    const inColumn =
      groupBy === "person"
        ? tasks.filter((t) => (t.assigneeId ?? UNASSIGNED) === key)
        : tasks.filter((t) => (t.dealId ?? NO_DEAL) === key);
    const visible = showDone ? inColumn : inColumn.filter((t) => !t.done);
    return [...visible].sort(byDueDate);
  }

  function handleDrop(columnKey: string) {
    const draggedId = draggingId;
    setDraggingId(null);
    if (groupBy !== "person" || !draggedId) return;
    const task = tasks.find((t) => t.id === draggedId);
    if (!task) return;
    const newAssigneeId = columnKey === UNASSIGNED ? null : columnKey;
    if ((task.assigneeId ?? UNASSIGNED) === columnKey) return;

    const previous = task.assigneeId;
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, assigneeId: newAssigneeId } : t)));

    startTransition(async () => {
      try {
        await updateTaskAssignee(task.id, newAssigneeId);
      } catch {
        setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, assigneeId: previous } : t)));
        showToast("Kunne ikke flytte opgaven.");
      }
    });
  }

  function handleToggleDone(taskId: string) {
    const task = tasks.find((t) => t.id === taskId);
    const turningDone = task ? !task.done : false;
    const productType = task?.title.startsWith("Aflever ") ? task.title.slice("Aflever ".length) : null;
    const deliveryUrl =
      turningDone && productType && needsDeliveryLink(productType)
        ? window.prompt(`Link til ${productType} (valgfrit - vises under Live kunder):`)
        : null;

    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, done: turningDone } : t)));
    startTransition(() => toggleTaskDone(taskId, deliveryUrl));
  }

  function handleDelete(taskId: string) {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    startTransition(async () => {
      await deleteTask(taskId);
      showToast("Opgave slettet");
    });
  }

  function submitQuickAdd(columnKey: string) {
    const raw = quickAddText.trim();
    setQuickAddColumn(null);
    setQuickAddText("");
    if (!raw) return;

    // Quick-add has no separate due-date field to fill in by hand, so a
    // date/week number typed into the title (e.g. "Ring op i uge 43") is
    // extracted and applied automatically rather than just left in the text.
    const { cleanedTitle: title, dueDate } = extractDueDateFromTitle(raw);
    const assigneeId = groupBy === "person" && columnKey !== UNASSIGNED ? columnKey : null;
    const dealId = groupBy === "deal" && columnKey !== NO_DEAL ? columnKey : null;

    const formData = new FormData();
    formData.set("title", title);
    if (assigneeId) formData.set("assigneeId", assigneeId);
    if (dealId) formData.set("dealId", dealId);
    if (dueDate) formData.set("dueDate", toDateInputValue(dueDate));

    startTransition(async () => {
      const result = await createTask(formData);
      if (result.ok) {
        setTasks((prev) => [
          ...prev,
          { id: result.id, title, description: null, done: false, dueDate: dueDate ?? null, assigneeId, dealId, recurringWeekday: null },
        ]);
      } else {
        showToast(result.error);
      }
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-md border border-slate-300 text-xs">
          <button
            type="button"
            onClick={() => setGroupBy("person")}
            className={`rounded-l-md px-2.5 py-1.5 font-medium ${
              groupBy === "person" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            Pr. person
          </button>
          <button
            type="button"
            onClick={() => setGroupBy("deal")}
            className={`rounded-r-md px-2.5 py-1.5 font-medium ${
              groupBy === "deal" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            Pr. deal
          </button>
        </div>
        <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
          Vis fuldførte
        </label>
        <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
          <input
            type="checkbox"
            checked={selectMode}
            onChange={(e) => {
              setSelectMode(e.target.checked);
              if (!e.target.checked) setCheckedIds(new Set());
            }}
          />
          Massemarkér
        </label>
        {selectMode && checkedIds.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">{checkedIds.size} valgt</span>
            <select
              value={bulkAssigneeId}
              onChange={(e) => setBulkAssigneeId(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1 text-xs"
            >
              <option value="">Fælles (ingen)</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleBulkReassign}
              className="rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-800"
            >
              Skift ejer
            </button>
            <button
              type="button"
              onClick={() => setCheckedIds(new Set())}
              className="text-xs text-slate-500 underline hover:text-slate-700"
            >
              Fortryd valg
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={() => setShowNewTask(true)}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          + Ny opgave
        </button>
      </div>

      <div className="mt-4 flex gap-3 overflow-x-auto pb-4">
        {columns.map((col) => {
          const colTasks = tasksForColumn(col.key);
          return (
            <div
              key={col.key}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(col.key)}
              className="flex h-[calc(100vh-260px)] w-64 flex-shrink-0 flex-col rounded-lg bg-slate-100"
            >
              <div className="flex items-start gap-1.5 px-2.5 py-2">
                {selectMode && colTasks.length > 0 && (
                  <input
                    type="checkbox"
                    title="Vælg alle i denne kolonne"
                    checked={colTasks.every((t) => checkedIds.has(t.id))}
                    onChange={() => toggleColumnChecked(colTasks)}
                    className="mt-0.5 shrink-0"
                  />
                )}
                {groupBy === "person" && col.key !== UNASSIGNED && <Avatar name={col.label} avatarUrl={col.avatarUrl} size={22} />}
                <div className="min-w-0">
                  <h3 className="truncate text-xs font-semibold text-slate-800">{col.label}</h3>
                  <p className="text-[11px] text-slate-500">{colTasks.length} opgave{colTasks.length === 1 ? "" : "r"}</p>
                </div>
              </div>
              <div className="flex-1 space-y-1.5 overflow-y-auto px-1.5 pb-1.5">
                {colTasks.map((task) => {
                  const assignee = userName(users, task.assigneeId);
                  const assigneeUser = findUser(users, task.assigneeId);
                  const deal = dealLabel(deals, task.dealId);
                  return (
                    <div
                      key={task.id}
                      draggable={groupBy === "person"}
                      onDragStart={() => setDraggingId(task.id)}
                      onDragEnd={() => setDraggingId(null)}
                      onClick={() => setSelectedTaskId(task.id)}
                      className={`group cursor-pointer rounded-md border px-2.5 py-2 shadow-sm ${
                        groupBy === "person" ? "active:cursor-grabbing" : ""
                      } ${task.done ? "border-slate-200 bg-slate-50" : "border-slate-200 bg-white"}`}
                    >
                      <div className="flex items-start gap-2">
                        {selectMode ? (
                          <input
                            type="checkbox"
                            checked={checkedIds.has(task.id)}
                            onClick={(e) => e.stopPropagation()}
                            onChange={() => toggleChecked(task.id)}
                            title="Vælg til bulk-handling"
                            className="mt-0.5 shrink-0"
                          />
                        ) : (
                          <input
                            type="checkbox"
                            checked={task.done}
                            onClick={(e) => e.stopPropagation()}
                            onChange={() => handleToggleDone(task.id)}
                            title="Marker som fuldført"
                            className="mt-0.5 shrink-0"
                          />
                        )}
                        <p className={`min-w-0 flex-1 text-xs font-medium ${task.done ? "text-slate-400 line-through" : "text-slate-900"}`}>
                          {task.title}
                        </p>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(task.id);
                          }}
                          className="shrink-0 text-slate-300 opacity-0 hover:text-red-600 group-hover:opacity-100"
                          aria-label="Slet opgave"
                        >
                          ×
                        </button>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 pl-9 text-[11px] text-slate-500">
                        {groupBy === "deal" &&
                          (assignee ? (
                            <span className="flex items-center gap-1 rounded-full bg-slate-200 py-0.5 pl-0.5 pr-1.5">
                              <Avatar name={assignee} avatarUrl={assigneeUser?.avatarUrl} size={14} />
                              {assignee}
                            </span>
                          ) : (
                            <span className="text-amber-600">Ingen ejer</span>
                          ))}
                        {groupBy === "person" && deal && task.dealId && (
                          <Link
                            href={`/deals/${task.dealId}`}
                            onClick={(e) => e.stopPropagation()}
                            className="truncate text-blue-600 hover:underline"
                          >
                            {deal}
                          </Link>
                        )}
                        {task.dueDate && <span>{formatDate(task.dueDate)}</span>}
                        {task.recurringWeekday !== null && (
                          <span title={`Gentages hver ${WEEKDAY_OPTIONS.find((w) => w.value === task.recurringWeekday)?.label}`}>
                            🔁
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}

                {quickAddColumn === col.key ? (
                  <input
                    autoFocus
                    value={quickAddText}
                    onChange={(e) => setQuickAddText(e.target.value)}
                    onBlur={() => submitQuickAdd(col.key)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        submitQuickAdd(col.key);
                      }
                      if (e.key === "Escape") {
                        setQuickAddColumn(null);
                        setQuickAddText("");
                      }
                    }}
                    placeholder="Titel…"
                    autoComplete="off"
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setQuickAddColumn(col.key);
                      setQuickAddText("");
                    }}
                    className="w-full rounded-md px-2 py-1.5 text-left text-xs text-slate-500 hover:bg-slate-200"
                  >
                    + Tilføj opgave
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showNewTask && (
        <NewTaskModal
          users={users}
          deals={deals}
          onClose={() => setShowNewTask(false)}
          onCreated={(task) => setTasks((prev) => [...prev, task])}
        />
      )}

      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          users={users}
          deals={deals}
          onClose={() => setSelectedTaskId(null)}
          onUpdated={(updated) => {
            setTasks((prev) => prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)));
            setSelectedTaskId(null);
          }}
          onDeleted={() => {
            setTasks((prev) => prev.filter((t) => t.id !== selectedTaskId));
            setSelectedTaskId(null);
          }}
        />
      )}
    </div>
  );
}
