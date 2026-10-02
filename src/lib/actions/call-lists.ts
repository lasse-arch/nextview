"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { lookupCvrNumber } from "@/lib/cvr";
import { buildDealEmailAddress } from "@/lib/email-address";
import { findDuplicateDeals } from "@/lib/duplicates";
import { logActivity } from "@/lib/activity";
import { dealName, stageLabels } from "@/lib/labels";
import { parseCallListText, guessNameFromUrl } from "@/lib/call-list-parser";
import { scrapeBasicContactInfo } from "@/lib/website-contact-scrape";

const SOCIAL_LINK_PATTERN = /facebook\.com|instagram\.com|linkedin\.com/i;

function defaultListName(): string {
  const formatted = new Intl.DateTimeFormat("da-DK", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
  return `Ringeliste ${formatted}`;
}

export async function createCallList(name?: string): Promise<{ id: string; name: string }> {
  const user = await requireUser();
  const list = await prisma.callList.create({
    data: { name: name?.trim() || defaultListName(), createdById: user.id },
  });
  revalidatePath("/ringeliste");
  return { id: list.id, name: list.name };
}

/**
 * Finds today's auto-generated Ringeliste (same name convention as
 * `createCallList()`'s own default, "Ringeliste <ugedag> <dato>") or creates
 * it if this is the first automatic lead-filter run today - used by a
 * LeadFilter with `autoCreateDailyList` set, so repeated runs on the same
 * day (a manual "Kør nu" plus the nightly cron, say) land in one shared
 * list instead of a fresh one each time.
 */
export async function findOrCreateTodayCallList(createdById: string): Promise<{ id: string; name: string }> {
  const name = defaultListName();
  const existing = await prisma.callList.findFirst({ where: { name, createdById } });
  if (existing) return existing;
  const list = await prisma.callList.create({ data: { name, createdById } });
  revalidatePath("/ringeliste");
  return list;
}

/**
 * The quick-add box on /ringeliste - one lead per pasted line. A CVR-register
 * link or bare CVR number gets the full official lookup (name/address/
 * contact); anything else (Facebook, a plain website, or just a typed
 * company name) becomes a bare Deal with a best-effort name, so no pasted
 * line is ever silently dropped. The raw line is always kept as the deal's
 * first note, so the original source is never lost even when the guessed
 * name is wrong.
 */
export async function addLeadsToCallList(
  callListId: string,
  rawText: string
): Promise<
  | { ok: true; created: number; skipped: number; alreadyExisting: { name: string; stage: string }[] }
  | { ok: false; error: string }
> {
  const user = await requireUser();
  const lines = parseCallListText(rawText);
  if (lines.length === 0) return { ok: false, error: "Indsæt mindst én linje." };

  const list = await prisma.callList.findUnique({ where: { id: callListId } });
  if (!list) return { ok: false, error: "Listen findes ikke længere." };

  let created = 0;
  let skipped = 0;
  const alreadyExisting: { name: string; stage: string }[] = [];

  for (const line of lines) {
    let companyName: string | null = null;
    let cvrNumber: string | null = null;
    let address: string | null = null;
    let contactEmail: string | null = null;
    let contactPhone: string | null = null;
    let contactName: string | null = null;

    if (line.cvrNumber) {
      const lookup = await lookupCvrNumber(line.cvrNumber);
      if (lookup.ok) {
        companyName = lookup.data.name;
        cvrNumber = lookup.data.cvr;
        address = lookup.data.address;
        contactEmail = lookup.data.email;
        contactPhone = lookup.data.phone;
        contactName = lookup.data.contactName;
      } else {
        // Opslaget fejlede (fx udgået CVR eller kvote) - opret alligevel, så
        // linjen ikke bare forsvinder, men med CVR-nummeret som navn.
        companyName = `CVR ${line.cvrNumber}`;
        cvrNumber = line.cvrNumber;
      }
    } else if (line.url && SOCIAL_LINK_PATTERN.test(line.url)) {
      // Facebook/Instagram/LinkedIn pages are client-rendered/login-walled -
      // scraping them wouldn't find anything real, so just guess from the slug.
      companyName = guessNameFromUrl(line.url);
    } else if (line.url) {
      // A plain business website has no official register to ask, unlike a
      // CVR number - a best-effort scrape of its front page is the closest
      // equivalent (see website-contact-scrape.ts for what it can/can't find).
      const scraped = await scrapeBasicContactInfo(line.url);
      companyName = scraped.name || guessNameFromUrl(line.url);
      contactPhone = scraped.phone;
      contactName = scraped.ownerName;
    } else {
      companyName = line.raw.slice(0, 120);
    }

    if (!companyName?.trim()) {
      skipped++;
      continue;
    }

    const existingByCvr = cvrNumber ? await prisma.deal.findFirst({ where: { cvrNumber } }) : null;
    if (existingByCvr) {
      // Already a deal somewhere - don't silently move it onto this list.
      // Whatever stage it's actually in (afvist/LOST, møde booket, or
      // further along), reassigning it here without saying so could rip it
      // out of wherever someone is genuinely tracking it - flag it instead
      // and let the person decide.
      alreadyExisting.push({ name: existingByCvr.companyName, stage: stageLabels[existingByCvr.stage] ?? existingByCvr.stage });
      continue;
    }

    const deal = await prisma.deal.create({
      data: {
        companyName,
        cvrNumber,
        address,
        contactName,
        contactEmail,
        contactPhone,
        websiteUrl: line.url,
        ownerId: user.id,
        importType: "MANUAL",
        callListId,
      },
    });
    await prisma.deal.update({ where: { id: deal.id }, data: { dealEmailAddress: buildDealEmailAddress(deal.id) } });
    await prisma.note.create({
      data: { dealId: deal.id, authorId: user.id, body: `Kilde: ${line.raw}`, kind: "MANUAL" },
    });

    const duplicates = await findDuplicateDeals(companyName);
    await logActivity({
      type: "DEAL_CREATED",
      message: `${user.name} tilføjede ${dealName(deal)} som lead fra ${list.name}${duplicates.length > 0 ? " (mulig dublet)" : ""}`,
      actorId: user.id,
      dealId: deal.id,
    });

    created++;
  }

  revalidatePath("/ringeliste");
  revalidatePath("/deals");
  return { ok: true, created, skipped, alreadyExisting };
}

export async function deleteCallList(callListId: string): Promise<void> {
  await requireUser();
  // Deals stay - they just lose their list tag (onDelete: SetNull on the relation).
  await prisma.callList.delete({ where: { id: callListId } });
  revalidatePath("/ringeliste");
}
