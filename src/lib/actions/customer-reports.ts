"use server";

import { revalidatePath } from "next/cache";
import type { ReportInterval } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateAndSendCustomerReport, REPORT_INTERVAL_MONTHS } from "@/lib/customer-report-service";
import { addMonths } from "date-fns";

export async function updateMpSkinIdAction(
  dealId: string,
  mpSkinId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Kun admin kan ændre MP-Skin nummer");

  await prisma.deal.update({ where: { id: dealId }, data: { mpSkinId: mpSkinId.trim() || null } });
  revalidatePath("/stats");
  revalidatePath(`/deals/${dealId}`);
  return { ok: true };
}

export async function updateReportIntervalAction(
  dealId: string,
  interval: ReportInterval | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Kun admin kan ændre rapport-interval");

  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
  // Turning it on (from off, or switching interval length) reseeds the next
  // due date from today - switching TO the same interval it already was
  // leaves the existing schedule alone.
  const nextReportDueAt =
    interval === null ? null : deal.reportInterval === interval ? deal.nextReportDueAt : addMonths(new Date(), REPORT_INTERVAL_MONTHS[interval]);

  await prisma.deal.update({ where: { id: dealId }, data: { reportInterval: interval, nextReportDueAt } });
  revalidatePath("/stats");
  revalidatePath(`/deals/${dealId}`);
  return { ok: true };
}

/** "Send nu" button on the deal page - generates and sends immediately, then
 * applies the usual push-back-if-within-30-days rule to the schedule. */
export async function sendCustomerReportNowAction(dealId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Kun admin kan sende besøgsrapporter");

  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
  const result = await generateAndSendCustomerReport(deal, "MANUAL");
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/stats");
  return result;
}

export async function getCustomerReportHistory(dealId: string) {
  await requireUser();
  return prisma.customerReport.findMany({
    where: { dealId },
    orderBy: { sentAt: "desc" },
    take: 10,
  });
}
