"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { buildDealEmailAddress } from "@/lib/email-address";
import { findDuplicateDeals } from "@/lib/duplicates";
import { logActivity } from "@/lib/activity";
import { dealName } from "@/lib/labels";
import { runLeadFilter } from "@/lib/lead-generation-service";

function readFilterFields(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const industryQuery = String(formData.get("industryQuery") || "").trim() || null;
  const municipality = String(formData.get("municipality") || "").trim() || null;
  const activeOnly = formData.get("activeOnly") === "on";
  return { name, industryQuery, municipality, activeOnly };
}

export async function createLeadFilter(
  formData: FormData
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await requireUser();
  const fields = readFilterFields(formData);
  if (!fields.name) return { ok: false, error: "Giv filteret et navn." };
  if (!fields.industryQuery && !fields.municipality) {
    return { ok: false, error: "Angiv mindst branche eller område." };
  }

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
  if (!fields.name) return { ok: false, error: "Giv filteret et navn." };
  if (!fields.industryQuery && !fields.municipality) {
    return { ok: false, error: "Angiv mindst branche eller område." };
  }

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
 * "Tilføj som deal" on a found lead - creates a real Deal the same way the
 * manual "Ny deal" form does (owner defaults to whoever clicked it), then
 * marks the candidate ADDED so it drops out of the review list for good.
 */
export async function addLeadCandidateAsDeal(
  candidateId: string
): Promise<{ ok: true; dealId: string; duplicateId: string | null } | { ok: false; error: string }> {
  const user = await requireUser();
  const candidate = await prisma.leadCandidate.findUniqueOrThrow({ where: { id: candidateId } });
  if (candidate.status !== "NEW") return { ok: false, error: "Dette lead er allerede behandlet." };

  const duplicates = await findDuplicateDeals(candidate.companyName);

  const deal = await prisma.deal.create({
    data: {
      companyName: candidate.companyName,
      cvrNumber: candidate.cvrNumber,
      address: candidate.address,
      contactEmail: candidate.contactEmail,
      contactPhone: candidate.contactPhone,
      ownerId: user.id,
      importType: "MANUAL",
    },
  });
  await prisma.deal.update({ where: { id: deal.id }, data: { dealEmailAddress: buildDealEmailAddress(deal.id) } });
  await prisma.leadCandidate.update({ where: { id: candidateId }, data: { status: "ADDED", dealId: deal.id } });

  await logActivity({
    type: "DEAL_CREATED",
    message: `${user.name} tilføjede ${dealName(deal)} som lead fra Leadgeneration`,
    actorId: user.id,
    dealId: deal.id,
  });

  revalidatePath("/leadgeneration");
  revalidatePath("/deals");
  return { ok: true, dealId: deal.id, duplicateId: duplicates[0]?.id ?? null };
}

export async function dismissLeadCandidate(candidateId: string): Promise<void> {
  await requireUser();
  await prisma.leadCandidate.update({ where: { id: candidateId }, data: { status: "DISMISSED" } });
  revalidatePath("/leadgeneration");
}
