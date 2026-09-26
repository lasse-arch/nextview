import { prisma } from "@/lib/db";

/**
 * Records one entry for the dashboard's "Seneste aktivitet" newsboard.
 * `message` should be the full, already-rendered Danish sentence (e.g.
 * "Gustav sendte en kontrakt til Grøn Have A/S") - kept as plain text rather
 * than reconstructed from actor/deal at render time, so the feed still reads
 * correctly after a deal or user is later renamed or removed.
 *
 * Best-effort: a logging failure must never break the actual action it's
 * describing (same pattern as the Google Drive archiving calls elsewhere),
 * so errors are swallowed here rather than thrown.
 */
export async function logActivity(params: {
  type: string;
  message: string;
  actorId?: string | null;
  dealId?: string | null;
}): Promise<void> {
  try {
    await prisma.activityEvent.create({
      data: {
        type: params.type,
        message: params.message,
        actorId: params.actorId ?? null,
        dealId: params.dealId ?? null,
      },
    });
  } catch (err) {
    console.error("Kunne ikke logge aktivitet", err);
  }
}

export type ActivityFeedItem = {
  id: string;
  type: string;
  message: string;
  actorName: string | null;
  actorAvatarUrl: string | null;
  dealId: string | null;
  createdAt: Date;
};

export async function getRecentActivity(limit = 25): Promise<ActivityFeedItem[]> {
  const events = await prisma.activityEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { actor: { select: { name: true, lastName: true, avatarUrl: true } } },
  });

  return events.map((e) => ({
    id: e.id,
    type: e.type,
    message: e.message,
    actorName: e.actor ? [e.actor.name, e.actor.lastName].filter(Boolean).join(" ") : null,
    actorAvatarUrl: e.actor?.avatarUrl ?? null,
    dealId: e.dealId,
    createdAt: e.createdAt,
  }));
}

export type UserLastLogin = {
  id: string;
  name: string;
  avatarUrl: string | null;
  lastLoginAt: Date | null;
};

export async function getUserLastLogins(): Promise<UserLastLogin[]> {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, lastName: true, avatarUrl: true, lastLoginAt: true },
    orderBy: { name: "asc" },
  });

  return users
    .map((u) => ({
      id: u.id,
      name: [u.name, u.lastName].filter(Boolean).join(" "),
      avatarUrl: u.avatarUrl,
      lastLoginAt: u.lastLoginAt,
    }))
    .sort((a, b) => (b.lastLoginAt?.getTime() ?? 0) - (a.lastLoginAt?.getTime() ?? 0));
}
