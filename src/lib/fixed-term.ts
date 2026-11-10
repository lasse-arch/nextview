import "server-only";
import { addMonths, subMonths } from "date-fns";
import { prisma } from "@/lib/db";
import { dealName } from "@/lib/labels";

/*
 * A contract that is not renewed automatically ("Forlænges automatisk" off):
 * it ends when the binding period does - so the deal's contractEndDate is
 * set to then (billing stops, and the customer is marked ended, as after a
 * termination), and the seller gets a task 3 months before: talk to them
 * about extending. Kept right from wherever the deal changes (the contract
 * sent, billing started, a save) and every morning before invoicing. Turned
 * back on (a new contract that renews), the end date it had set goes again.
 */

const TASK = /^Aftalen med .+ udløber /;
const dkDate = (d: Date) => d.toLocaleDateString("da-DK", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Copenhagen" });

export async function syncFixedTermEnd(dealId: string): Promise<void> {
  const d = await prisma.deal.findUnique({
    where: { id: dealId },
    select: { id: true, companyName: true, displayName: true, ownerId: true, autoRenew: true, billingStartDate: true, bindingMonths: true, terminationNoticeAt: true, contractEndDate: true, contractEndDateManual: true, churnedAt: true },
  });
  // A termination or a date an admin set by hand decides the end - not this.
  if (!d || d.terminationNoticeAt || d.contractEndDateManual || d.churnedAt) return;
  const openTasks = await prisma.task.findMany({ where: { dealId, done: false }, select: { id: true, title: true, dueDate: true } });
  const ours = openTasks.filter((t) => TASK.test(t.title));

  if (d.autoRenew || !d.billingStartDate || !d.bindingMonths) {
    // Renews (again): an end date this set - the binding period's end, with no termination - is taken off.
    if (d.autoRenew && d.contractEndDate && d.billingStartDate && d.bindingMonths && d.contractEndDate.getTime() === addMonths(d.billingStartDate, d.bindingMonths).getTime()) {
      await prisma.deal.update({ where: { id: dealId }, data: { contractEndDate: null } });
    }
    if (d.autoRenew && ours.length) await prisma.task.deleteMany({ where: { id: { in: ours.map((t) => t.id) } } });
    return;
  }

  const end = addMonths(d.billingStartDate, d.bindingMonths);
  if (d.contractEndDate?.getTime() !== end.getTime()) await prisma.deal.update({ where: { id: dealId }, data: { contractEndDate: end } });
  const title = `Aftalen med ${dealName(d)} udløber ${dkDate(end)} - tal med dem om at forlænge.`;
  const due = subMonths(end, 3);
  if (ours.some((t) => t.title === title && t.dueDate?.getTime() === due.getTime())) return;
  await prisma.$transaction([
    prisma.task.deleteMany({ where: { id: { in: ours.map((t) => t.id) } } }),
    prisma.task.create({ data: { title, assigneeId: d.ownerId, createdById: d.ownerId, dealId, dueDate: due } }),
  ]);
}

/** Every morning, before invoicing: all deals whose contract doesn't renew. */
export async function syncAllFixedTermEnds(): Promise<number> {
  const deals = await prisma.deal.findMany({ where: { autoRenew: false, churnedAt: null }, select: { id: true } });
  for (const d of deals) await syncFixedTermEnd(d.id).catch((err) => console.error("Fast aftale: kunne ikke sætte ophør", d.id, err));
  return deals.length;
}
