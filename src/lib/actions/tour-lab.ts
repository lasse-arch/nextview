"use server";

import { tourChanged } from "@/lib/tour-cache";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { setSettingValue } from "@/lib/integration-settings";
import { fetchMpskinsCfg, ssOf, sweepForSs } from "@/lib/mpskins";

/** Saves the Matterport SDK key (a public browser key, locked to our domains in Matterport). */
export async function saveMatterportSdkKey(key: string): Promise<void> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Kun admin kan ændre SDK-nøglen.");
  await setSettingValue("MATTERPORT_SDK_KEY", key.trim() || null);
  revalidatePath("/arpo/tour-lab");
}

/** GA4 measurement id (G-…) the tour prototype sends its events to. */
export type ResolvedTourLink = { modelId: string; sweepId: string | null; ss: number | null } | { error: string };

/**
 * Turns an MPSkins link (explore.nextview360.dk/…?ss=…) into what our own
 * tour needs: the Matterport model id and the exact scan point. Read from
 * the tour page's own config, where `sweep` lists the scan points in the
 * order the ss numbers count (from 1) - so no guessing and no pressing U.
 */
export async function resolveTourLink(url: string): Promise<ResolvedTourLink> {
  const user = await requireUser();
  if (user.role !== "ADMIN") return { error: "Kun admin." };
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return { error: "Ugyldigt link." };
  }
  if (parsed.hostname !== "explore.nextview360.dk") return { error: "Ikke et explore.nextview360.dk-link." };
  const ss = ssOf(url);
  try {
    const cfg = await fetchMpskinsCfg(parsed.toString());
    if (!cfg?.mpModel) return { error: "Fandt ikke touren i MPSkins-siden." };
    const sweepId = sweepForSs(cfg, ss);
    if (ss != null && !sweepId) return { error: `Fandt ikke scanpunkt nr. ${ss} i touren.` };
    return { modelId: cfg.mpModel, sweepId, ss };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Kunne ikke hente MPSkins-siden." };
  }
}

/**
 * Stores a room's picture for the tour's story cards - a JPEG captured from
 * the tour in the browser (Renderer.takeScreenShot), sent as a data URL.
 */
export async function saveTourStoryImage(slug: string, room: string, dataUrl: string, quiet = false): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  if (user.role !== "ADMIN") return { ok: false, error: "Kun admin." };
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) return { ok: false, error: "Billedet skal være en JPEG." };
  const image = Buffer.from(match[1], "base64");
  if (image.length > 300_000) return { ok: false, error: "Billedet er for stort." };
  await prisma.tourStoryImage.upsert({
    where: { tourSlug_room: { tourSlug: slug, room } },
    create: { tourSlug: slug, room, image },
    update: { image },
  });
  // Many pictures in a row ("Tag billeder til historierne"): the tour is told once at the end (storyImagesSaved) -
  // telling it after each one reloads the preview, which jumps back to the start mid-round.
  if (!quiet) tourChanged(slug);
  return { ok: true };
}

/** "Fjern billederne": the story cards' pictures taken from the tour are removed (the cards show the room's letter again). Pictures used elsewhere (foto:) stay. */
export async function deleteStoryImages(slug: string): Promise<{ ok: true; removed: number } | { ok: false; error: string }> {
  const user = await requireUser();
  if (user.role !== "ADMIN") return { ok: false, error: "Kun admin." };
  const { count } = await prisma.tourStoryImage.deleteMany({ where: { tourSlug: slug, NOT: { room: { startsWith: "foto:" } } } });
  tourChanged(slug);
  return { ok: true, removed: count };
}

/** "Tag billeder til historierne" is done: the tour's cached copy is renewed once, with all the new pictures. */
export async function storyImagesSaved(slug: string): Promise<void> {
  const user = await requireUser();
  if (user.role !== "ADMIN") return;
  tourChanged(slug);
}
