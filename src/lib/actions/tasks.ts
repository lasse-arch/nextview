"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { parseDueDateFromText } from "@/lib/task-date-parser";

export type TaskResult = { ok: true; id: string } | { ok: false; error: string };

function revalidateTaskPaths(dealId: string | null) {
  revalidatePath("/opgaver");
  if (dealId) revalidatePath(`/deals/${dealId}`);
}

function parseRecurringWeekday(formData: FormData): number | null {
  const raw = String(formData.get("recurringWeekday") || "").trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 6 ? n : null;
}

/** Next date strictly after `from` that falls on `targetWeekday` (0=søndag..6=lørdag) -
 * always at least a week out if `from` itself is already that weekday, since this is
 * for advancing a just-completed recurring task to its next occurrence, not today's. */
function nextWeekdayAfter(from: Date, targetWeekday: number): Date {
  const base = new Date(from);
  base.setHours(0, 0, 0, 0);
  let diff = (targetWeekday - base.getDay() + 7) % 7;
  if (diff === 0) diff = 7;
  base.setDate(base.getDate() + diff);
  return base;
}

/**
 * "Opret opgave"-knap på en note - lidt hurtigere end at åbne opgave-
 * formularen og selv skrive titlen ud igen, når det man vil huske allerede
 * står i noten. Tildeles den der klikker knappen (samme som når man selv
 * opretter en opgave manuelt), ikke nødvendigvis den der skrev noten.
 * Forfaldsdato gættes ud fra en dato/ugenummer/ferienavn i notetekstens eget
 * indhold, hvis der står en - se task-date-parser.ts.
 */
export async function createTaskFromNote(noteId: string): Promise<TaskResult> {
  const user = await requireUser();

  const note = await prisma.note.findUniqueOrThrow({ where: { id: noteId } });

  const oneLine = note.body.replace(/\s+/g, " ").trim();
  const title = oneLine.length > 60 ? `${oneLine.slice(0, 60)}…` : oneLine || "Opgave fra note";
  const dueDate = parseDueDateFromText(note.body);

  const task = await prisma.task.create({
    data: { title, description: note.body, dealId: note.dealId, assigneeId: user.id, createdById: user.id, dueDate },
  });

  revalidateTaskPaths(note.dealId);
  return { ok: true, id: task.id };
}

export async function createTask(formData: FormData): Promise<TaskResult> {
  const user = await requireUser();

  const title = String(formData.get("title") || "").trim();
  if (!title) return { ok: false, error: "Angiv en titel." };

  const assigneeId = String(formData.get("assigneeId") || "").trim() || null;
  const dealId = String(formData.get("dealId") || "").trim() || null;
  const description = String(formData.get("description") || "").trim() || null;
  const dueDateRaw = String(formData.get("dueDate") || "").trim();
  const dueDate = dueDateRaw ? new Date(dueDateRaw) : null;
  const recurringWeekday = parseRecurringWeekday(formData);

  const task = await prisma.task.create({
    data: { title, description, assigneeId, dealId, dueDate, recurringWeekday, createdById: user.id },
  });

  revalidateTaskPaths(dealId);
  return { ok: true, id: task.id };
}

/**
 * Toggles a task's done state. When completing an "Aflever X" delivery task
 * with a deliveryUrl given (prompted client-side for Hjemmeside/tour
 * products - see needsDeliveryLink), saves that link onto the matching
 * DealItem so it shows up under Live kunder.
 *
 * A recurring task (recurringWeekday set) never actually ends up checked off -
 * completing it advances dueDate to its next weekly occurrence and leaves
 * done false instead, so it stays on the board rather than disappearing.
 */
export async function toggleTaskDone(taskId: string, deliveryUrl?: string | null): Promise<void> {
  const user = await requireUser();
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  const completing = !task.done;

  if (completing && task.recurringWeekday !== null) {
    const reference = task.dueDate && task.dueDate > new Date() ? task.dueDate : new Date();
    const nextDueDate = nextWeekdayAfter(reference, task.recurringWeekday);
    await prisma.task.update({ where: { id: taskId }, data: { done: false, dueDate: nextDueDate } });
  } else {
    await prisma.task.update({ where: { id: taskId }, data: { done: completing } });
  }

  if (completing && deliveryUrl && task.dealId && task.title.startsWith("Aflever ")) {
    const productType = task.title.slice("Aflever ".length);
    const item = await prisma.dealItem.findFirst({ where: { dealId: task.dealId, productType } });
    if (item) await prisma.dealItem.update({ where: { id: item.id }, data: { url: deliveryUrl } });
  }

  if (completing) {
    await logActivity({
      type: "TASK_DONE",
      message: `${user.name} fuldførte opgaven "${task.title}"`,
      actorId: user.id,
      dealId: task.dealId,
    });
  }

  revalidateTaskPaths(task.dealId);
}

export async function updateTaskAssignee(taskId: string, assigneeId: string | null): Promise<void> {
  await requireUser();
  const task = await prisma.task.update({ where: { id: taskId }, data: { assigneeId } });
  revalidateTaskPaths(task.dealId);
}

/** Reassigns several tasks at once - e.g. all the "Aflever X" tasks that just landed on a deal after signing. */
export async function bulkReassignTasks(taskIds: string[], assigneeId: string | null): Promise<void> {
  await requireUser();
  if (taskIds.length === 0) return;
  const tasks = await prisma.task.findMany({ where: { id: { in: taskIds } }, select: { dealId: true } });
  await prisma.task.updateMany({ where: { id: { in: taskIds } }, data: { assigneeId } });
  const dealIds = new Set(tasks.map((t) => t.dealId).filter((id): id is string => Boolean(id)));
  revalidatePath("/opgaver");
  for (const dealId of dealIds) revalidatePath(`/deals/${dealId}`);
}

export async function deleteTask(taskId: string): Promise<void> {
  await requireUser();
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  await prisma.task.delete({ where: { id: taskId } });
  revalidateTaskPaths(task.dealId);
}

export async function updateTask(taskId: string, formData: FormData): Promise<TaskResult> {
  await requireUser();

  const title = String(formData.get("title") || "").trim();
  if (!title) return { ok: false, error: "Angiv en titel." };

  const assigneeId = String(formData.get("assigneeId") || "").trim() || null;
  const dealId = String(formData.get("dealId") || "").trim() || null;
  const description = String(formData.get("description") || "").trim() || null;
  const dueDateRaw = String(formData.get("dueDate") || "").trim();
  const dueDate = dueDateRaw ? new Date(dueDateRaw) : null;
  const recurringWeekday = parseRecurringWeekday(formData);

  const existing = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  await prisma.task.update({
    where: { id: taskId },
    data: { title, description, assigneeId, dealId, dueDate, recurringWeekday },
  });

  revalidateTaskPaths(existing.dealId);
  if (dealId !== existing.dealId) revalidateTaskPaths(dealId);
  return { ok: true, id: taskId };
}

export type TaskCommentView = {
  id: string;
  body: string;
  authorName: string;
  authorAvatarUrl: string | null;
  createdAt: Date;
};

export async function getTaskComments(taskId: string): Promise<TaskCommentView[]> {
  await requireUser();
  const comments = await prisma.taskComment.findMany({
    where: { taskId },
    include: { author: true },
    orderBy: { createdAt: "asc" },
  });
  return comments.map((c) => ({
    id: c.id,
    body: c.body,
    authorName: c.author.name,
    authorAvatarUrl: c.author.avatarUrl,
    createdAt: c.createdAt,
  }));
}

export async function addTaskComment(
  taskId: string,
  formData: FormData
): Promise<{ ok: true; comment: TaskCommentView } | { ok: false; error: string }> {
  const user = await requireUser();
  const body = String(formData.get("body") || "").trim();
  if (!body) return { ok: false, error: "Skriv en kommentar." };

  const comment = await prisma.taskComment.create({ data: { taskId, authorId: user.id, body } });
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  revalidateTaskPaths(task.dealId);

  return {
    ok: true,
    comment: {
      id: comment.id,
      body: comment.body,
      authorName: user.name,
      authorAvatarUrl: user.avatarUrl,
      createdAt: comment.createdAt,
    },
  };
}
