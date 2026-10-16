import "server-only";
import { prisma } from "@/lib/db";
import { contractedContractValue } from "@/lib/labels";

/** "Solgt i alt" on the dashboard reaching this starts the party. */
export const SALES_MILESTONE_KR = 1_000_000;
const SALES_MILESTONE_KEY = "SOLD_1M";
const CELEBRATION_DAYS = 7;

/** Same stages and value as the dashboard's "Solgt i alt" (dashboard-data.ts). */
const SOLD_STAGES = ["LIVE", "CONTRACT_SIGNED", "FILMED"] as const;

async function soldTotal(now: Date): Promise<number> {
  const deals = await prisma.deal.findMany({
    where: { stage: { in: [...SOLD_STAGES] } },
    select: {
      establishmentFee: true,
      saleAmount: true,
      bindingMonths: true,
      billingStartDate: true,
      liveAt: true,
      churnedAt: true,
      contractEndDate: true,
    },
  });
  return deals.reduce((sum, d) => sum + (d.establishmentFee ?? 0) + contractedContractValue(d, now), 0);
}

/**
 * The 1 mio. celebration, if it's on: the week after "Solgt i alt" first
 * passed 1.000.000 kr. Checks the total only until it's been reached once -
 * after that it's one row lookup.
 */
export async function activeCelebration(now = new Date()): Promise<{ until: Date } | null> {
  // Runs in the layout of every page - a problem here must never take the
  // app down with it, it just means no party.
  try {
    return await celebrationUntil(now);
  } catch (err) {
    console.error("Kunne ikke tjekke 1 mio.-milepælen", err);
    return null;
  }
}

async function celebrationUntil(now: Date): Promise<{ until: Date } | null> {
  let milestone = await prisma.milestone.findUnique({ where: { key: SALES_MILESTONE_KEY } });
  if (!milestone) {
    if ((await soldTotal(now)) < SALES_MILESTONE_KR) return null;
    milestone = await prisma.milestone.upsert({
      where: { key: SALES_MILESTONE_KEY },
      create: { key: SALES_MILESTONE_KEY, reachedAt: now },
      update: {},
    });
  }
  const until = new Date(milestone.reachedAt.getTime() + CELEBRATION_DAYS * 24 * 60 * 60 * 1000);
  return now < until ? { until } : null;
}
