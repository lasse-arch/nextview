import "server-only";
import { prisma } from "@/lib/db";

/*
 * The bell by Nyheder: things the team should know about (a customer's
 * feedback on a tour in review, an approval). Several of the same kind on the
 * same tour within a few hours are one notification that counts up and moves
 * to the top - not one per note. Never fails what it's called from.
 */

const MERGE_MS = 3 * 60 * 60 * 1000;

export async function ringBell(n: { kind: "feedback" | "approved" | "demo" | "mail"; title: string; text: string; href: string; tourSlug?: string; audience?: "admin" | "all" | `user:${string}` }) {
  try {
    const text = n.text.replace(/\s+/g, " ").trim().slice(0, 240);
    const same = n.tourSlug
      ? await prisma.teamNotification.findFirst({ where: { kind: n.kind, tourSlug: n.tourSlug, updatedAt: { gt: new Date(Date.now() - MERGE_MS) } }, orderBy: { updatedAt: "desc" } })
      : null;
    if (same) await prisma.teamNotification.update({ where: { id: same.id }, data: { count: { increment: 1 }, text, title: n.title } });
    else await prisma.teamNotification.create({ data: { kind: n.kind, title: n.title.slice(0, 160), text, href: n.href, tourSlug: n.tourSlug, audience: n.audience ?? "admin" } });
  } catch (err) {
    console.error("[ringBell]", err);
  }
}

/** Notifications this user may see: admins those for admins and everyone, others those for everyone - and each their own ("user:<id>"). */
export const visibleTo = (user: { id: string; role: string }) => ({ audience: { in: [...(user.role === "ADMIN" ? ["admin"] : []), "all", `user:${user.id}`] } });

/** How many changed since the user last opened the bell. */
export async function unreadNotifications(user: { id: string; role: string; notificationsSeenAt: Date | null }): Promise<number> {
  return prisma.teamNotification.count({ where: { ...visibleTo(user), ...(user.notificationsSeenAt ? { updatedAt: { gt: user.notificationsSeenAt } } : {}) } });
}
