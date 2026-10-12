import "server-only";
import { prisma } from "@/lib/db";
import { buildDealEmailAddress } from "@/lib/email-address";
import type { DealStage } from "@prisma/client";

// Kept out of the "use server" actions file so it is not a public server action -
// called by the lead actions (after their user check) and the daily run.
/**
 * Atomically claims a NEW lead candidate (so two near-simultaneous clicks on
 * the same candidate can't both succeed - a plain read-then-write here would
 * let both pass a `status !== "NEW"` check before either one wrote back),
 * then either attaches it to an existing Deal sharing the same CVR number or
 * creates a brand-new one. A CVR number is the one genuinely reliable
 * identity for a company - checking it here (not just the company's name)
 * is what actually stops "flere filtre laver deals oveni hinanden": several
 * overlapping filters (or a filter re-matching a company already added
 * under a slightly different name) used to each spawn their own new Deal
 * for what was really the same company, since the old code only ran a
 * cosmetic name-similarity check that never blocked anything.
 */
export async function claimCandidateAndUpsertDeal(
  candidateId: string,
  userId: string,
  extraDealData: { callListId?: string } = {}
): Promise<{ dealId: string; created: boolean; existingStage?: DealStage } | { error: string }> {
  const candidate = await prisma.leadCandidate.findUniqueOrThrow({ where: { id: candidateId } });
  if (candidate.status !== "NEW") return { error: "Dette lead er allerede behandlet." };

  // A CSV-imported lead may have no CVR number - matching on a null one
  // would hit any deal without a CVR, so it falls back to the deal the
  // import already linked it to (see importLeadCsv), if any.
  const existingDeal = candidate.cvrNumber
    ? await prisma.deal.findFirst({ where: { cvrNumber: candidate.cvrNumber } })
    : candidate.dealId
      ? await prisma.deal.findUnique({ where: { id: candidate.dealId } })
      : null;

  const claimed = await prisma.leadCandidate.updateMany({
    where: { id: candidateId, status: "NEW" },
    data: { status: "ADDED" },
  });
  if (claimed.count === 0) return { error: "Dette lead er allerede behandlet." };

  let dealId: string;
  let created = false;
  let existingStage: DealStage | undefined;
  if (existingDeal) {
    // Don't silently move an already-existing deal onto a different
    // ringeliste here - whatever stage it's actually in (afvist/LOST, møde
    // booket, or further along), reassigning it without saying so could rip
    // it out of wherever someone is genuinely tracking it. The caller
    // surfaces existingStage as an explicit warning instead of acting on it.
    existingStage = existingDeal.stage;
    dealId = existingDeal.id;
  } else {
    const deal = await prisma.deal.create({
      data: {
        companyName: candidate.companyName,
        cvrNumber: candidate.cvrNumber,
        address: candidate.address,
        contactEmail: candidate.contactEmail,
        contactPhone: candidate.contactPhone,
        websiteUrl: candidate.website,
        ownerId: userId,
        importType: "MANUAL",
        ...extraDealData,
        // Added straight to a ringeliste: a lead to call, so it starts in
        // Leadindbakken; a plain "Tilføj som deal" goes on the Deals board.
        inLeadInbox: Boolean(extraDealData.callListId),
      },
    });
    await prisma.deal.update({ where: { id: deal.id }, data: { dealEmailAddress: buildDealEmailAddress(deal.id) } });
    dealId = deal.id;
    created = true;
  }

  await prisma.leadCandidate.update({ where: { id: candidateId }, data: { dealId } });
  return { dealId, created, existingStage };
}

