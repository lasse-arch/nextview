import "server-only";
import { startStatsIfFirst } from "@/lib/tour-stats";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { normalizeEmail } from "@/lib/customer-login";
import { releaseEstablishmentOnLive } from "@/lib/establishment-approval";
import { filmingTime } from "@/lib/filming-time";
import { dealName } from "@/lib/labels";
import { leadInboxExitData } from "@/lib/lead-inbox";
import { recalcCommission } from "@/lib/commission-service";
import { ringBell } from "@/lib/team-notifications";
import { tourChanged } from "@/lib/tour-cache";
import { arpoOrigin, cloudflareReady, publishTour } from "@/lib/tour-publish";
import { sendWelcomeMailOnLive } from "@/lib/welcome-mail";

/*
 * The customer approved the tour (in the tour or on their customer page): it
 * goes out by itself - published (on tour.nextview360.dk when Cloudflare is
 * set up), the deal set Live, and the welcome mail sent with the link. Done
 * by the system for the deal's owner, never on a customer's word about who
 * they are. Each step only runs when the one before worked: a tour that
 * didn't get out never gets a welcome mail with a dead link. Anything that
 * stops it lands in the team's bell and as a note on the deal, to do by hand
 * ("Udgiv endeligt og gør kunden live" in the editor).
 *
 * Internal only - not a server action (no "use server"), so it can't be called
 * from a browser.
 */
export async function goLiveAfterApproval(slug: string): Promise<void> {
  const tour = await prisma.tour.findUnique({
    where: { slug },
    select: {
      name: true,
      deal: { select: { id: true, ownerId: true, companyName: true, displayName: true, contactName: true, contactEmail: true, stage: true, contractSignedAt: true, liveAt: true, billingStartDate: true, terminationNoticeAt: true, filmingActualMinutes: true, branches: { select: { id: true } } } },
    },
  });
  const deal = tour?.deal;
  if (!tour || !deal) return;
  const name = dealName(deal);
  const stop = async (why: string) => {
    await prisma.note.create({ data: { dealId: deal.id, authorId: deal.ownerId, kind: "MANUAL", body: `Godkendt af kunden, men ikke sat live automatisk: ${why} Gør det i editoren (Del og udgiv → Udgiv endeligt og gør kunden live).` } }).catch(() => {});
    await ringBell({ kind: "approved", title: `Gør live i hånden: ${name}`, text: why, href: `/arpo/tour-lab/${slug}/rediger?fane=del`, tourSlug: slug }).catch(() => {});
  };

  // A customer already live (e.g. moved over from MPSkins): no mail, no new billing - a new version is published by hand.
  if (deal.stage === "LIVE") return;
  if (!deal.contactEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(deal.contactEmail))) return stop("Dealen har ingen gyldig kontakt-e-mail.");
  if ((await filmingTime(deal)).minutes == null) return stop("Filmtiden mangler i timeregistreringen.");
  // A termination already noted: its end date depends on the billing start - better set by hand.
  if (deal.terminationNoticeAt) return stop("Dealen har en opsigelse registreret.");

  // 1: the tour out there.
  try {
    if (cloudflareReady()) await publishTour(slug, "Kunden (godkendt)", "Godkendt af kunden - udgivet og sat live", arpoOrigin(process.env.APP_BASE_URL || "https://nextview360.dk"));
    else await prisma.tour.update({ where: { slug }, data: { published: true } });
    await startStatsIfFirst(slug);
  } catch (err) {
    return stop(`Touren kunne ikke udgives (${err instanceof Error ? err.message : String(err)}).`);
  }
  tourChanged(slug);
  revalidatePath(`/t/${slug}`);

  // 2: the contact person sees their own customer page (this deal and its locations).
  const email = normalizeEmail(deal.contactEmail);
  const account = await prisma.customerAccount.upsert({ where: { email }, create: { email, name: deal.contactName?.trim() || null, invitedByName: "Nextview360" }, update: {} });
  for (const id of [deal.id, ...deal.branches.map((b) => b.id)]) {
    await prisma.customerAccountDeal.upsert({ where: { accountId_dealId: { accountId: account.id, dealId: id } }, create: { accountId: account.id, dealId: id }, update: {} });
  }

  // 3: Live - as setting it on the deal page does (dates, billing start, activity, establishment, commission) - which sends the welcome mail.
  const now = new Date();
  const previous = deal.stage;
  await prisma.deal.update({
    where: { id: deal.id },
    data: {
      stage: "LIVE",
      ...(deal.contractSignedAt ? {} : { contractSignedAt: now }),
      // The day they approve is the live date (and the billing start, unless one is already set).
      liveAt: now,
      ...(deal.billingStartDate ? {} : { billingStartDate: now }),
      ...leadInboxExitData("LIVE"),
    },
  });
  await logActivity({ type: "DEAL_STAGE_LIVE", message: `${name} gik live (godkendt af kunden)`, actorId: deal.ownerId, dealId: deal.id });
  await releaseEstablishmentOnLive(deal.id, previous, "LIVE", deal.ownerId);
  await recalcCommission(deal.id).catch(() => {});
  await sendWelcomeMailOnLive(deal.id, previous, "LIVE", deal.ownerId);
  await prisma.note.create({ data: { dealId: deal.id, authorId: deal.ownerId, kind: "MANUAL", body: `Godkendt af kunden: touren er udgivet, kunden er sat live, og der er givet login til kundesiden for ${email}.` } }).catch(() => {});
  await ringBell({ kind: "approved", title: `Live: ${name}`, text: "Kunden godkendte touren - den er udgivet, kunden er sat live, og velkomstmailen er sendt.", href: `/arpo/deals/${deal.id}`, tourSlug: slug }).catch(() => {});
  revalidatePath(`/arpo/deals/${deal.id}`);
  revalidatePath("/arpo/deals");
  revalidatePath("/kunde");
}
