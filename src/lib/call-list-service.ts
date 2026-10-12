import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

// Server-side helpers for call lists, kept out of the "use server" actions
// file so they are not callable as public server actions.
/**
 * Finds today's auto-generated Ringeliste (same name convention as
 * `createCallList()`'s own default, "Ringeliste <ugedag> <dato>") or creates
 * it if this is the first automatic lead-filter run today - used by a
 * LeadFilter with `autoCreateDailyList` set, so repeated runs on the same
 * day (a manual "Kør nu" plus the nightly cron, say) land in one shared
 * list instead of a fresh one each time.
 */
export function defaultListName(): string {
  const formatted = new Intl.DateTimeFormat("da-DK", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
  return `Ringeliste ${formatted}`;
}

export async function findOrCreateTodayCallList(createdById: string): Promise<{ id: string; name: string }> {
  const name = defaultListName();
  const existing = await prisma.callList.findFirst({ where: { name, createdById } });
  if (existing) return existing;
  const list = await prisma.callList.create({ data: { name, createdById } });
  revalidatePath("/ringeliste");
  return list;
}

