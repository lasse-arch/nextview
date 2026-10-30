"use server";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { elevenLabsReady, listVoices, speak, type Voice } from "@/lib/elevenlabs";
import { storeTourFile } from "@/lib/tour-files";

/* "Lav lyd" in the tour editor: ElevenLabs reads a guided tour's stops aloud - admins only (it costs credits). */

async function admin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Kun admin kan redigere tours.");
}

export async function voiceOptions(): Promise<{ ok: true; voices: Voice[] } | { ok: false; error: string; setup?: true }> {
  await admin();
  if (!elevenLabsReady()) return { ok: false, setup: true, error: "ElevenLabs er ikke sat op endnu: læg ELEVENLABS_API_KEY i Vercel (Text to Speech: Access, Voices: Read)." };
  try {
    return { ok: true, voices: await listVoices() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** One stop's voice: the text read by the tour's voice, kept with the tour's files - the editor puts it on the stop. */
export async function makeStopVoice(slug: string, voiceId: string, title: string, text: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  await admin();
  if (!(await prisma.tour.findUnique({ where: { slug }, select: { slug: true } }))) return { ok: false, error: "Touren findes ikke." };
  try {
    const mp3 = await speak(String(voiceId), String(text));
    const name = `stemme-${String(title).toLowerCase().replace(/[^a-z0-9æøå]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "stop"}.mp3`;
    return { ok: true, url: await storeTourFile(slug, name, "audio/mpeg", mp3) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
