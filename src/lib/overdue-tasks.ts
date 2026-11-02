import "server-only";
import { prisma } from "@/lib/db";
import { dealName } from "@/lib/labels";

/*
 * A person's overdue tasks: theirs (given to them, or made by them and given
 * to nobody), not done, with a date before today. Dates are compared as days
 * in Denmark, so a task due today is never overdue - whether its date was
 * stored as midnight UTC or as midnight Danish time.
 */

export type OverdueTask = { id: string; title: string; due: string; days: number; deal: string | null; dealId: string | null };

const dkDay = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" });

export async function overdueTasksFor(userId: string, now = new Date()): Promise<OverdueTask[]> {
  const today = dkDay(now);
  const rows = await prisma.task.findMany({
    where: { done: false, dueDate: { lt: now }, OR: [{ assigneeId: userId }, { assigneeId: null, createdById: userId }] },
    orderBy: { dueDate: "asc" },
    take: 50,
    select: { id: true, title: true, dueDate: true, dealId: true, deal: { select: { companyName: true, displayName: true } } },
  });
  return rows
    .filter((t) => t.dueDate && dkDay(t.dueDate) < today)
    .map((t) => {
      const due = dkDay(t.dueDate!);
      return {
        id: t.id,
        title: t.title,
        due,
        days: Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${due}T00:00:00Z`)) / 86_400_000),
        deal: t.deal ? dealName(t.deal) : null,
        dealId: t.dealId,
      };
    });
}
