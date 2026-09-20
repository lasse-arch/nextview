"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
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

/**
 * "Send nu"/"Send stats" button - scraping + PDF rendering + emailing easily
 * takes 30-60+ seconds (headless Chromium, several page loads on a slow
 * third-party site), far past what a button click should block on and
 * uncomfortably close to a serverless function's request timeout. `after()`
 * lets the actual work keep running past this action's own response, so the
 * click returns immediately and the send happens in the background - the
 * page just needs a refresh a little later to see the updated "sidst sendt".
 */
export async function sendCustomerReportNowAction(
  dealId: string
): Promise<{ ok: true; queued: true } | { ok: false; error: string }> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Kun admin kan sende besøgsrapporter");

  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
  if (!deal.mpSkinId) return { ok: false, error: "Dealen har intet MP-Skin nummer udfyldt." };

  after(async () => {
    const result = await generateAndSendCustomerReport(deal, "MANUAL");
    if (!result.ok) console.error(`Besøgsrapport til deal ${dealId} fejlede:`, result.error);
    revalidatePath(`/deals/${dealId}`);
    revalidatePath("/stats");
  });

  return { ok: true, queued: true };
}
