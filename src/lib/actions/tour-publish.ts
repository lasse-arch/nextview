"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { normalizeEmail } from "@/lib/customer-login";
import { setFilmingActual, updateDealStage } from "@/lib/actions/deals";
import { tourChanged } from "@/lib/tour-cache";
import { arpoOrigin, cloudflareReady, PAGES_PROJECT, publishTour, setLiveVersion } from "@/lib/tour-publish";

/* "Udgiv på tour.nextview360.dk" in the tour editor - admins only. */

export type Publication = { version: number; note: string | null; by: string | null; at: string; engine: string };
export type GoLiveState = { name: string; contactEmail: string | null; filmingMissing: boolean; liveAt: string | null; welcomeMailSentAt: string | null; portal: boolean };
export type PublishState = { ready: boolean; project: string; live: number | null; versions: Publication[]; deal: GoLiveState | null };
type Result<T> = { ok: true; value: T } | { ok: false; error: string };

async function admin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Kun admin kan udgive tours.");
  return user;
}
async function origin() {
  const h = await headers();
  return arpoOrigin(`${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`);
}

export async function publishState(slug: string): Promise<PublishState> {
  await admin();
  const tour = await prisma.tour.findUnique({
    where: { slug },
    select: {
      liveVersion: true,
      deal: { select: { id: true, companyName: true, displayName: true, contactEmail: true, filmingActualMinutes: true, stage: true, liveAt: true, welcomeMailSentAt: true, customerAccounts: { select: { accountId: true } } } },
      publications: { orderBy: { version: "desc" }, take: 30, select: { version: true, note: true, createdByName: true, createdAt: true, engine: true } } },
  });
  return {
    ready: cloudflareReady(),
    project: PAGES_PROJECT,
    live: tour?.liveVersion ?? null,
    versions: (tour?.publications ?? []).map((p) => ({ version: p.version, note: p.note, by: p.createdByName, at: p.createdAt.toISOString(), engine: p.engine })),
    deal: tour?.deal
      ? {
          name: tour.deal.displayName ?? tour.deal.companyName,
          contactEmail: tour.deal.contactEmail,
          filmingMissing: tour.deal.filmingActualMinutes == null,
          liveAt: tour.deal.stage === "LIVE" ? (tour.deal.liveAt ?? new Date()).toISOString() : null,
          welcomeMailSentAt: tour.deal.welcomeMailSentAt?.toISOString() ?? null,
          portal: tour.deal.customerAccounts.length > 0,
        }
      : null,
  };
}

export async function publishNow(slug: string, note: string): Promise<Result<{ version: number; missing: string[] }>> {
  try {
    const user = await admin();
    const r = await publishTour(slug, user.name, note.trim().slice(0, 200) || null, await origin());
    revalidatePath(`/arpo/tour-lab/${slug}/rediger`);
    return { ok: true, value: r };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function putVersionLive(slug: string, version: number | null): Promise<Result<null>> {
  try {
    await admin();
    await setLiveVersion(slug, version, await origin());
    revalidatePath(`/arpo/tour-lab/${slug}/rediger`);
    return { ok: true, value: null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * "Udgiv touren endelig og gør kunden live": the tour goes out (on
 * tour.nextview360.dk when Cloudflare is set up, and at /t/<slug>), the
 * contact person gets access to the customer page, the deal is set Live -
 * and that sends the welcome mail, with the customer page in it. The
 * filming time has to be there first, as everywhere a deal goes Live.
 */
export async function goLive(slug: string, filmingHours: number | null): Promise<Result<{ mail: string | null; version: number | null }>> {
  try {
    const user = await admin();
    const tour = await prisma.tour.findUnique({
      where: { slug },
      select: { deal: { select: { id: true, companyName: true, displayName: true, contactName: true, contactEmail: true, filmingActualMinutes: true, stage: true, welcomeMailSentAt: true, branches: { select: { id: true } } } } },
    });
    const deal = tour?.deal;
    if (!deal) return { ok: false, error: "Touren er ikke koblet til en kunde i Arpo." };
    // A customer who is already live (e.g. moved over from MPSkins) gets nothing from here: no mail, no new billing - "Udgiv ny version" is for them.
    if (deal.stage === "LIVE") return { ok: false, error: "Kunden er allerede live - brug \"Udgiv ny version\". Der sendes ingen mail." };
    if (!deal.contactEmail) return { ok: false, error: "Kunden har ingen kontakt-e-mail på dealen - tilføj den først." };
    const email = normalizeEmail(deal.contactEmail);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: `Kontakt-e-mailen på dealen ser forkert ud (${deal.contactEmail}).` };
    if (deal.filmingActualMinutes == null) {
      if (filmingHours == null) return { ok: false, error: "Udfyld filmtiden først." };
      const r = await setFilmingActual(deal.id, filmingHours);
      if (!r.ok) return r;
    }

    // 1: the tour out there. If this fails, nothing else happens.
    let version: number | null = null;
    if (cloudflareReady()) version = (await publishTour(slug, user.name, "Udgivet endeligt - kunden sat live", await origin())).version;
    else await prisma.tour.update({ where: { slug }, data: { published: true } });
    tourChanged(slug);
    revalidatePath(`/t/${slug}`);

    // 2: the contact person may see their own customer page (this deal, and its locations).
    const account = await prisma.customerAccount.upsert({ where: { email }, create: { email, name: deal.contactName?.trim() || null, invitedByName: user.name }, update: {} });
    for (const id of [deal.id, ...deal.branches.map((b) => b.id)]) {
      await prisma.customerAccountDeal.upsert({ where: { accountId_dealId: { accountId: account.id, dealId: id } }, create: { accountId: account.id, dealId: id }, update: {} });
    }

    // 3: Live - which sends the welcome mail the first time (a failure is left as a note on the deal).
    await updateDealStage(deal.id, "LIVE");
    const after = await prisma.deal.findUnique({ where: { id: deal.id }, select: { welcomeMailSentAt: true } });
    await prisma.note.create({ data: { dealId: deal.id, authorId: user.id, kind: "MANUAL", body: `Touren udgivet endeligt, og kunden sat live. Login til kundesiden givet til ${email}.` } });
    revalidatePath(`/arpo/tour-lab/${slug}/rediger`);
    revalidatePath(`/arpo/deals/${deal.id}`);
    return { ok: true, value: { mail: after?.welcomeMailSentAt ? email : null, version } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
