"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { createSession, destroySession, safeNextPath } from "@/lib/auth";
import { isGoogleLoginRequired } from "@/lib/google-login";

export type LoginState = { error?: string } | undefined;

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const next = String(formData.get("next") || "/");

  if (await isGoogleLoginRequired()) {
    return { error: "Log ind med Google - adgangskoder er slået fra." };
  }

  if (!email || !password) {
    return { error: "Udfyld e-mail og adgangskode." };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return { error: "Forkert e-mail eller adgangskode." };
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return { error: "Forkert e-mail eller adgangskode." };
  }

  await createSession(user.id, "password");
  redirect(safeNextPath(next));
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
