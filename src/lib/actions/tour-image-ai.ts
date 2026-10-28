"use server";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { headers } from "next/headers";
import sharp from "sharp";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSettingValue, setSettingValue } from "@/lib/integration-settings";
import { storeTourFile } from "@/lib/tour-files";
import { changeMask, keepSharpWhereUnchanged } from "@/lib/image-merge";
import { pasteView, renderView, type PanoView } from "@/lib/pano-view";

/*
 * "Ret med AI": a tour's picture (the map, a drone photo, a cover, a point's
 * photo) changed by an image model from a sentence ("gør græsset sommergrønt
 * og fyld poolen"). Claude can only look at pictures, so this uses Google's
 * Gemini image model. The new picture is stored as a new file - the original
 * is never touched, and nothing changes in the tour until the user picks it.
 */

const MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
const API = "https://generativelanguage.googleapis.com/v1beta";

async function admin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Kun admin kan redigere tours.");
  return user;
}

const geminiKey = async () => process.env.GEMINI_API_KEY || (await getSettingValue("GEMINI_API_KEY"));

export async function imageAiReady(): Promise<boolean> {
  await admin();
  return Boolean(await geminiKey());
}

export async function saveGeminiKey(key: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await admin();
  const k = key.trim();
  if (!k) return { ok: false, error: "Indsæt nøglen." };
  const res = await fetch(`${API}/models?pageSize=1`, { headers: { "x-goog-api-key": k }, signal: AbortSignal.timeout(15_000) }).catch(() => null);
  if (!res?.ok) return { ok: false, error: "Nøglen virker ikke - tjek, at det er en Gemini API-nøgle fra Google AI Studio." };
  await setSettingValue("GEMINI_API_KEY", k);
  return { ok: true };
}

/** The picture's bytes: our own files from disk or the database, anything else over the net. */
async function load(src: string): Promise<Buffer> {
  if (src.startsWith("/api/tour-files/")) {
    const row = await prisma.tourFile.findUnique({ where: { id: src.split("/").pop()!.split("?")[0] }, select: { data: true, url: true } });
    if (row?.data) return Buffer.from(row.data);
    if (row?.url) src = row.url;
  } else if (src.startsWith("/")) {
    const file = path.join(process.cwd(), "public", decodeURIComponent(src.split("?")[0]));
    if (file.startsWith(path.join(process.cwd(), "public"))) {
      const local = await readFile(file).catch(() => null);
      if (local) return local;
    }
    const h = await headers();
    src = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}${src}`;
  }
  const res = await fetch(src, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Billedet kunne ikke hentes (${res.status}).`);
  return Buffer.from(await res.arrayBuffer());
}

/** The aspect ratios the model can make, as numbers - the closest one is asked for. */
const RATIOS = ["1:1", "3:2", "2:3", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"].map((r) => {
  const [a, b] = r.split(":").map(Number);
  return { r, v: a / b };
});

type GeminiAnswer = { ok: true; image: Buffer } | { ok: false; error: string };

/** One picture and a sentence to the image model - its new picture back. */
async function askGemini(key: string, jpeg: Buffer, ratio: string, request: string, part: boolean): Promise<GeminiAnswer> {
  const res = await fetch(`${API}/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    signal: AbortSignal.timeout(120_000),
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: `Ret dette foto${part ? " (et udsnit af et større billede)" : ""}. Ændring: ${request.trim()}\n\nBehold alt andet præcis som det er: samme udsnit, perspektiv, bygninger, veje og placeringer${part ? ", og helt de samme kanter" : ", så billedet stadig passer til punkter, der er sat på det"}. Det skal ligne et rigtigt foto, ikke en tegning. Tilføj ingen tekst eller logoer.`,
            },
            { inline_data: { mime_type: "image/jpeg", data: jpeg.toString("base64") } },
          ],
        },
      ],
      generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: ratio } },
    }),
  });
  const json = (await res.json().catch(() => null)) as {
    candidates?: { content?: { parts?: { inlineData?: { mimeType: string; data: string }; text?: string }[] }; finishReason?: string }[];
    error?: { message?: string };
  } | null;
  if (!res.ok) {
    if (res.status === 400 && /api key/i.test(json?.error?.message ?? "")) return { ok: false, error: "Gemini-nøglen virker ikke længere." };
    if (res.status === 429) return { ok: false, error: "Billed-AI'en har travlt eller har nået sin grænse - prøv igen om lidt." };
    return { ok: false, error: `Billed-AI'en svarede ${res.status}${json?.error?.message ? `: ${json.error.message}` : ""}.` };
  }
  const found = json?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!found?.inlineData) {
    const said = json?.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text;
    return { ok: false, error: said ? `Billed-AI'en lavede intet billede: ${said.slice(0, 200)}` : "Billed-AI'en lavede intet billede - prøv at formulere det anderledes." };
  }
  return { ok: true, image: Buffer.from(found.inlineData.data, "base64") };
}

/**
 * A picture changed by the image model. `view`: the picture is a 360° photo
 * and only the part seen in that view is changed - drawn out as a normal photo
 * (which the model understands), changed, and laid back in its place.
 */
export async function editTourImage(slug: string, src: string, request: string, view?: PanoView): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const user = await admin();
  const key = await geminiKey();
  if (!key) return { ok: false, error: "Billed-AI er ikke sat op endnu - indsæt en Gemini-nøgle." };
  if (!request.trim()) return { ok: false, error: "Skriv, hvad der skal ændres." };
  try {
    const original = await load(src);
    const meta = await sharp(original).metadata();
    const w = meta.width ?? 1600;
    const h = meta.height ?? 1000;
    let out: Buffer;
    let type: string;
    if (view && Math.abs(w / h - 2) < 0.05) {
      const v = { yaw: Number(view.yaw) || 0, pitch: Math.max(-89, Math.min(89, Number(view.pitch) || 0)), hfov: Math.max(25, Math.min(110, Number(view.hfov) || 70)) };
      const { data, info } = await sharp(original).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const vw = 1536;
      const vh = 1024;
      const before = renderView(data, info.width, info.height, v, vw, vh);
      const ai = await askGemini(key, await sharp(before, { raw: { width: vw, height: vh, channels: 3 } }).jpeg({ quality: 92 }).toBuffer(), "3:2", request, true);
      if (!ai.ok) return ai;
      const after = await sharp(ai.image).resize(vw, vh, { fit: "fill" }).removeAlpha().raw().toBuffer();
      // Only what the model changed goes back - the rest of the 360° photo is untouched.
      pasteView(data, info.width, info.height, after, await changeMask(before, after, vw, vh), v, vw, vh);
      out = await sharp(data, { raw: { width: info.width, height: info.height, channels: 3 } }).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
      type = "image/jpeg";
    } else {
      const ratio = RATIOS.reduce((best, x) => (Math.abs(Math.log(x.v / (w / h))) < Math.abs(Math.log(best.v / (w / h))) ? x : best)).r;
      // Sent as a JPEG of at most 2048 px - enough for the model, small enough to be quick.
      const input = await sharp(original).rotate().resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
      const ai = await askGemini(key, input, ratio, request, false);
      if (!ai.ok) return ai;
      // The original's exact size (points placed in % of it still sit right) - and its own sharpness wherever nothing changed.
      const merged = await keepSharpWhereUnchanged(original, ai.image);
      out = await sharp(merged.data, { raw: { width: merged.w, height: merged.h, channels: 3 } })
        .webp({ quality: 86 })
        .toBuffer();
      type = "image/webp";
    }
    const name = `ai-${path.basename(src.split("?")[0]).replace(/\.[a-z0-9]+$/i, "") || "billede"}`;
    const url = await storeTourFile(slug, name, type, out, src);
    await prisma.tourAiUsage
      .create({ data: { tourSlug: slug, userName: user.name, kind: "billede (Gemini)", inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0.04 } })
      .catch(() => {});
    return { ok: true, url };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
