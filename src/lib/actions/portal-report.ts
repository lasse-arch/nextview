"use server";

import { revalidatePath } from "next/cache";
import { addMonths } from "date-fns";
import type { ReportInterval } from "@prisma/client";
import { getCurrentCustomer } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { REPORT_INTERVAL_MONTHS } from "@/lib/customer-report-service";
import { logActivity } from "@/lib/activity";
import { dealName } from "@/lib/labels";

const CHOICES = ["MONTHLY", "BIMONTHLY", "QUARTERLY", "OFF"] as const;
export type PortalReportChoice = (typeof CHOICES)[number];

const SAID: Record<PortalReportChoice, string> = { MONTHLY: "hver måned", BIMONTHLY: "hver 2. måned", QUARTERLY: "hver 3. måned", OFF: "ikke på mail" };

/**
 * "Statistik på mail" on the customer's page: how often the report is mailed
 * to them - for all the deals the login has access to (one customer, one
 * choice). Only a logged-in customer, only their own deals; the team changes
 * it on the deal in Arpo (updateReportIntervalAction). A new interval starts
 * counting from today, as when the team changes it.
 */
export async function setMyReportInterval(choice: PortalReportChoice): Promise<{ ok: true } | { ok: false; error: string }> {
  const account = await getCurrentCustomer();
  if (!account) return { ok: false, error: "Log ind igen." };
  if (!CHOICES.includes(choice)) return { ok: false, error: "Ugyldigt valg." };
  const interval: ReportInterval | null = choice === "OFF" ? null : choice;

  const deals = await prisma.deal.findMany({
    // Owners and staff only - it changes what is mailed to the customer.
    where: { id: { in: account.deals.filter((d) => d.role === "OWNER" || d.role === "STAFF").map((d) => d.dealId) } },
    select: { id: true, companyName: true, displayName: true, parentDealId: true, reportInterval: true, nextReportDueAt: true },
  });
  if (!deals.length) return { ok: false, error: "Ingen tours at sende tal for." };
  const changed = deals.filter((d) => d.reportInterval !== interval);
  if (!changed.length) return { ok: true };

  await prisma.$transaction(
    changed.map((d) =>
      prisma.deal.update({
        where: { id: d.id },
        data: { reportInterval: interval, nextReportDueAt: interval ? addMonths(new Date(), REPORT_INTERVAL_MONTHS[interval]) : null },
      })
    )
  );
  const root = deals.find((d) => !d.parentDealId || !deals.some((x) => x.id === d.parentDealId)) ?? deals[0];
  await logActivity({ type: "CUSTOMER_REPORT_INTERVAL", message: `${dealName(root)} valgte selv statistik på mail: ${SAID[choice]}`, dealId: root.id });
  revalidatePath("/kunde");
  for (const d of changed) revalidatePath(`/arpo/deals/${d.id}`);
  return { ok: true };
}
