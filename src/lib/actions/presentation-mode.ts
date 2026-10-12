"use server";

import { requireUser } from "@/lib/auth";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { PRESENTATION_MODE_COOKIE } from "@/lib/presentation-mode";

export async function setPresentationMode(enabled: boolean) {
  await requireUser();
  const store = await cookies();
  store.set(PRESENTATION_MODE_COOKIE, enabled ? "1" : "0", {
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  revalidatePath("/", "layout");
}
