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
