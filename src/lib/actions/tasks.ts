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

export async function toggleTaskDone(taskId: string): Promise<void> {
  await requireUser();
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  await prisma.task.update({ where: { id: taskId }, data: { done: !task.done } });
  revalidateTaskPaths(task.dealId);
}

export async function updateTaskAssignee(taskId: string, assigneeId: string | null): Promise<void> {
  await requireUser();
  const task = await prisma.task.update({ where: { id: taskId }, data: { assigneeId } });
  revalidateTaskPaths(task.dealId);
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

export type TaskCommentView = { id: string; body: string; authorName: string; createdAt: Date };

export async function getTaskComments(taskId: string): Promise<TaskCommentView[]> {
  await requireUser();
  const comments = await prisma.taskComment.findMany({
    where: { taskId },
    include: { author: true },
    orderBy: { createdAt: "asc" },
  });
  return comments.map((c) => ({ id: c.id, body: c.body, authorName: c.author.name, createdAt: c.createdAt }));
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

  return { ok: true, comment: { id: comment.id, body: comment.body, authorName: user.name, createdAt: comment.createdAt } };
}
