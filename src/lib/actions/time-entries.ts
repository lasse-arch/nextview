"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import type { TimeEntryCategory } from "@prisma/client";

const QUARTER_HOUR_MINUTES = 15;
const VALID_CATEGORIES: TimeEntryCategory[] = ["FILMING", "TOUR_EDITING", "REFILMING", "CORRECTIONS", "WEBSITE"];

/** Every manual entry rounds UP to the next quarter-hour (15/30/45/60/...) -
 * never down, so a slightly-over day (e.g. "7,1 timer") never under-counts. */
function roundUpToQuarterHour(minutes: number): number {
  return Math.ceil(minutes / QUARTER_HOUR_MINUTES) * QUARTER_HOUR_MINUTES;
}

/**
 * Logs one or more people's hours on a deal for a given day - e.g. Lasse and
 * Victor both filming the same customer get one row each (7t + 7t = 14
 * man-hours total), not a single doubled number. `hours` is a decimal
 * (comma or dot) typed by the user, rounded up to the next 15 minutes before
 * being stored.
 */
export async function addManualTimeEntry(
  dealId: string,
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const currentUser = await requireUser();

  const dateRaw = String(formData.get("date") || "");
  const hoursRaw = String(formData.get("hours") || "").replace(",", ".");
  const userIds = formData.getAll("userIds").map(String).filter(Boolean);
  const categoryRaw = String(formData.get("category") || "");

  const date = dateRaw ? new Date(dateRaw) : null;
  const hours = parseFloat(hoursRaw);
  const category = VALID_CATEGORIES.includes(categoryRaw as TimeEntryCategory) ? (categoryRaw as TimeEntryCategory) : null;

  if (!date || Number.isNaN(date.getTime())) return { ok: false, error: "Vælg en dato." };
  if (!hoursRaw || Number.isNaN(hours) || hours <= 0) return { ok: false, error: "Angiv antal timer." };
  if (userIds.length === 0) return { ok: false, error: "Vælg mindst én person." };
  if (!category) return { ok: false, error: "Vælg hvad tiden er brugt på." };

  const minutes = roundUpToQuarterHour(hours * 60);

  await prisma.timeEntry.createMany({
    data: userIds.map((userId) => ({
      dealId,
      userId,
      date,
      minutes,
      source: "MANUAL",
      category,
      createdById: currentUser.id,
    })),
  });

  revalidatePath(`/arpo/deals/${dealId}`);
  return { ok: true };
}

/** Only the person who logged the entry, or an admin, can delete it again -
 * same rule as notes (deleteNote), since one person can log hours on
 * another's behalf (see TimeEntry.createdBy). */
export async function deleteTimeEntry(entryId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const currentUser = await requireUser();
  const entry = await prisma.timeEntry.findUniqueOrThrow({ where: { id: entryId } });
  if (currentUser.role !== "ADMIN" && entry.createdById !== currentUser.id) {
    return { ok: false, error: "Du kan kun slette tidsregistreringer du selv har tilføjet." };
  }

  await prisma.timeEntry.delete({ where: { id: entryId } });
  revalidatePath(`/arpo/deals/${entry.dealId}`);
  return { ok: true };
}


/**
 * For "Udfyld filmtiden" in the tour editor: the team to pick who filmed, and
 * who was booked to film and when (the filming booking) as the starting point.
 */
export async function filmingTimeForm(dealId: string): Promise<{ users: { id: string; name: string }[]; crewIds: string[]; date: string | null; hours: number | null }> {
  await requireUser();
  const [users, deal] = await Promise.all([
    prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, email: true } }),
    prisma.deal.findUnique({ where: { id: dealId }, select: { filmingCrewIds: true, filmingAt: true, filmingDurationMinutes: true } }),
  ]);
  return {
    users: users.map((u) => ({ id: u.id, name: u.name })),
    // Who was booked to film - else Lasse, as "Book filming" on the deal suggests.
    crewIds: deal?.filmingCrewIds?.split(",").filter(Boolean).length ? deal.filmingCrewIds.split(",").filter(Boolean) : users.filter((u) => u.email === "lasse@nextview360.dk").map((u) => u.id),
    date: deal?.filmingAt ? deal.filmingAt.toISOString().slice(0, 10) : null,
    hours: deal?.filmingDurationMinutes ? deal.filmingDurationMinutes / 60 : null,
  };
}
