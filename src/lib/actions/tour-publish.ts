"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { arpoOrigin, cloudflareReady, PAGES_PROJECT, publishTour, setLiveVersion } from "@/lib/tour-publish";

/* "Udgiv på tour.nextview360.dk" in the tour editor - admins only. */

export type Publication = { version: number; note: string | null; by: string | null; at: string; engine: string };
export type PublishState = { ready: boolean; project: string; live: number | null; versions: Publication[] };
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
    select: { liveVersion: true, publications: { orderBy: { version: "desc" }, take: 30, select: { version: true, note: true, createdByName: true, createdAt: true, engine: true } } },
  });
  return {
    ready: cloudflareReady(),
    project: PAGES_PROJECT,
    live: tour?.liveVersion ?? null,
    versions: (tour?.publications ?? []).map((p) => ({ version: p.version, note: p.note, by: p.createdByName, at: p.createdAt.toISOString(), engine: p.engine })),
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
