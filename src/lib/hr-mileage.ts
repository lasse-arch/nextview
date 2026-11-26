import "server-only";
import { prisma } from "@/lib/db";
import { mileageRate } from "@/lib/hr";
import { tripsOfYear } from "@/lib/hr-data";

/*
 * Kørselsregnskab for a month: what Skattestyrelsen requires for tax-free kørepenge - who (name, address; the CPR
 * number is added in the payroll system), each trip's date, purpose, route, km and the car, the rates used and the
 * amounts. Only approved trips are paid; the caller has checked the viewer may see the employee.
 */
export async function mileageAccount(employeeId: string, ym: string) {
  const e = await prisma.employee.findUniqueOrThrow({ where: { id: employeeId }, include: { user: { select: { name: true, lastName: true } } } });
  const year = Number(ym.slice(0, 4));
  const { trips, pay } = await tripsOfYear(e.id, year);
  const inMonth = trips.filter((t) => t.date.toISOString().slice(0, 7) === ym);
  const before = trips.filter((t) => t.date.toISOString().slice(0, 7) < ym).reduce((n, t) => n + t.km, 0);
  const km = inMonth.reduce((n, t) => n + t.km, 0);
  const kr = Math.round(inMonth.reduce((n, t) => n + (pay.get(t.id) ?? 0), 0) * 100) / 100;
  return {
    name: `${e.user.name}${e.user.lastName ? ` ${e.user.lastName}` : ""}`,
    address: e.homeAddress ?? "",
    payrollNumber: e.payrollNumber ?? "",
    rate: mileageRate(year),
    kmBefore: before,
    km,
    kr,
    trips: inMonth.map((t) => ({ date: t.date.toISOString().slice(0, 10), kind: t.kind, purpose: t.purpose, from: t.from, to: t.to, km: t.km, plate: t.plate ?? "", kr: pay.get(t.id) ?? 0 })),
  };
}
