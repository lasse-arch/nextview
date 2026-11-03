"use server";

import { requireTeam } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dealName, stageLabels } from "@/lib/labels";

export type DealHit = { id: string; name: string; sub: string; stage: string };

/**
 * The search field at the top of Arpo: a deal by its name, the person, the
 * e-mail, the phone or the CVR - for the sales side (who see all deals in
 * the list too). At most eight, the latest touched first.
 */
export async function findDeals(query: string): Promise<DealHit[]> {
  await requireTeam("sales");
  const q = String(query ?? "").trim().slice(0, 80);
  if (q.length < 2) return [];
  const has = { contains: q, mode: "insensitive" as const };
  const digits = q.replace(/\s/g, "");
  const deals = await prisma.deal.findMany({
    where: {
      OR: [
        { companyName: has },
        { displayName: has },
        { contactName: has },
        { contactEmail: has },
        ...(/^\+?\d{4,}$/.test(digits) ? [{ contactPhone: { contains: digits } }, { cvrNumber: { contains: digits } }] : []),
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: 8,
    select: { id: true, companyName: true, displayName: true, contactName: true, address: true, stage: true },
  });
  return deals.map((d) => ({
    id: d.id,
    name: dealName(d),
    sub: [d.contactName, d.address?.split(",").pop()?.trim()].filter(Boolean).join(" · "),
    stage: stageLabels[d.stage] ?? d.stage,
  }));
}
