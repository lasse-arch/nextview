"use server";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { visibleTo } from "@/lib/team-notifications";

export type BellItem = { id: string; kind: string; title: string; text: string; href: string; count: number; at: string; unread: boolean };

/** The latest notifications for the bell - and from now on they're seen. */
export async function openBell(): Promise<BellItem[]> {
  const user = await requireUser();
  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { notificationsSeenAt: true } });
  const rows = await prisma.teamNotification.findMany({ where: visibleTo(user.role), orderBy: { updatedAt: "desc" }, take: 30 });
  await prisma.user.update({ where: { id: user.id }, data: { notificationsSeenAt: new Date() } });
  const seen = me?.notificationsSeenAt?.getTime() ?? 0;
  return rows.map((r) => ({ id: r.id, kind: r.kind, title: r.title, text: r.text, href: r.href.startsWith("/arpo") ? r.href : "/arpo", count: r.count, at: r.updatedAt.toISOString(), unread: r.updatedAt.getTime() > seen }));
}
