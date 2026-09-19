"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { createTask, toggleTaskDone, updateTaskAssignee, deleteTask } from "@/lib/actions/tasks";
import { formatDate } from "@/lib/labels";
import { useToast } from "@/components/toast";

export type BoardTask = {
  id: string;
  title: string;
  description: string | null;
  done: boolean;
  dueDate: Date | null;
  assigneeId: string | null;
  dealId: string | null;
};

export type BoardUser = { id: string; name: string };
export type BoardDealOption = { id: string; name: string };

const UNASSIGNED = "__unassigned__";
const NO_DEAL = "__no_deal__";

function userName(users: BoardUser[], id: string | null): string | null {
  return users.find((u) => u.id === id)?.name ?? null;
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
  const showToast = useToast();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    const title = String(formData.get("title") || "").trim();
    const assigneeId = String(formData.get("assigneeId") || "") || null;
    const dealId = String(formData.get("dealId") || "") || null;
    const dueDateRaw = String(formData.get("dueDate") || "");

    startTransition(async () => {
      const result = await createTask(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onCreated({
        id: result.id,
        title,
        description: String(formData.get("description") || "").trim() || null,
        done: false,
        dueDate: dueDateRaw ? new Date(dueDateRaw) : null,
        assigneeId,
        dealId,
      });
      showToast("Opgave oprettet");
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <form
        onSubmit={handleSubmit}
        className="relative w-full max-w-md space-y-3 rounded-xl bg-white p-6 shadow-xl"
      >
        <h2 className="text-sm font-semibold text-slate-900">Ny opgave</h2>
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Titel *</label>
          <input
            name="title"
            required
            autoFocus
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
            <input name="dueDate" type="date" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
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
  const [quickAddColumn, setQuickAddColumn] = useState<string | null>(null);
  const [quickAddText, setQuickAddText] = useState("");
  const [, startTransition] = useTransition();
  const showToast = useToast();

  const personColumns = useMemo(() => {
    return [...users.map((u) => ({ key: u.id, label: u.name })), { key: UNASSIGNED, label: "Fælles" }];
  }, [users]);

  const dealColumns = useMemo(() => {
    const idsInUse = new Set(tasks.map((t) => t.dealId).filter((id): id is string => Boolean(id)));
    const cols = deals.filter((d) => idsInUse.has(d.id)).map((d) => ({ key: d.id, label: d.name }));
    cols.push({ key: NO_DEAL, label: "Uden deal" });
    return cols;
  }, [deals, tasks]);

  const columns = groupBy === "person" ? personColumns : dealColumns;

  function tasksForColumn(key: string) {
    if (groupBy === "person") return tasks.filter((t) => (t.assigneeId ?? UNASSIGNED) === key);
    return tasks.filter((t) => (t.dealId ?? NO_DEAL) === key);
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
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, done: !t.done } : t)));
    startTransition(() => toggleTaskDone(taskId));
  }

  function handleDelete(taskId: string) {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    startTransition(async () => {
      await deleteTask(taskId);
      showToast("Opgave slettet");
    });
  }

  function submitQuickAdd(columnKey: string) {
    const title = quickAddText.trim();
    setQuickAddColumn(null);
    setQuickAddText("");
    if (!title) return;

    const assigneeId = groupBy === "person" && columnKey !== UNASSIGNED ? columnKey : null;
    const dealId = groupBy === "deal" && columnKey !== NO_DEAL ? columnKey : null;

    const formData = new FormData();
    formData.set("title", title);
    if (assigneeId) formData.set("assigneeId", assigneeId);
    if (dealId) formData.set("dealId", dealId);

    startTransition(async () => {
      const result = await createTask(formData);
      if (result.ok) {
        setTasks((prev) => [
          ...prev,
          { id: result.id, title, description: null, done: false, dueDate: null, assigneeId, dealId },
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
              <div className="px-2.5 py-2">
                <h3 className="truncate text-xs font-semibold text-slate-800">{col.label}</h3>
                <p className="text-[11px] text-slate-500">{colTasks.length} opgave{colTasks.length === 1 ? "" : "r"}</p>
              </div>
              <div className="flex-1 space-y-1.5 overflow-y-auto px-1.5 pb-1.5">
                {colTasks.map((task) => {
                  const assignee = userName(users, task.assigneeId);
                  const deal = dealLabel(deals, task.dealId);
                  return (
                    <div
                      key={task.id}
                      draggable={groupBy === "person"}
                      onDragStart={() => setDraggingId(task.id)}
                      onDragEnd={() => setDraggingId(null)}
                      className={`group rounded-md border px-2.5 py-2 shadow-sm ${
                        groupBy === "person" ? "cursor-grab active:cursor-grabbing" : ""
                      } ${task.done ? "border-slate-200 bg-slate-50" : "border-slate-200 bg-white"}`}
                    >
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={task.done}
                          onChange={() => handleToggleDone(task.id)}
                          className="mt-0.5 shrink-0"
                        />
                        <p className={`min-w-0 flex-1 text-xs font-medium ${task.done ? "text-slate-400 line-through" : "text-slate-900"}`}>
                          {task.title}
                        </p>
                        <button
                          type="button"
                          onClick={() => handleDelete(task.id)}
                          className="shrink-0 text-slate-300 opacity-0 hover:text-red-600 group-hover:opacity-100"
                          aria-label="Slet opgave"
                        >
                          ×
                        </button>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 pl-5 text-[11px] text-slate-500">
                        {groupBy === "deal" && assignee && (
                          <span className="rounded-full bg-slate-200 px-1.5 py-0.5">{assignee}</span>
                        )}
                        {groupBy === "person" && deal && task.dealId && (
                          <Link href={`/deals/${task.dealId}`} className="truncate text-blue-600 hover:underline">
                            {deal}
                          </Link>
                        )}
                        {task.dueDate && <span>{formatDate(task.dueDate)}</span>}
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
    </div>
  );
}
