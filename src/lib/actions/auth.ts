"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { createSession, destroySession, endCustomerSessions, getCurrentCustomer, getCurrentUser, safeNextPath } from "@/lib/auth";
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

  const user = await prisma.user.findUnique({ where: { email }, omit: { passwordHash: false } });
  // A deactivated user gets the same answer as a wrong password.
  // An unknown e-mail is checked against a made-up hash too - so it takes as long, and the answer's speed can't tell who exists.
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok || user.disabledAt) {
    await prisma.loginFailure.create({ data: { email, ip } });
    // Old failures are no use - cleared as we go, so the table stays small.
    await prisma.loginFailure.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 24 * 3600_000) } } });
    return { error: "Forkert e-mail eller adgangskode." };
  }

  await createSession(user.id, "password");
  redirect(safeNextPath(next));
}

/** A bcrypt hash of nothing anyone types (cost 10, as real ones) - see login. */
const DUMMY_HASH = "$2b$10$.W0/lXu/Rkwf8vaziaveneDbBYp70xsd8GLLYi/XZM/UP2atv2eUC";

export async function logout() {
  // The team lands on their own login again; customers on theirs.
  const staff = await getCurrentUser();
  // A customer: every session of theirs ends (also a copied cookie on another device).
  const customer = staff ? null : await getCurrentCustomer();
  if (customer) await endCustomerSessions(customer.id);
  await destroySession();
  redirect(staff ? "/login?next=/arpo" : "/login");
}
