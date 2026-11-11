"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { teamCan } from "@/lib/team-roles";
import { proposalRateLimited, writeProposal, type ProposalData } from "@/lib/tour-proposal";

/*
 * Generator → "Få et oplæg til touren" (lib/tour-proposal.ts). The team only;
 * each proposal gets a long random token for its read-only link to the
 * customer (/oplaeg/<token>), which can be deleted again.
 */

export type ProposalRow = { id: string; token: string; customer: string; website: string; createdByName: string | null; createdAt: string; mine: boolean };

export async function createProposal(website: string, notes = ""): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await requireUser();
  const site = typeof website === "string" ? website.trim().slice(0, 300) : "";
  if (!site) return { ok: false, error: "Skriv kundens hjemmeside." };
  if (await proposalRateLimited(user.name)) return { ok: false, error: "Du har lavet mange oplæg den sidste time - prøv igen om lidt." };
  const r = await writeProposal(user, site, typeof notes === "string" ? notes.trim().slice(0, 1500) : "");
  if (!r.ok) return r;
  const row = await prisma.tourProposal.create({
    data: { token: randomBytes(18).toString("base64url"), website: r.data.website ?? site, customer: r.data.customer.slice(0, 200), data: r.data, createdById: user.id, createdByName: user.name },
  });
  revalidatePath("/arpo/generator");
  return { ok: true, id: row.id };
}

export async function listProposals(): Promise<ProposalRow[]> {
  const user = await requireUser();
  const admin = teamCan(user, "admin");
  const rows = await prisma.tourProposal.findMany({ orderBy: { createdAt: "desc" }, take: 30, select: { id: true, token: true, customer: true, website: true, createdById: true, createdByName: true, createdAt: true } });
  return rows.map((r) => ({ id: r.id, token: r.token, customer: r.customer, website: r.website, createdByName: r.createdByName, createdAt: r.createdAt.toISOString(), mine: admin || r.createdById === user.id }));
}

/** Gone, and its link with it (the one who made it, or an admin). */
export async function deleteProposal(id: string): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const row = await prisma.tourProposal.findUnique({ where: { id: String(id) }, select: { createdById: true } });
  if (!row) return { ok: true };
  if (row.createdById !== user.id && !teamCan(user, "admin")) return { ok: false, error: "Kun den, der lavede oplægget, eller en admin kan slette det." };
  await prisma.tourProposal.delete({ where: { id: String(id) } });
  revalidatePath("/arpo/generator");
  return { ok: true };
}

/** For the Arpo page of one proposal (the team). */
export async function getProposal(id: string): Promise<{ data: ProposalData; token: string; createdByName: string | null } | null> {
  await requireUser();
  const row = await prisma.tourProposal.findUnique({ where: { id: String(id) }, select: { data: true, token: true, createdByName: true } });
  return row ? { data: row.data as unknown as ProposalData, token: row.token, createdByName: row.createdByName } : null;
}
