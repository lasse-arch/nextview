"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { suggestNoteFromEmail } from "@/lib/ai-note-suggestion";

/**
 * "AI-referat" on an e-mail row - asks Claude to turn that one e-mail into a
 * short, editable note suggestion. Doesn't save anything itself; the caller
 * shows the suggestion for review/editing and only saves it (via
 * saveEmailNoteSuggestion below) once the seller confirms it's worth keeping.
 */
export async function suggestNoteFromEmailAction(
  emailId: string
): Promise<{ ok: true; suggestion: string } | { ok: false; error: string }> {
  await requireUser();
  const email = await prisma.emailMessage.findUniqueOrThrow({ where: { id: emailId } });
  return suggestNoteFromEmail(email);
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
