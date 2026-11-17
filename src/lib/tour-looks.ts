import "server-only";
import { prisma } from "@/lib/db";
import { addDays, dayStart } from "@/lib/tour-stats";

/*
 * "Hvor folk kigger": the tour sends, per scan point a visitor stood at, how
 * many seconds they looked in each of 12 slices of 30° around it
 * ("room_look": label "<ss>:<12 seconds>", the room's name in url). Summed up
 * here per scan point - the most looked-at places first, each with its slices
 * and the direction most looked at.
 */

export type LookSpot = {
  ss: number;
  room: string | null;
  /** Seconds in all, and how many visits stood there. */
  seconds: number;
  visits: number;
  /** Seconds per 30° slice (slice i = i*30°..(i+1)*30° of the camera's yaw). */
  slices: number[];
  /** The slices most looked at, best first (with their share of the time there). */
  top: { yaw: number; share: number }[];
  /** The room's picture (the story cards' one), when it has one. */
  image: string | null;
};

/** `range`: the last N days, or a period ("YYYY-MM-DD", both days included - Danish time). */
export async function tourLooks(slug: string, range: number | { from: string; to: string } = 60): Promise<LookSpot[]> {
  const createdAt = typeof range === "number" ? { gte: new Date(Date.now() - range * 86_400_000) } : { gte: dayStart(range.from), lt: dayStart(addDays(range.to, 1)) };
  const rows = await prisma.tourEvent.findMany({
    where: { tourSlug: slug, name: "room_look", createdAt },
    select: { label: true, url: true, session: true },
    take: 50_000,
  });
  const by = new Map<number, { room: string | null; slices: number[]; sessions: Set<string> }>();
  for (const r of rows) {
    const m = /^(\d{1,4}):((?:\d{1,4},){11}\d{1,4})$/.exec(r.label ?? "");
    if (!m) continue;
    const ss = Number(m[1]);
    const spot = by.get(ss) ?? { room: null, slices: new Array<number>(12).fill(0), sessions: new Set<string>() };
    m[2].split(",").forEach((n, i) => (spot.slices[i] += Number(n)));
    spot.room ??= r.url;
    spot.sessions.add(r.session);
    by.set(ss, spot);
  }
  const rooms = [...new Set([...by.values()].map((s) => s.room).filter((r): r is string => Boolean(r)))];
  const pictures = rooms.length ? await prisma.tourStoryImage.findMany({ where: { tourSlug: slug, room: { in: rooms } }, select: { room: true, updatedAt: true } }) : [];
  const picture = new Map(pictures.map((p) => [p.room, `/t/${slug}/historie?rum=${encodeURIComponent(p.room)}&v=${p.updatedAt.getTime()}`]));
  return [...by.entries()]
    .map(([ss, s]) => {
      const seconds = s.slices.reduce((a, b) => a + b, 0);
      const top = s.slices
        .map((n, i) => ({ i, n }))
        .filter((x) => x.n > 0)
        .sort((a, b) => b.n - a.n)
        .slice(0, 3)
        // The middle of the slice, as the camera's yaw (-180..180).
        .map((x) => ({ yaw: ((x.i * 30 + 15 + 180) % 360) - 180, share: x.n / seconds }));
      return { ss, room: s.room, seconds, visits: s.sessions.size, slices: s.slices, top, image: s.room ? picture.get(s.room) ?? null : null };
    })
    .filter((s) => s.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds);
}
