import "server-only";
import { prisma } from "@/lib/db";
import { addDays, todayDk } from "@/lib/hr";
import { suspendWorkspaceUser } from "@/lib/google-workspace";
import { deleteDriveCopies } from "@/lib/hr-documents";

/*
 * Run daily (the deal-follow-up cron):
 *  - The day after the last day of work, the person's login to Arpo is closed and every session ends - and their
 *    Google account is suspended (when Arpo manages it, lib/google-workspace.ts).
 *  - 5 years after the employment ended, HR clears what it holds about them (GDPR: no longer than needed): pay,
 *    absence notes, checklists, the access log, notes, the payroll number and their documents (also the Drev copies). The name, title and dates stay,
 *    so it's still known that the person worked here. The payroll system keeps what bookkeeping law needs.
 *  - Registered working time older than 5 years and 4 months (arbejdstidsloven: 5 years from the end of the
 *    4-month reference period) is deleted - the database refuses it any earlier.
 */
export async function runHrHousekeeping(today = todayDk()): Promise<{ closed: number; cleared: number; days: number }> {
  // Never an admin: closing the last admin out can't be undone from Arpo - an admin is closed by hand (Brugere).
  const ended = await prisma.employee.findMany({ where: { endDate: { lt: new Date(`${today}T00:00:00Z`) }, user: { disabledAt: null, role: { not: "ADMIN" } } }, select: { userId: true } });
  for (const e of ended) {
    const u = await prisma.user.update({ where: { id: e.userId }, data: { disabledAt: new Date(), sessionVersion: { increment: 1 } }, select: { email: true } });
    // Their Google account closes too (where Arpo manages it) - mails and files stay.
    await suspendWorkspaceUser(u.email).catch((err) => console.error("[hr] Google-kontoen kunne ikke lukkes", u.email, err instanceof Error ? err.message : err));
  }

  const fiveYears = `${Number(today.slice(0, 4)) - 5}${today.slice(4)}`;
  const old = await prisma.employee.findMany({ where: { endDate: { lt: new Date(`${fiveYears}T00:00:00Z`) }, anonymizedAt: null }, select: { id: true } });
  for (const e of old) {
    // Their papers too - the copies in Drev first (best effort), then the rows.
    const docs = await prisma.employeeDocument.findMany({ where: { employeeId: e.id }, select: { driveFileId: true } });
    await deleteDriveCopies(docs.flatMap((d) => (d.driveFileId ? [d.driveFileId] : []))).catch((err) => console.error("[hr] Drev-kopier kunne ikke slettes", err instanceof Error ? err.message : err));
    await prisma.$transaction([
      prisma.employeeDocument.deleteMany({ where: { employeeId: e.id } }),
      prisma.payTerms.deleteMany({ where: { employeeId: e.id } }),
      prisma.hrTask.deleteMany({ where: { employeeId: e.id } }),
      prisma.hrAccessLog.deleteMany({ where: { employeeId: e.id } }),
      prisma.absence.updateMany({ where: { employeeId: e.id }, data: { note: null } }),
      prisma.employee.update({ where: { id: e.id }, data: { note: null, payrollNumber: null, anonymizedAt: new Date() } }),
    ]);
  }

  const keepFrom = new Date(`${addDays(`${Number(today.slice(0, 4)) - 5}${today.slice(4)}`, -122)}T00:00:00Z`);
  const [changes, days] = await prisma.$transaction([prisma.workDayChange.deleteMany({ where: { date: { lt: keepFrom } } }), prisma.workDay.deleteMany({ where: { date: { lt: keepFrom } } })]);
  void changes;
  return { closed: ended.length, cleared: old.length, days: days.count };
}
