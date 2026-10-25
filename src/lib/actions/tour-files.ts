"use server";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DB_MAX, hostFiles, storeTourFile } from "@/lib/tour-files";
import type { TourConfig } from "@/app/(app)/tour-lab/tours/types";

async function admin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Kun admin kan redigere tours.");
}

/** Copies every file the setup takes from other sites to us; the editor puts the new setup in its draft. */
export async function hostTourFiles(slug: string, config: TourConfig): Promise<{ ok: true; config: TourConfig; copied: number; failed: string[] }> {
  await admin();
  return { ok: true, ...(await hostFiles(slug, config)) };
}

/** An upload from the editor (without Vercel Blob: up to 4 MB, kept in the database). */
export async function uploadTourFile(slug: string, form: FormData): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  await admin();
  const file = form.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Ingen fil." };
  if (file.size > DB_MAX) return { ok: false, error: "Filen er over 4 MB - store filer som video kræver Vercel Blob." };
  try {
    return { ok: true, url: await storeTourFile(slug, file.name, file.type, Buffer.from(await file.arrayBuffer())) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Records a file the editor uploaded straight to Vercel Blob. */
export async function registerTourFile(slug: string, file: { url: string; name: string; contentType: string; size: number }): Promise<void> {
  await admin();
  if (!/^https:\/\/[\w.-]+\.blob\.vercel-storage\.com\//.test(file.url)) throw new Error("Ukendt filadresse.");
  await prisma.tourFile.create({ data: { tourSlug: slug, name: file.name.slice(0, 200), contentType: file.contentType, size: file.size, url: file.url } });
}
