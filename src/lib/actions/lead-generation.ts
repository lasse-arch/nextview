"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { buildDealEmailAddress } from "@/lib/email-address";
import { findDuplicateDeals } from "@/lib/duplicates";
import { logActivity } from "@/lib/activity";
import { dealName } from "@/lib/labels";
import { runLeadFilter } from "@/lib/lead-generation-service";
import { MAX_LEAD_FILTER_RESULTS } from "@/lib/cvr-search";
import type { DealStage } from "@prisma/client";

function parseFormDate(raw: FormDataEntryValue | null): Date | null {
  const value = String(raw || "").trim();
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function readFilterFields(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const industryQuery = String(formData.get("industryQuery") || "").trim() || null;
  const municipality = String(formData.get("municipality") || "").trim() || null;
  const activeOnly = formData.get("activeOnly") === "on";
  const foundedFrom = parseFormDate(formData.get("foundedFrom"));
  const foundedTo = parseFormDate(formData.get("foundedTo"));
  const maxResultsRaw = Number(formData.get("maxResults"));
  const maxResults = Math.min(Math.max(1, Number.isFinite(maxResultsRaw) && maxResultsRaw > 0 ? maxResultsRaw : 50), MAX_LEAD_FILTER_RESULTS);
  // "Ringeliste-mål" select: "" (slået fra, default), "__daily__" (ny liste
  // hver dag) or an actual CallList id (fast valgt liste).
  const ringelisteTarget = String(formData.get("ringelisteTarget") || "");
  const autoCreateDailyList = ringelisteTarget === "__daily__";
  const targetCallListId = !autoCreateDailyList && ringelisteTarget ? ringelisteTarget : null;
  return { name, industryQuery, municipality, activeOnly, foundedFrom, foundedTo, maxResults, autoCreateDailyList, targetCallListId };
}

function validateFilterFields(fields: ReturnType<typeof readFilterFields>): string | null {
  if (!fields.name) return "Giv filteret et navn.";
  if (!fields.industryQuery && !fields.municipality && !fields.foundedFrom && !fields.foundedTo) {
    return "Angiv mindst branche, område eller en periode.";
  }
  if (fields.foundedFrom && fields.foundedTo && fields.foundedFrom > fields.foundedTo) {
    return "Periodens \"fra\"-dato skal være før \"til\"-datoen.";
  }
  return null;
}

export async function createLeadFilter(
  formData: FormData
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await requireUser();
  const fields = readFilterFields(formData);
  const error = validateFilterFields(fields);
  if (error) return { ok: false, error };

  const filter = await prisma.leadFilter.create({
    data: { ...fields, createdById: user.id },
  });

  revalidatePath("/leadgeneration");
  return { ok: true, id: filter.id };
}

export async function updateLeadFilter(
  filterId: string,
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireUser();
  const fields = readFilterFields(formData);
  const error = validateFilterFields(fields);
  if (error) return { ok: false, error };

  await prisma.leadFilter.update({ where: { id: filterId }, data: fields });
  revalidatePath("/leadgeneration");
  return { ok: true };
}

export async function setLeadFilterEnabled(filterId: string, enabled: boolean): Promise<void> {
  await requireUser();
  await prisma.leadFilter.update({ where: { id: filterId }, data: { enabled } });
  revalidatePath("/leadgeneration");
}

export async function deleteLeadFilter(filterId: string): Promise<void> {
  await requireUser();
  await prisma.leadFilter.delete({ where: { id: filterId } });
  revalidatePath("/leadgeneration");
}

export async function runLeadFilterNowAction(
  filterId: string
): Promise<{ ok: true; added: number } | { ok: false; error: string }> {
  await requireUser();
  const result = await runLeadFilter(filterId);
  revalidatePath("/leadgeneration");
  return result;
}

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

  const existingDeal = await prisma.deal.findFirst({ where: { cvrNumber: candidate.cvrNumber } });

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
      },
    });
    await prisma.deal.update({ where: { id: deal.id }, data: { dealEmailAddress: buildDealEmailAddress(deal.id) } });
    dealId = deal.id;
    created = true;
  }

  await prisma.leadCandidate.update({ where: { id: candidateId }, data: { dealId } });
  return { dealId, created, existingStage };
}

/**
 * "Tilføj som deal" on a found lead - creates a real Deal the same way the
 * manual "Ny deal" form does (owner defaults to whoever clicked it), unless
 * a deal for the same CVR number already exists (see claimCandidateAndUpsertDeal),
 * in which case the candidate is just linked to that one instead of spawning
 * a duplicate.
 */
export async function addLeadCandidateAsDeal(
  candidateId: string
): Promise<
  { ok: true; dealId: string; duplicateId: string | null; alreadyExisted: boolean } | { ok: false; error: string }
> {
  const user = await requireUser();
  const candidate = await prisma.leadCandidate.findUniqueOrThrow({ where: { id: candidateId } });
  const duplicates = await findDuplicateDeals(candidate.companyName);

  const result = await claimCandidateAndUpsertDeal(candidateId, user.id);
  if ("error" in result) return { ok: false, error: result.error };

  if (result.created) {
    const deal = await prisma.deal.findUniqueOrThrow({ where: { id: result.dealId } });
    await logActivity({
      type: "DEAL_CREATED",
      message: `${user.name} tilføjede ${dealName(deal)} som lead fra Leadgeneration`,
      actorId: user.id,
      dealId: deal.id,
    });
  }

  revalidatePath("/leadgeneration");
  revalidatePath("/deals");
  // A name-similarity "possible duplicate" hint only makes sense for a
  // genuinely new deal - when the CVR number already matched an existing
  // one (alreadyExisted), that IS the same company, not just a similarly-
  // named one, so there's nothing useful to flag.
  return {
    ok: true,
    dealId: result.dealId,
    duplicateId: result.created ? duplicates[0]?.id ?? null : null,
    alreadyExisted: !result.created,
  };
}

/**
 * "Tilføj til ringeliste" on a found lead - same CVR-based dedup as "Tilføj
 * som deal", but attaches the resulting deal to a chosen CallList (see
 * Ringeliste) instead of leaving it unassigned.
 */
export async function addLeadCandidateToCallList(
  candidateId: string,
  callListId: string
): Promise<
  { ok: true; dealId: string; alreadyExisted: boolean; existingStage?: DealStage } | { ok: false; error: string }
> {
  const user = await requireUser();
  const list = await prisma.callList.findUnique({ where: { id: callListId } });
  if (!list) return { ok: false, error: "Listen findes ikke længere." };

  const result = await claimCandidateAndUpsertDeal(candidateId, user.id, { callListId });
  if ("error" in result) return { ok: false, error: result.error };

  if (result.created) {
    const deal = await prisma.deal.findUniqueOrThrow({ where: { id: result.dealId } });
    await logActivity({
      type: "DEAL_CREATED",
      message: `${user.name} tilføjede ${dealName(deal)} til ${list.name} fra Leadgeneration`,
      actorId: user.id,
      dealId: deal.id,
    });
  }

  revalidatePath("/leadgeneration");
  revalidatePath("/ringeliste");
  revalidatePath("/deals");
  return { ok: true, dealId: result.dealId, alreadyExisted: !result.created, existingStage: result.existingStage };
}

export async function dismissLeadCandidate(candidateId: string): Promise<void> {
  await requireUser();
  await prisma.leadCandidate.update({ where: { id: candidateId }, data: { status: "DISMISSED" } });
  revalidatePath("/leadgeneration");
}

/**
 * "Slet liste" on a whole found-leads group in /leadgeneration - dismisses
 * every still-unreviewed (NEW) candidate in the given group in one go,
 * instead of clicking "Afvis" on each one individually. This is the same
 * state change as a single "Afvis" (status -> DISMISSED), NOT a hard
 * delete: a deleted row would stop being "known" (see runLeadFilter), so
 * the same company would just come back as a brand-new "fresh" candidate
 * the next time its filter runs - silently undoing the dedup protection
 * that already keeps the CVR register search from suggesting a company
 * twice. Only ever targets candidates still NEW: one already turned into a
 * real Deal (ADDED) is left alone, since this is for clearing out noise
 * from a review queue, not for removing actual deals.
 */
export async function deleteLeadCandidates(candidateIds: string[]): Promise<{ deleted: number }> {
  await requireUser();
  if (candidateIds.length === 0) return { deleted: 0 };
  const result = await prisma.leadCandidate.updateMany({
    where: { id: { in: candidateIds }, status: "NEW" },
    data: { status: "DISMISSED" },
  });
  revalidatePath("/leadgeneration");
  return { deleted: result.count };
}
