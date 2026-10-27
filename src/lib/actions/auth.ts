"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { createSession, destroySession, getCurrentUser, safeNextPath } from "@/lib/auth";
import { isGoogleLoginRequired } from "@/lib/google-login";

export type LoginState = { error?: string } | undefined;

/*
 * Password guessing: after 8 wrong passwords for one e-mail, or 30 from one
 * address, within 15 minutes, logins pause there until the window has
 * passed. The same answer either way, so nobody learns which e-mails exist.
 */
const LOGIN_WINDOW_MS = 15 * 60_000;
const MAX_PER_EMAIL = 8;
const MAX_PER_IP = 30;
const PAUSED = "For mange forsøg - vent 15 minutter, og prøv igen.";

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

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0].trim() || "ukendt";
  const since = new Date(Date.now() - LOGIN_WINDOW_MS);
  const [byEmail, byIp] = await Promise.all([
    prisma.loginFailure.count({ where: { email, createdAt: { gte: since } } }),
    prisma.loginFailure.count({ where: { ip, createdAt: { gte: since } } }),
  ]);
  if (byEmail >= MAX_PER_EMAIL || byIp >= MAX_PER_IP) return { error: PAUSED };

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    await prisma.loginFailure.create({ data: { email, ip } });
    // Old failures are no use - cleared as we go, so the table stays small.
    await prisma.loginFailure.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 24 * 3600_000) } } });
    return { error: "Forkert e-mail eller adgangskode." };
  }

  await createSession(user.id, "password");
  redirect(safeNextPath(next));
}

export async function logout() {
  // The team lands on their own login again; customers on theirs.
  const staff = await getCurrentUser();
  await destroySession();
  redirect(staff ? "/login?next=/arpo" : "/login");
}
