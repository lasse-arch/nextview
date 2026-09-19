"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export type TaskResult = { ok: true; id: string } | { ok: false; error: string };

function revalidateTaskPaths(dealId: string | null) {
  revalidatePath("/opgaver");
  if (dealId) revalidatePath(`/deals/${dealId}`);
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

  const task = await prisma.task.create({
    data: { title, description, assigneeId, dealId, dueDate, createdById: user.id },
  });

  revalidateTaskPaths(dealId);
  return { ok: true, id: task.id };
}

/**
 * Toggles a task's done state. When completing an "Aflever X" delivery task
 * with a deliveryUrl given (prompted client-side for Hjemmeside/tour
 * products - see needsDeliveryLink), saves that link onto the matching
 * DealItem so it shows up under Live kunder.
 */
export async function toggleTaskDone(taskId: string, deliveryUrl?: string | null): Promise<void> {
  await requireUser();
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  const done = !task.done;
  await prisma.task.update({ where: { id: taskId }, data: { done } });

  if (done && deliveryUrl && task.dealId && task.title.startsWith("Aflever ")) {
    const productType = task.title.slice("Aflever ".length);
    const item = await prisma.dealItem.findFirst({ where: { dealId: task.dealId, productType } });
    if (item) await prisma.dealItem.update({ where: { id: item.id }, data: { url: deliveryUrl } });
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

  const existing = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  await prisma.task.update({
    where: { id: taskId },
    data: { title, description, assigneeId, dealId, dueDate },
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
