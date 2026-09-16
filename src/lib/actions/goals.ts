"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { startOfMonth } from "date-fns";
import type { GoalMetric } from "@prisma/client";

export async function upsertGoal(targetUserId: string | null, metric: GoalMetric, targetValueRaw: string) {
  const user = await requireUser();

  const targetValue = Math.round(parseFloat(targetValueRaw));
  if (!targetValueRaw || Number.isNaN(targetValue) || targetValue < 0) {
    throw new Error("Angiv en gyldig målværdi.");
  }

  const isOwnGoal = targetUserId === user.id;
  if (!isOwnGoal && user.role !== "ADMIN") {
    throw new Error("Kun admin kan sætte mål for andre eller for hele virksomheden.");
  }

  const month = startOfMonth(new Date());

  const existing = await prisma.goal.findFirst({ where: { userId: targetUserId, month, metric } });
  if (existing) {
    await prisma.goal.update({ where: { id: existing.id }, data: { targetValue } });
  } else {
    await prisma.goal.create({
      data: { userId: targetUserId, month, metric, targetValue, createdById: user.id },
    });
  }

  revalidatePath("/");
}

export async function deleteGoal(goalId: string) {
  const user = await requireUser();
  const goal = await prisma.goal.findUniqueOrThrow({ where: { id: goalId } });
  if (goal.userId !== user.id && user.role !== "ADMIN") {
    throw new Error("Du kan kun slette dit eget mål.");
  }
  await prisma.goal.delete({ where: { id: goalId } });
  revalidatePath("/");
}
