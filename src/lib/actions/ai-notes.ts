"use server";

import { revalidatePath } from "next/cache";
import { startOfDay } from "date-fns";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { suggestNoteFromEmail } from "@/lib/ai-note-suggestion";

const AI_NOTE_KIND = "EMAIL_NOTE_SUGGESTION";
/** Team-wide cap, not per-seller - this is a cost guard against runaway/
 * accidental use, not a real per-person quota. Comfortably above realistic
 * manual "click this on one e-mail" usage for a small team. */
const AI_NOTE_DAILY_LIMIT = 50;

async function checkAiNoteLimit(): Promise<{ ok: true } | { ok: false; error: string }> {
  const usedToday = await prisma.aiUsageEvent.count({
    where: { kind: AI_NOTE_KIND, createdAt: { gte: startOfDay(new Date()) } },
  });
  if (usedToday >= AI_NOTE_DAILY_LIMIT) {
    return { ok: false, error: `Dagens loft på ${AI_NOTE_DAILY_LIMIT} AI-referater er nået. Prøv igen i morgen.` };
  }
  return { ok: true };
}

/**
 * "AI-referat" on an e-mail row - asks Claude to turn that one e-mail into a
 * short, editable note suggestion. Doesn't save anything itself; the caller
 * shows the suggestion for review/editing and only saves it (via
 * saveEmailNoteSuggestion below) once the seller confirms it's worth keeping.
 * Capped at AI_NOTE_DAILY_LIMIT successful calls per day (team-wide) as a
 * guard against runaway API cost - only calls that actually reached and
 * billed against the provider count towards it.
 */
export async function suggestNoteFromEmailAction(
  emailId: string
): Promise<{ ok: true; suggestion: string } | { ok: false; error: string }> {
  await requireUser();

  const limitCheck = await checkAiNoteLimit();
  if (!limitCheck.ok) return limitCheck;

  const email = await prisma.emailMessage.findUniqueOrThrow({ where: { id: emailId } });
  const result = await suggestNoteFromEmail(email);
  if (result.ok) {
    await prisma.aiUsageEvent.create({ data: { kind: AI_NOTE_KIND } });
  }
  return result;
}

/** Saves an (optionally seller-edited) AI note suggestion as a real note on the deal. */
export async function saveEmailNoteSuggestion(
  dealId: string,
  body: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: "Noten er tom." };

  await prisma.note.create({
    data: { dealId, authorId: user.id, body: trimmed, kind: "AI_EMAIL" },
  });

  revalidatePath(`/deals/${dealId}`);
  return { ok: true };
}
