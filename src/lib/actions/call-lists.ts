"use server";
import { defaultListName } from "@/lib/call-list-service";
import { revalidatePath } from "next/cache";
import { updateDealStage } from "@/lib/actions/deals";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { lookupCvrNumber } from "@/lib/cvr";
import { buildDealEmailAddress } from "@/lib/email-address";
import { findDuplicateDeals } from "@/lib/duplicates";
import { logActivity } from "@/lib/activity";
import { dealName, stageLabels } from "@/lib/labels";
import { parseCallListText, guessNameFromUrl } from "@/lib/call-list-parser";
import { scrapeBasicContactInfo } from "@/lib/website-contact-scrape";
import { expandDirectoryLink, type DirectoryLead } from "@/lib/lead-directories";
import type { ParsedCallListLine } from "@/lib/call-list-parser";

const SOCIAL_LINK_PATTERN = /facebook\.com|instagram\.com|linkedin\.com/i;


export async function createCallList(name?: string): Promise<{ id: string; name: string }> {
  const user = await requireUser();
  const list = await prisma.callList.create({
    data: { name: name?.trim() || defaultListName(), createdById: user.id },
  });
  revalidatePath("/ringeliste");
  return { id: list.id, name: list.name };
}

/** Lets a ringeliste's name be changed after creation - the default
 * "Ringeliste <ugedag> <dato>" naming is a convenient starting point, not
 * meant to be permanent, e.g. once it's actually someone's own named list
 * ("Victor fredags") rather than just that day's auto-created one. */
export async function renameCallList(callListId: string, name: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireUser();
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Navnet må ikke være tomt." };
  await prisma.callList.update({ where: { id: callListId }, data: { name: trimmed } });
  revalidatePath("/ringeliste");
  revalidatePath("/leadgeneration");
  return { ok: true };
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
  rawText: string,
  force = false
): Promise<
  | { ok: true; created: number; moved: number; skipped: number; alreadyExisting: { name: string; stage: string }[] }
  | { ok: false; error: string }
> {
  const user = await requireUser();
  const lines = parseCallListText(rawText);
  if (lines.length === 0) return { ok: false, error: "Indsæt mindst én linje." };

  const list = await prisma.callList.findUnique({ where: { id: callListId } });
  if (!list) return { ok: false, error: "Listen findes ikke længere." };

  let created = 0;
  let moved = 0;
  let skipped = 0;
  const alreadyExisting: { name: string; stage: string }[] = [];

  // A directory link (e.g. dk-camp.dk/campingpladser/) stands for every
  // business on it - each becomes its own lead, with the directory's
  // contact details and its page there as the "Kilde".
  const entries: { line: ParsedCallListLine; directory?: DirectoryLead }[] = [];
  for (const line of lines) {
    let directory: DirectoryLead[] | null = null;
    if (line.url && !line.cvrNumber) {
      try {
        directory = await expandDirectoryLink(line.url);
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "Kunne ikke hente listen fra siden." };
      }
    }
    if (!directory) {
      entries.push({ line });
      continue;
    }
    if (directory.length === 0) skipped++;
    for (const d of directory) {
      entries.push({ line: { raw: d.sourceUrl, cvrNumber: null, url: d.websiteUrl }, directory: d });
    }
  }

  for (const { line, directory } of entries) {
    let companyName: string | null = null;
    let cvrNumber: string | null = null;
    let address: string | null = null;
    let contactEmail: string | null = null;
    let contactPhone: string | null = null;
    let contactName: string | null = null;

    if (directory) {
      companyName = directory.companyName;
      address = directory.address;
      contactEmail = directory.contactEmail;
      contactPhone = directory.contactPhone;
    } else if (line.cvrNumber) {
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

    // A CVR number is the reliable match; for leads without one (pasted
    // Facebook/website links or a bare typed name), an exact case-insensitive
    // name match is the next best thing. Either way, an existing deal is
    // reused, never duplicated - this has to run BEFORE creating the deal,
    // since checking for duplicates afterwards would always find the row
    // just created (it matches its own name) and flag every single add as a
    // "possible duplicate" of itself.
    const existingByCvr = cvrNumber ? await prisma.deal.findFirst({ where: { cvrNumber } }) : null;
    const existingByName = existingByCvr ? null : (await findDuplicateDeals(companyName))[0] ?? null;
    const existingDeal = existingByCvr ?? existingByName;
    if (existingDeal) {
      if (force) {
        // The person has already seen the "findes allerede" warning and
        // explicitly asked to move it here anyway (e.g. it was added as a
        // bare lead by mistake and actually belongs in this ringeliste) -
        // reuse the existing deal rather than creating a second one.
        await prisma.deal.update({ where: { id: existingDeal.id }, data: { callListId } });
        await logActivity({
          type: "DEAL_UPDATED",
          message: `${user.name} flyttede ${dealName(existingDeal)} til ${list.name}`,
          actorId: user.id,
          dealId: existingDeal.id,
        });
        moved++;
        continue;
      }
      // Already a deal somewhere - don't silently move it onto this list, or
      // create a second deal for the same company. Whatever stage it's
      // actually in (afvist/LOST, møde booket, or further along), reassigning
      // or duplicating it here without saying so could rip it out of wherever
      // someone is genuinely tracking it - flag it instead and let the
      // person decide.
      alreadyExisting.push({ name: existingDeal.companyName, stage: stageLabels[existingDeal.stage] ?? existingDeal.stage });
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
        // Fresh off a ringeliste - a lead to call, not a deal being worked
        // yet, so it starts in Leadindbakken (see Deal.inLeadInbox).
        inLeadInbox: true,
      },
    });
    await prisma.deal.update({ where: { id: deal.id }, data: { dealEmailAddress: buildDealEmailAddress(deal.id) } });
    await prisma.note.create({
      data: { dealId: deal.id, authorId: user.id, body: `Kilde: ${line.raw}`, kind: "MANUAL" },
    });

    await logActivity({
      type: "DEAL_CREATED",
      message: `${user.name} tilføjede ${dealName(deal)} som lead fra ${list.name}`,
      actorId: user.id,
      dealId: deal.id,
    });

    created++;
  }

  revalidatePath("/ringeliste");
  revalidatePath("/deals");
  return { ok: true, created, moved, skipped, alreadyExisting };
}

export async function deleteCallList(callListId: string): Promise<void> {
  await requireUser();
  // Deals stay - they just lose their list tag (onDelete: SetNull on the relation).
  await prisma.callList.delete({ where: { id: callListId } });
  revalidatePath("/ringeliste");
}

/**
 * "Telefonsvar" on a Ringeliste card - called, no answer. Records when (the
 * card shows the latest time) and sends the lead to the back of the call
 * queue (see the ordering on /ringeliste). Can be pressed any number of
 * times; only the latest time is kept.
 */
export async function markVoicemail(dealId: string): Promise<{ at: string }> {
  const user = await requireUser();
  const at = new Date();
  const deal = await prisma.deal.update({ where: { id: dealId }, data: { lastVoicemailAt: at } });
  await logActivity({
    type: "DEAL_VOICEMAIL",
    message: `${user.name} ringede til ${dealName(deal)} - telefonsvar`,
    actorId: user.id,
    dealId,
  });
  revalidatePath("/ringeliste");
  return { at: at.toISOString() };
}

/**
 * "Ring tilbage" on the ringeliste: the customer asked to be called later.
 * Creates the task "Ring tilbage til <deal>" for whoever pressed it, due on
 * the chosen day with the time and their one-line note in the description,
 * keeps the note on the deal, and moves a lead on to Kontaktet - so it
 * leaves the list (it's been called) and the task brings it back.
 */
export async function scheduleCallBack(
  dealId: string,
  whenLocal: string,
  note: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(whenLocal.trim());
  if (!match) return { ok: false, error: "Vælg dato og klokkeslæt." };
  const [, date, time] = match;
  const text = note.trim().replace(/\s+/g, " ").slice(0, 300);
  if (!text) return { ok: false, error: "Skriv en kort note." };

  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
  const when = new Intl.DateTimeFormat("da-DK", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`)
  );

  await prisma.task.create({
    data: {
      title: `Ring tilbage til ${dealName(deal)}`,
      description: `Kl. ${time} - ${text}`,
      // Tasks are dated, not timed (like the ones made on Opgaver) - the
      // time is in the description.
      dueDate: new Date(`${date}T00:00:00Z`),
      assigneeId: user.id,
      createdById: user.id,
      dealId,
    },
  });
  await prisma.note.create({
    data: { dealId, authorId: user.id, body: `Ring tilbage ${when} kl. ${time}: ${text}`, kind: "MANUAL" },
  });
  if (deal.stage === "LEAD") await updateDealStage(dealId, "CONTACTED");
  await logActivity({
    type: "DEAL_CALLBACK",
    message: `${user.name} talte med ${dealName(deal)} - ringer tilbage ${when} kl. ${time}`,
    actorId: user.id,
    dealId,
  });

  revalidatePath("/ringeliste");
  revalidatePath("/opgaver");
  revalidatePath(`/deals/${dealId}`);
  return { ok: true };
}
