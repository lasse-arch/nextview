"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { goalPeriodStart } from "@/lib/goals-data";
import type { GoalMetric, GoalPeriod } from "@prisma/client";

export async function upsertGoal(targetUserId: string | null, metric: GoalMetric, targetValueRaw: string, period: GoalPeriod) {
  const user = await requireUser();

  const targetValue = Math.round(parseFloat(targetValueRaw));
  if (!targetValueRaw || Number.isNaN(targetValue) || targetValue < 0) {
    throw new Error("Angiv en gyldig målværdi.");
  }

  const isOwnGoal = targetUserId === user.id;
  if (!isOwnGoal && user.role !== "ADMIN") {
    throw new Error("Kun admin kan sætte mål for andre eller for hele virksomheden.");
  }

  // Recomputed fresh on every save (not just the first time) - re-saving a
  // goal always resets it to the current period rather than leaving a stale
  // one running, and is what lets this double as the upsert key below.
  const month = goalPeriodStart(period);

  const existing = await prisma.goal.findFirst({ where: { userId: targetUserId, metric, period } });
  if (existing) {
    await prisma.goal.update({ where: { id: existing.id }, data: { targetValue, month } });
  } else {
    const last = await prisma.goal.aggregate({ _max: { sortOrder: true } });
    await prisma.goal.create({
      data: {
        userId: targetUserId,
        month,
        period,
        metric,
        targetValue,
        createdById: user.id,
        sortOrder: (last._max.sortOrder ?? 0) + 1,
      },
    });
  }

  revalidatePath("/");
}

/**
 * Saves the "Mål" card's order from its ↑/↓ arrows - `goalIds` is the full
 * list as currently shown, top to bottom. Admin-only, since the order is
 * shared by everyone who sees the card.
 */
export async function reorderGoals(goalIds: string[]) {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Kun admin kan ændre rækkefølgen.");
  await prisma.$transaction(
    goalIds.map((id, index) => prisma.goal.update({ where: { id }, data: { sortOrder: index + 1 } }))
  );
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
