"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { recalcCommission } from "@/lib/commission-service";
import type { CommissionFrequency, Role } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { TEAM_ROLES } from "@/lib/team-roles";

/** The roles from the form, checked - never trust the posted value. */
function rolesFrom(formData: FormData): { role: Role; extraRoles: Role[] } {
  const raw = String(formData.get("role") || "SALES");
  const role = (TEAM_ROLES as string[]).includes(raw) ? (raw as Role) : "SALES";
  // Extra roles: never ADMIN (only the main role can be that), never the main role again.
  const extraRoles = formData.getAll("extraRoles").map(String).filter((r): r is Role => (TEAM_ROLES as string[]).includes(r) && r !== "ADMIN" && r !== role);
  return { role, extraRoles: [...new Set(extraRoles)] };
}

async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Kun admin har adgang");
  return user;
}

export async function createUser(formData: FormData) {
  await requireAdmin();

  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const { role, extraRoles } = rolesFrom(formData);
  const isCommissionBased = formData.get("isCommissionBased") === "on";
  const canAccessBilling = formData.get("canAccessBilling") === "on";
  const commissionRate = parseFloat(String(formData.get("commissionRate") || "0"));
  const payoutFrequency = String(formData.get("payoutFrequency") || "MONTHLY") as CommissionFrequency;

  if (!name || !email) throw new Error("Navn og e-mail er påkrævet");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("E-mailen ser forkert ud");

  // No password: they log in with Google (same e-mail) - a long random one nobody knows keeps the password door shut.
  const passwordHash = await hashPassword(password || randomBytes(32).toString("base64url"));

  await prisma.user.create({
    data: { name, email, passwordHash, role, extraRoles, isCommissionBased, canAccessBilling, commissionRate, payoutFrequency },
  });

  revalidatePath("/arpo/users");
  redirect("/arpo/users?saved=Bruger%20oprettet");
}

export async function updateUser(userId: string, formData: FormData) {
  const me = await requireAdmin();

  const name = String(formData.get("name") || "").trim();
  const { role, extraRoles } = rolesFrom(formData);
  // An admin can't take their own admin away (nobody would be left to give it back).
  if (userId === me.id && role !== "ADMIN") throw new Error("Du kan ikke fjerne din egen admin-rolle");
  const isCommissionBased = formData.get("isCommissionBased") === "on";
  const canAccessBilling = formData.get("canAccessBilling") === "on";
  const commissionRate = parseFloat(String(formData.get("commissionRate") || "0"));
  const payoutFrequency = String(formData.get("payoutFrequency") || "MONTHLY") as CommissionFrequency;
  const newPassword = String(formData.get("newPassword") || "");
  const recalcExisting = formData.get("recalcExisting") === "on";

  const data: Record<string, unknown> = { name, role, extraRoles, isCommissionBased, canAccessBilling, commissionRate, payoutFrequency };
  if (newPassword) {
    data.passwordHash = await hashPassword(newPassword);
    // A new password ends every session made with the old one.
    data.sessionVersion = { increment: 1 };
  }

  await prisma.user.update({ where: { id: userId }, data });

  // Only touch existing deals' commissions if the admin explicitly asked to -
  // otherwise a settings change only affects deals saved from now on.
  if (recalcExisting) {
    const ownedDeals = await prisma.deal.findMany({
      where: { ownerId: userId, saleAmount: { not: null }, soldAt: { not: null } },
      select: { id: true },
    });
    for (const deal of ownedDeals) {
      await recalcCommission(deal.id);
    }
  }

  revalidatePath("/arpo/users");
  revalidatePath("/arpo/deals");
  revalidatePath("/arpo/commission");
  redirect("/arpo/users?saved=1");
}

/**
 * Deactivates a team member (left the company): no login, every session ends
 * at once, nothing of theirs is deleted (deals, notes and commission keep
 * their name). Admins only, and never yourself.
 */
export async function setUserActive(userId: string, active: boolean) {
  const me = await requireAdmin();
  if (userId === me.id) throw new Error("Du kan ikke deaktivere dig selv.");
  await prisma.user.update({ where: { id: userId }, data: active ? { disabledAt: null, sessionVersion: { increment: 1 } } : { disabledAt: new Date(), sessionVersion: { increment: 1 } } });
  revalidatePath("/arpo/users");
  redirect(`/arpo/users?saved=${encodeURIComponent(active ? "Genaktiveret" : "Deaktiveret - alle sessioner er afsluttet")}`);
}

/** Ends every session of a user (e.g. a lost phone) - they log in again. */
export async function endUserSessions(userId: string) {
  await requireAdmin();
  await prisma.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
  revalidatePath("/arpo/users");
  redirect(`/arpo/users?saved=${encodeURIComponent("Alle sessioner er afsluttet")}`);
}
