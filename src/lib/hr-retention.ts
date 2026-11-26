import "server-only";
import { prisma } from "@/lib/db";
import { addDays, todayDk } from "@/lib/hr";

/*
 * Run daily (the deal-follow-up cron):
 *  - The day after the last day of work, the person's login to Arpo is closed and every session ends.
 *  - 5 years after the employment ended, HR clears what it holds about them (GDPR: no longer than needed): pay,
 *    absence notes, checklists, the access log, notes and the payroll number. The name, title and dates stay,
 *    so it's still known that the person worked here. The payroll system keeps what bookkeeping law needs.
 *  - Registered working time older than 5 years and 4 months (arbejdstidsloven: 5 years from the end of the
 *    4-month reference period) is deleted - the database refuses it any earlier.
 */
export async function runHrHousekeeping(today = todayDk()): Promise<{ closed: number; cleared: number; days: number }> {
  // Never an admin: closing the last admin out can't be undone from Arpo - an admin is closed by hand (Brugere).
  const ended = await prisma.employee.findMany({ where: { endDate: { lt: new Date(`${today}T00:00:00Z`) }, user: { disabledAt: null, role: { not: "ADMIN" } } }, select: { userId: true } });
  for (const e of ended) await prisma.user.update({ where: { id: e.userId }, data: { disabledAt: new Date(), sessionVersion: { increment: 1 } } });

  const fiveYears = `${Number(today.slice(0, 4)) - 5}${today.slice(4)}`;
  const old = await prisma.employee.findMany({ where: { endDate: { lt: new Date(`${fiveYears}T00:00:00Z`) }, anonymizedAt: null }, select: { id: true } });
  for (const e of old)
    await prisma.$transaction([
      prisma.payTerms.deleteMany({ where: { employeeId: e.id } }),
      prisma.hrTask.deleteMany({ where: { employeeId: e.id } }),
      prisma.hrAccessLog.deleteMany({ where: { employeeId: e.id } }),
      prisma.absence.updateMany({ where: { employeeId: e.id }, data: { note: null } }),
      prisma.employee.update({ where: { id: e.id }, data: { note: null, payrollNumber: null, anonymizedAt: new Date() } }),
    ]);

  const keepFrom = new Date(`${addDays(`${Number(today.slice(0, 4)) - 5}${today.slice(4)}`, -122)}T00:00:00Z`);
  const [changes, days] = await prisma.$transaction([prisma.workDayChange.deleteMany({ where: { date: { lt: keepFrom } } }), prisma.workDay.deleteMany({ where: { date: { lt: keepFrom } } })]);
  void changes;
  return { closed: ended.length, cleared: old.length, days: days.count };
}
