"use client";

import { useState, useTransition } from "react";
import { createTask, toggleTaskDone, bulkReassignTasks } from "@/lib/actions/tasks";
import { formatDate } from "@/lib/labels";
import { useToast } from "@/components/toast";
import { TaskDetailModal, type ModalTask } from "../../task-detail-modal";

type DealTask = {
  id: string;
  title: string;
  description: string | null;
  done: boolean;
  dueDate: Date | null;
  assigneeId: string | null;
};

export function DealTasksSection({
  dealId,
  initialTasks,
  users,
  deals,
}: {
  dealId: string;
  initialTasks: DealTask[];
  users: { id: string; name: string }[];
  deals: { id: string; name: string }[];
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [adding, setAdding] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [bulkAssigneeId, setBulkAssigneeId] = useState("");
  const [pending, startTransition] = useTransition();
  const showToast = useToast();

  const selectedTask = tasks.find((t) => t.id === selectedTaskId) ?? null;
  const visibleTasks = showDone ? tasks : tasks.filter((t) => !t.done);
  const allVisibleChecked = visibleTasks.length > 0 && visibleTasks.every((t) => checkedIds.has(t.id));

  function handleToggle(taskId: string) {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, done: !t.done } : t)));
    startTransition(() => toggleTaskDone(taskId));
  }

  function toggleChecked(taskId: string) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  function toggleAllChecked() {
    setCheckedIds(allVisibleChecked ? new Set() : new Set(visibleTasks.map((t) => t.id)));
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

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    formData.set("dealId", dealId);
    const title = String(formData.get("title") || "").trim();
    const assigneeId = String(formData.get("assigneeId") || "") || null;
    if (!title) return;

    setAdding(false);
    startTransition(async () => {
      const result = await createTask(formData);
      if (result.ok) {
        setTasks((prev) => [...prev, { id: result.id, title, description: null, done: false, dueDate: null, assigneeId }]);
        showToast("Opgave oprettet");
      } else {
        showToast(result.error);
      }
    });
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Opgaver</h2>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
            <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
            Vis fuldførte
          </label>
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            {adding ? "Annullér" : "+ Tilføj"}
          </button>
        </div>
      </div>

      {adding && (
        <form onSubmit={handleSubmit} className="mt-4 flex flex-wrap items-end gap-2 rounded-md border border-slate-200 p-3">
          <div className="min-w-[10rem] flex-1">
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Titel</label>
            <input
              name="title"
              required
              autoFocus
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Tildel til</label>
            <select name="assigneeId" defaultValue="" className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm">
              <option value="">Fælles</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            Tilføj
          </button>
        </form>
      )}

      {visibleTasks.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            <input type="checkbox" checked={allVisibleChecked} onChange={toggleAllChecked} />
            Vælg alle
          </label>
          {checkedIds.size > 0 && (
            <>
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
            </>
          )}
        </div>
      )}

      <ul className="mt-2 space-y-1.5">
        {visibleTasks.map((task) => {
          const assignee = users.find((u) => u.id === task.assigneeId);
          return (
            <li
              key={task.id}
              onClick={() => setSelectedTaskId(task.id)}
              className="group flex cursor-pointer items-center gap-2 rounded-md border border-slate-100 px-3 py-2 text-sm hover:bg-slate-50"
            >
              <input
                type="checkbox"
                checked={checkedIds.has(task.id)}
                onClick={(e) => e.stopPropagation()}
                onChange={() => toggleChecked(task.id)}
                title="Vælg til bulk-handling"
                className={checkedIds.has(task.id) || checkedIds.size > 0 ? "opacity-100" : "opacity-0 group-hover:opacity-100"}
              />
              <input
                type="checkbox"
                checked={task.done}
                onClick={(e) => e.stopPropagation()}
                onChange={() => handleToggle(task.id)}
                title="Marker som fuldført"
              />
              <span className={`min-w-0 flex-1 truncate ${task.done ? "text-slate-400 line-through" : "text-slate-800"}`}>
                {task.title}
              </span>
              {assignee ? (
                <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">{assignee.name}</span>
              ) : (
                <span className="shrink-0 text-xs text-amber-600">Ingen ejer</span>
              )}
              {task.dueDate && <span className="shrink-0 text-xs text-slate-400">{formatDate(task.dueDate)}</span>}
            </li>
          );
        })}
        {visibleTasks.length === 0 && <p className="text-sm text-slate-400">Ingen opgaver endnu.</p>}
      </ul>

      {selectedTask && (
        <TaskDetailModal
          task={{ ...selectedTask, dealId }}
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
    </section>
  );
}
