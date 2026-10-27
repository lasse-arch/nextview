"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { sendWelcomeMail, welcomeMailFor } from "@/lib/welcome-mail";

export async function previewWelcomeMail(dealId: string) {
  await requireUser();
  const { to, subject, bodyText } = await welcomeMailFor(dealId);
  return { to, subject, bodyText };
}

export async function sendWelcomeMailNow(dealId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  try {
    await sendWelcomeMail(dealId, user.id);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Velkomstmailen kunne ikke sendes." };
  }
  revalidatePath(`/arpo/deals/${dealId}`);
  return { ok: true };
}
