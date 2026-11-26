import "server-only";
import { prisma } from "@/lib/db";
import { teamCan } from "@/lib/team-roles";

/*
 * Filmers' availability ("tilgængelighed") and what they are booked on - read by the filmer's own page, the booking
 * dialog and the planning overview. The callers check who may see what (actions/availability.ts, the pages).
 */

/** How far ahead a filmer sets their days: 14 weeks (about 3 months). */
export const AVAIL_DAYS = 98;

export type Ymd = string;
const ymd = (d: Date) => d.toISOString().slice(0, 10);
export const dayDate = (s: Ymd) => new Date(`${s}T00:00:00Z`);
export const addDaysYmd = (s: Ymd, n: number) => ymd(new Date(dayDate(s).getTime() + n * 86_400_000));
export const clockText = (min: number) => `${Math.floor(min / 60)}${min % 60 ? `.${String(min % 60).padStart(2, "0")}` : ""}`;
export const spanText = (a: { fromMin: number; toMin: number }) => `${clockText(a.fromMin)}-${clockText(a.toMin)}`;

/** Everyone who films (the filming permission, i.e. Filmer or Admin) and still has access. */
export async function filmers() {
  const users = await prisma.user.findMany({ where: { disabledAt: null }, select: { id: true, name: true, lastName: true, role: true, extraRoles: true }, orderBy: { name: "asc" } });
  return users.filter((u) => teamCan(u, "filming")).map((u) => ({ id: u.id, name: `${u.name}${u.lastName ? ` ${u.lastName}` : ""}` }));
}

export async function availabilityBetween(from: Ymd, to: Ymd, userIds?: string[]) {
  return prisma.filmerAvailability.findMany({
    where: { date: { gte: dayDate(from), lte: dayDate(to) }, ...(userIds ? { userId: { in: userIds } } : {}) },
    orderBy: { date: "asc" },
  });
}

export type Booking = { userIds: string[]; date: Ymd; time: string; minutes: number | null; name: string; dealId: string; kind: "Optagelse" | "Genoptagelse" };

/** Filmings and refilmings between two days (filmingAt is wall-clock-as-UTC: its UTC digits are the Danish time). */
export async function bookingsBetween(from: Ymd, to: Ymd): Promise<Booking[]> {
  const gte = dayDate(from);
  const lt = dayDate(addDaysYmd(to, 1));
  const [deals, refilms] = await Promise.all([
    prisma.deal.findMany({ where: { filmingAt: { gte, lt }, filmingCrewIds: { not: null } }, select: { id: true, companyName: true, displayName: true, filmingAt: true, filmingDurationMinutes: true, filmingCrewIds: true } }),
    prisma.refilming.findMany({ where: { at: { gte, lt }, cancelledAt: null }, select: { at: true, durationMinutes: true, crewIds: true, deal: { select: { id: true, companyName: true, displayName: true } } } }),
  ]);
  const ids = (s: string | null) => (s ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  return [
    ...deals.map((d) => ({ userIds: ids(d.filmingCrewIds), date: ymd(d.filmingAt!), time: d.filmingAt!.toISOString().slice(11, 16), minutes: d.filmingDurationMinutes, name: d.displayName ?? d.companyName, dealId: d.id, kind: "Optagelse" as const })),
    ...refilms.map((r) => ({ userIds: ids(r.crewIds), date: ymd(r.at), time: r.at.toISOString().slice(11, 16), minutes: r.durationMinutes, name: r.deal.displayName ?? r.deal.companyName, dealId: r.deal.id, kind: "Genoptagelse" as const })),
  ].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}
