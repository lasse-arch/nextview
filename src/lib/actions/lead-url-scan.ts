"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { scanUrlForCvrLeads } from "@/lib/url-lead-scan";
import { runWatchedUrl } from "@/lib/lead-generation-service";

/**
 * Ad-hoc "Scan nu" for a URL that isn't (necessarily) saved as a WatchedUrl -
 * scans immediately and inserts any newly-found CVR numbers as LeadCandidates,
 * same dedup rules (global cvrNumber uniqueness, skip existing Deals) as
 * everywhere else in Leadgeneration.
 */
export async function scanUrlNowAction(
  url: string
): Promise<
  | { ok: true; added: number; cvrCount: number; title: string | null; articlesScanned: number }
  | { ok: false; error: string }
> {
  await requireUser();
  if (!url.trim()) return { ok: false, error: "Angiv en URL." };

  const scan = await scanUrlForCvrLeads(url.trim());
  if (!scan.ok) return scan;

  const cvrNumbers = scan.hits.map((h) => h.cvr);
  const [existingCandidates, existingDeals] = await Promise.all([
    prisma.leadCandidate.findMany({ where: { cvrNumber: { in: cvrNumbers } }, select: { cvrNumber: true } }),
    prisma.deal.findMany({ where: { cvrNumber: { in: cvrNumbers } }, select: { cvrNumber: true } }),
  ]);
  const known = new Set([
    ...existingCandidates.map((c) => c.cvrNumber),
    ...existingDeals.map((d) => d.cvrNumber).filter((c): c is string => Boolean(c)),
  ]);
  const fresh = scan.hits.filter((h) => !known.has(h.cvr));

  if (fresh.length > 0) {
    await prisma.leadCandidate.createMany({
      data: fresh.map((h) => ({
        sourceUrl: url.trim(),
        cvrNumber: h.cvr,
        companyName: h.name,
        address: h.address,
        contactEmail: h.contactEmail,
        contactPhone: h.contactPhone,
        ownerName: h.ownerName,
      })),
      skipDuplicates: true,
    });
  }

  revalidatePath("/leadgeneration");
  return {
    ok: true,
    added: fresh.length,
    cvrCount: scan.cvrNumbers.length,
    title: scan.title,
    articlesScanned: scan.articlesScanned,
  };
}

export async function createWatchedUrl(
  formData: FormData
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await requireUser();
  const url = String(formData.get("url") || "").trim();
  const label = String(formData.get("label") || "").trim() || null;
  if (!url) return { ok: false, error: "Angiv en URL." };

  try {
    new URL(url);
  } catch {
    return { ok: false, error: "Ugyldig URL." };
  }

  const watched = await prisma.watchedUrl.create({ data: { url, label, createdById: user.id } });
  revalidatePath("/leadgeneration");
  return { ok: true, id: watched.id };
}

/** Sets the display label of a watched page - used by the "Omdøb" button on
 * its list under "Fundne leads", which shows the label instead of the raw URL
 * once one is set. Keyed by URL since that's what candidates record as their
 * source; an empty name clears the label (back to showing the URL). */
export async function renameWatchedUrl(
  url: string,
  label: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireUser();
  const result = await prisma.watchedUrl.updateMany({ where: { url }, data: { label: label.trim() || null } });
  if (result.count === 0) return { ok: false, error: "Siden overvåges ikke længere og kan ikke omdøbes." };
  revalidatePath("/leadgeneration");
  return { ok: true };
}

export async function setWatchedUrlEnabled(id: string, enabled: boolean): Promise<void> {
  await requireUser();
  await prisma.watchedUrl.update({ where: { id }, data: { enabled } });
  revalidatePath("/leadgeneration");
}

export async function deleteWatchedUrl(id: string): Promise<void> {
  await requireUser();
  await prisma.watchedUrl.delete({ where: { id } });
  revalidatePath("/leadgeneration");
}

export async function runWatchedUrlNowAction(
  id: string
): Promise<{ ok: true; added: number; unchanged: boolean } | { ok: false; error: string }> {
  await requireUser();
  const result = await runWatchedUrl(id);
  revalidatePath("/leadgeneration");
  return result;
}
