"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { dealName } from "@/lib/labels";

/**
 * "Flyt til Deals" in Leadindbakken - for a lead someone means to actively
 * work on before there's a meeting (didn't have time now, couldn't reach
 * the right person, ...). It keeps its stage and simply shows on the Deals
 * board from now on.
 */
export async function moveLeadsToDeals(dealIds: string[]): Promise<{ moved: number }> {
  const user = await requireUser();
  if (dealIds.length === 0) return { moved: 0 };
  const deals = await prisma.deal.findMany({
    where: { id: { in: dealIds }, inLeadInbox: true },
    select: { id: true, companyName: true, displayName: true },
  });
  await prisma.deal.updateMany({ where: { id: { in: deals.map((d) => d.id) } }, data: { inLeadInbox: false } });
  for (const deal of deals) {
    await logActivity({
      type: "DEAL_UPDATED",
      message: `${user.name} flyttede ${dealName(deal)} fra leadindbakken til Deals`,
      actorId: user.id,
      dealId: deal.id,
    });
  }
  revalidatePath("/leadindbakke");
  revalidatePath("/deals");
  return { moved: deals.length };
}

/** "Genåbn" on a lead marked Tabt in Leadindbakken - back to Lead, so it
 * can be called again (e.g. after turning up as a possible duplicate). */
export async function reopenInboxLead(dealId: string): Promise<void> {
  const user = await requireUser();
  const deal = await prisma.deal.update({ where: { id: dealId }, data: { stage: "LEAD" } });
  await logActivity({
    type: "DEAL_UPDATED",
    message: `${user.name} genåbnede ${dealName(deal)} i leadindbakken`,
    actorId: user.id,
    dealId,
  });
  revalidatePath("/leadindbakke");
  revalidatePath(`/deals/${dealId}`);
}
