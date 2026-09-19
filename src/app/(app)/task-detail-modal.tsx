"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { updateTask, deleteTask, addTaskComment, getTaskComments, type TaskCommentView } from "@/lib/actions/tasks";
import { formatDateTime } from "@/lib/labels";
import { useToast } from "@/components/toast";

export type ModalTask = {
  id: string;
  title: string;
  description: string | null;
  done: boolean;
  dueDate: Date | null;
  assigneeId: string | null;
  dealId: string | null;
};

function toDateInputValue(date: Date | null): string {
  if (!date) return "";
  return new Date(date).toISOString().slice(0, 10);
}

function authorInitials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function TaskDetailModal({
  task,
  users,
  deals,
  onClose,
  onUpdated,
  onDeleted,
}: {
  task: ModalTask;
  users: { id: string; name: string }[];
  deals: { id: string; name: string }[];
  onClose: () => void;
  onUpdated: (task: ModalTask) => void;
  onDeleted: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [comments, setComments] = useState<TaskCommentView[] | null>(null);
  const [commentText, setCommentText] = useState("");
  const showToast = useToast();

  useEffect(() => {
    let cancelled = false;
    getTaskComments(task.id).then((result) => {
      if (!cancelled) setComments(result);
    });
    return () => {
      cancelled = true;
    };
  }, [task.id]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateTask(task.id, formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const dueDateRaw = String(formData.get("dueDate") || "");
      onUpdated({
        id: task.id,
        title: String(formData.get("title") || "").trim(),
        description: String(formData.get("description") || "").trim() || null,
        done: task.done,
        dueDate: dueDateRaw ? new Date(dueDateRaw) : null,
        assigneeId: String(formData.get("assigneeId") || "") || null,
        dealId: String(formData.get("dealId") || "") || null,
      });
      showToast("Opgave gemt");
    });
  }

  function handleDelete() {
    if (!confirm("Slet denne opgave? Det kan ikke fortrydes.")) return;
    startTransition(async () => {
      await deleteTask(task.id);
      showToast("Opgave slettet");
      onDeleted();
    });
  }

  function handleCommentSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const body = commentText.trim();
    if (!body) return;
    setCommentText("");

    const formData = new FormData();
    formData.set("body", body);

    startTransition(async () => {
      const result = await addTaskComment(task.id, formData);
      if (result.ok) {
        setComments((prev) => [...(prev ?? []), result.comment]);
      } else {
        showToast(result.error);
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl bg-white shadow-xl">
        <form onSubmit={handleSubmit} className="space-y-3 overflow-y-auto p-6">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Titel *</label>
            <input
              name="title"
              defaultValue={task.title}
              required
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Tildel til</label>
              <select
                name="assigneeId"
                defaultValue={task.assigneeId ?? ""}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
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
                defaultValue={toDateInputValue(task.dueDate)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Koblet til deal</label>
            <select
              name="dealId"
              defaultValue={task.dealId ?? ""}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Ingen deal</option>
              {deals.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            {task.dealId && (
              <Link href={`/deals/${task.dealId}`} className="mt-1 inline-block text-xs text-blue-600 hover:underline">
                Åbn dealen
              </Link>
            )}
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Beskrivelse</label>
            <textarea
              name="description"
              defaultValue={task.description ?? ""}
              rows={3}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={handleDelete}
              className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
            >
              Slet opgave
            </button>
            <div className="flex items-center gap-2">
              <button type="button" onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
                Luk
              </button>
              <button
                type="submit"
                disabled={pending}
                className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {pending ? "Gemmer…" : "Gem ændringer"}
              </button>
            </div>
          </div>
        </form>

        <div className="border-t border-slate-100 bg-slate-50 p-6">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Kommentarer</h3>
          <form onSubmit={handleCommentSubmit} className="mt-2 flex items-start gap-2">
            <input
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Skriv en kommentar…"
              className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="rounded-md bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800"
            >
              Send
            </button>
          </form>

          <ul className="mt-4 max-h-56 space-y-3 overflow-y-auto">
            {comments === null && <p className="text-sm text-slate-400">Indlæser…</p>}
            {comments?.map((c) => (
              <li key={c.id} className="flex items-start gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-300 text-[10px] font-semibold text-white">
                  {authorInitials(c.authorName)}
                </span>
                <div className="min-w-0 flex-1 rounded-md bg-white p-2.5 text-sm shadow-sm">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="font-medium text-slate-700">{c.authorName}</span>
                    <span>{formatDateTime(c.createdAt)}</span>
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap text-slate-700">{c.body}</p>
                </div>
              </li>
            ))}
            {comments?.length === 0 && <p className="text-sm text-slate-400">Ingen kommentarer endnu.</p>}
          </ul>
        </div>
      </div>
    </div>
  );
}
