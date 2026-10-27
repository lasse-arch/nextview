"use server";
import { claimCandidateAndUpsertDeal } from "@/lib/lead-candidate-claim";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { findPossibleDuplicates } from "@/lib/duplicates";
import { logActivity } from "@/lib/activity";
import { dealName } from "@/lib/labels";
import { runLeadFilter, type RunLeadFilterResult } from "@/lib/lead-generation-service";
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
  const foundedWithinRaw = Number(formData.get("foundedWithinDays"));
  const foundedWithinDays = Number.isInteger(foundedWithinRaw) && foundedWithinRaw > 0 ? foundedWithinRaw : null;
  // A rolling window replaces any fixed dates.
  const foundedFrom = foundedWithinDays ? null : parseFormDate(formData.get("foundedFrom"));
  const foundedTo = foundedWithinDays ? null : parseFormDate(formData.get("foundedTo"));
  const maxResultsRaw = Number(formData.get("maxResults"));
  const maxResults = Math.min(Math.max(1, Number.isFinite(maxResultsRaw) && maxResultsRaw > 0 ? maxResultsRaw : 50), MAX_LEAD_FILTER_RESULTS);
  // "Ringeliste-mål" select: "" (slået fra, default), "__daily__" (ny liste
  // hver dag) or an actual CallList id (fast valgt liste).
  const ringelisteTarget = String(formData.get("ringelisteTarget") || "");
  const autoCreateDailyList = ringelisteTarget === "__daily__";
  const targetCallListId = !autoCreateDailyList && ringelisteTarget ? ringelisteTarget : null;
  return { name, industryQuery, municipality, activeOnly, foundedFrom, foundedTo, foundedWithinDays, maxResults, autoCreateDailyList, targetCallListId };
}

function validateFilterFields(fields: ReturnType<typeof readFilterFields>): string | null {
  if (!fields.name) return "Giv filteret et navn.";
  if (!fields.industryQuery && !fields.municipality && !fields.foundedFrom && !fields.foundedTo && !fields.foundedWithinDays) {
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

  revalidatePath("/arpo/leadgeneration");
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
  revalidatePath("/arpo/leadgeneration");
  return { ok: true };
}

/** Renames just a filter - used by the "Omdøb" button on its list under
 * "Fundne leads", where the list's heading is the filter's name. Renaming the
 * filter itself (rather than relabeling its current candidates) keeps future
 * runs' finds landing in the same, renamed list. */
export async function renameLeadFilter(
  filterId: string,
  name: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireUser();
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Giv listen et navn." };
  await prisma.leadFilter.update({ where: { id: filterId }, data: { name: trimmed } });
  revalidatePath("/arpo/leadgeneration");
  return { ok: true };
}

export async function setLeadFilterEnabled(filterId: string, enabled: boolean): Promise<void> {
  await requireUser();
  await prisma.leadFilter.update({ where: { id: filterId }, data: { enabled } });
  revalidatePath("/arpo/leadgeneration");
}

export async function deleteLeadFilter(filterId: string): Promise<void> {
  await requireUser();
  await prisma.leadFilter.delete({ where: { id: filterId } });
  revalidatePath("/arpo/leadgeneration");
}

export async function runLeadFilterNowAction(filterId: string): Promise<RunLeadFilterResult> {
  await requireUser();
  const result = await runLeadFilter(filterId);
  revalidatePath("/arpo/leadgeneration");
  return result;
}

/** Drops these candidates from one filter's list under "Fundne leads" (see
 * LeadFilterMatch) - called alongside every review action taken from a
 * filter's list, so the card leaves that list but stays in any other
 * filter's list that also found it (there with a note saying it's handled). */
async function markMatchesHandled(filterId: string | null | undefined, candidateIds: string[]) {
  if (!filterId || candidateIds.length === 0) return;
  await prisma.leadFilterMatch.updateMany({
    where: { filterId, candidateId: { in: candidateIds }, handledAt: null },
    data: { handledAt: new Date() },
  });
}

/** A lead "Afvis"'d earlier can still be added after all, from another
 * filter's list where it turned up again - reopens it first so the usual
 * claim (which only takes NEW candidates) goes through. */
async function reopenIfDismissed(candidateId: string) {
  await prisma.leadCandidate.updateMany({ where: { id: candidateId, status: "DISMISSED" }, data: { status: "NEW" } });
}

/**
 * "Flyt til ringeliste" on found leads that are already deals - moves those
 * existing deals onto the chosen ringeliste, the same explicit "Tilføj
 * alligevel" the Ringeliste quick-add offers. Never done implicitly (see
 * claimCandidateAndUpsertDeal): only after the person has seen which
 * deals they are and asked for it. The leads then leave this list.
 */
export async function moveLeadDealsToCallList(
  candidateIds: string[],
  callListId: string,
  filterId?: string | null
): Promise<{ ok: true; moved: number } | { ok: false; error: string }> {
  const user = await requireUser();
  const list = await prisma.callList.findUnique({ where: { id: callListId } });
  if (!list) return { ok: false, error: "Listen findes ikke længere." };

  const candidates = await prisma.leadCandidate.findMany({ where: { id: { in: candidateIds } } });
  let moved = 0;
  for (const candidate of candidates) {
    const deal = candidate.dealId
      ? await prisma.deal.findUnique({ where: { id: candidate.dealId } })
      : candidate.cvrNumber
        ? await prisma.deal.findFirst({ where: { cvrNumber: candidate.cvrNumber } })
        : null;
    if (!deal) continue;
    if (deal.callListId !== callListId) {
      await prisma.deal.update({ where: { id: deal.id }, data: { callListId } });
      await logActivity({
        type: "DEAL_UPDATED",
        message: `${user.name} flyttede ${dealName(deal)} til ${list.name} fra Leadgeneration`,
        actorId: user.id,
        dealId: deal.id,
      });
    }
    await prisma.leadCandidate.update({ where: { id: candidate.id }, data: { status: "ADDED", dealId: deal.id } });
    moved++;
  }
  await markMatchesHandled(filterId, candidateIds);

  revalidatePath("/arpo/leadgeneration");
  revalidatePath("/arpo/ringeliste");
  revalidatePath("/arpo/deals");
  return { ok: true, moved };
}

/**
 * "Skjul" on an already-handled lead in a filter's list - just takes it off
 * that list, without touching the lead or its deal.
 */
export async function hideLeadMatch(filterId: string, candidateId: string): Promise<void> {
  await requireUser();
  await markMatchesHandled(filterId, [candidateId]);
  revalidatePath("/arpo/leadgeneration");
}

/**
 * "Tilføj som deal" on a found lead - creates a real Deal the same way the
 * manual "Ny deal" form does (owner defaults to whoever clicked it), unless
 * a deal for the same CVR number already exists (see claimCandidateAndUpsertDeal),
 * in which case the candidate is just linked to that one instead of spawning
 * a duplicate.
 */
export async function addLeadCandidateAsDeal(
  candidateId: string,
  filterId?: string | null
): Promise<
  { ok: true; dealId: string; duplicateId: string | null; alreadyExisted: boolean } | { ok: false; error: string }
> {
  const user = await requireUser();
  const candidate = await prisma.leadCandidate.findUniqueOrThrow({ where: { id: candidateId } });
  const duplicates = await findPossibleDuplicates({
    companyName: candidate.companyName,
    cvrNumber: candidate.cvrNumber,
    address: candidate.address,
  });

  await reopenIfDismissed(candidateId);
  const result = await claimCandidateAndUpsertDeal(candidateId, user.id);
  if ("error" in result) return { ok: false, error: result.error };
  await markMatchesHandled(filterId, [candidateId]);

  if (result.created) {
    const deal = await prisma.deal.findUniqueOrThrow({ where: { id: result.dealId } });
    await logActivity({
      type: "DEAL_CREATED",
      message: `${user.name} tilføjede ${dealName(deal)} som lead fra Leadgeneration`,
      actorId: user.id,
      dealId: deal.id,
    });
  }

  revalidatePath("/arpo/leadgeneration");
  revalidatePath("/arpo/deals");
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
  callListId: string,
  filterId?: string | null
): Promise<
  { ok: true; dealId: string; alreadyExisted: boolean; existingStage?: DealStage } | { ok: false; error: string }
> {
  const user = await requireUser();
  const list = await prisma.callList.findUnique({ where: { id: callListId } });
  if (!list) return { ok: false, error: "Listen findes ikke længere." };

  await reopenIfDismissed(candidateId);
  const result = await claimCandidateAndUpsertDeal(candidateId, user.id, { callListId });
  if ("error" in result) return { ok: false, error: result.error };
  await markMatchesHandled(filterId, [candidateId]);

  if (result.created) {
    const deal = await prisma.deal.findUniqueOrThrow({ where: { id: result.dealId } });
    await logActivity({
      type: "DEAL_CREATED",
      message: `${user.name} tilføjede ${dealName(deal)} til ${list.name} fra Leadgeneration`,
      actorId: user.id,
      dealId: deal.id,
    });
  }

  revalidatePath("/arpo/leadgeneration");
  revalidatePath("/arpo/ringeliste");
  revalidatePath("/arpo/deals");
  return { ok: true, dealId: result.dealId, alreadyExisted: !result.created, existingStage: result.existingStage };
}

/**
 * "Tilføj alle til ringeliste" - the same as addLeadCandidateToCallList for
 * a batch of leads in one request. The client sends a long list in chunks
 * of these, so a list of hundreds is a handful of requests instead of one
 * per lead (which took minutes, and one failed request took the page down).
 * A lead that can't be added (e.g. already handled meanwhile) is counted
 * and skipped rather than failing the batch.
 */
export async function addLeadCandidatesToCallList(
  candidateIds: string[],
  callListId: string,
  filterId?: string | null
): Promise<{ ok: true; added: number; alreadyExisted: number; skipped: number } | { ok: false; error: string }> {
  const user = await requireUser();
  const list = await prisma.callList.findUnique({ where: { id: callListId } });
  if (!list) return { ok: false, error: "Listen findes ikke længere." };

  let added = 0;
  let alreadyExisted = 0;
  let skipped = 0;
  for (const candidateId of candidateIds) {
    await reopenIfDismissed(candidateId);
    const result = await claimCandidateAndUpsertDeal(candidateId, user.id, { callListId });
    if ("error" in result) {
      skipped++;
      continue;
    }
    if (result.created) {
      added++;
      const deal = await prisma.deal.findUniqueOrThrow({ where: { id: result.dealId } });
      await logActivity({
        type: "DEAL_CREATED",
        message: `${user.name} tilføjede ${dealName(deal)} til ${list.name} fra Leadgeneration`,
        actorId: user.id,
        dealId: deal.id,
      });
    } else {
      alreadyExisted++;
    }
  }
  await markMatchesHandled(filterId, candidateIds);

  revalidatePath("/arpo/leadgeneration");
  revalidatePath("/arpo/ringeliste");
  revalidatePath("/arpo/deals");
  return { ok: true, added, alreadyExisted, skipped };
}

export async function dismissLeadCandidate(candidateId: string, filterId?: string | null): Promise<void> {
  await requireUser();
  await prisma.leadCandidate.updateMany({ where: { id: candidateId, status: "NEW" }, data: { status: "DISMISSED" } });
  await markMatchesHandled(filterId, [candidateId]);
  revalidatePath("/arpo/leadgeneration");
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
export async function deleteLeadCandidates(
  candidateIds: string[],
  filterId?: string | null
): Promise<{ deleted: number }> {
  await requireUser();
  if (candidateIds.length === 0) return { deleted: 0 };
  const result = await prisma.leadCandidate.updateMany({
    where: { id: { in: candidateIds }, status: "NEW" },
    data: { status: "DISMISSED" },
  });
  await markMatchesHandled(filterId, candidateIds);
  revalidatePath("/arpo/leadgeneration");
  return { deleted: result.count };
}
