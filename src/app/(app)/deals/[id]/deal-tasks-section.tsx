"use client";

import { useState, useTransition } from "react";
import { createTask, toggleTaskDone, deleteTask } from "@/lib/actions/tasks";
import { formatDate } from "@/lib/labels";
import { useToast } from "@/components/toast";

type DealTask = {
  id: string;
  title: string;
  done: boolean;
  dueDate: Date | null;
  assigneeId: string | null;
};

export function DealTasksSection({
  dealId,
  initialTasks,
  users,
}: {
  dealId: string;
  initialTasks: DealTask[];
  users: { id: string; name: string }[];
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [adding, setAdding] = useState(false);
  const [pending, startTransition] = useTransition();
  const showToast = useToast();

  function handleToggle(taskId: string) {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, done: !t.done } : t)));
    startTransition(() => toggleTaskDone(taskId));
  }

  function handleDelete(taskId: string) {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    startTransition(() => deleteTask(taskId));
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
        setTasks((prev) => [...prev, { id: result.id, title, done: false, dueDate: null, assigneeId }]);
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
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          {adding ? "Annullér" : "+ Tilføj"}
        </button>
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

      <ul className="mt-4 space-y-1.5">
        {tasks.map((task) => {
          const assignee = users.find((u) => u.id === task.assigneeId);
          return (
            <li key={task.id} className="group flex items-center gap-2 rounded-md border border-slate-100 px-3 py-2 text-sm">
              <input type="checkbox" checked={task.done} onChange={() => handleToggle(task.id)} />
              <span className={`min-w-0 flex-1 truncate ${task.done ? "text-slate-400 line-through" : "text-slate-800"}`}>
                {task.title}
              </span>
              {assignee && <span className="shrink-0 text-xs text-slate-400">{assignee.name}</span>}
              {task.dueDate && <span className="shrink-0 text-xs text-slate-400">{formatDate(task.dueDate)}</span>}
              <button
                type="button"
                onClick={() => handleDelete(task.id)}
                className="shrink-0 text-slate-300 opacity-0 hover:text-red-600 group-hover:opacity-100"
                aria-label="Slet opgave"
              >
                ×
              </button>
            </li>
          );
        })}
        {tasks.length === 0 && <p className="text-sm text-slate-400">Ingen opgaver endnu.</p>}
      </ul>
    </section>
  );
}
