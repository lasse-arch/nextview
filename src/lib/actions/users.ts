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
import { onOurDomain, resetWorkspacePassword, setWorkspaceSuspended, signOutWorkspaceUser, workspaceReady, workspaceState } from "@/lib/google-workspace";
import { WORKSPACE_MAIL_APPROVED, sendWorkspaceMail } from "@/lib/workspace-mail";

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
  const u = await prisma.user.update({ where: { id: userId }, data: active ? { disabledAt: null, sessionVersion: { increment: 1 } } : { disabledAt: new Date(), sessionVersion: { increment: 1 } } });
  // The Google account follows (when Arpo manages it) - so a person is closed out of everything from here.
  let google = "";
  if (workspaceReady() && onOurDomain(u.email)) {
    const state = await workspaceState(u.email);
    if (state.state === "active" || state.state === "suspended") {
      try {
        await setWorkspaceSuspended(u.email, !active);
        google = active ? " - Google-kontoen er åben igen" : " - Google-kontoen er lukket";
      } catch (err) {
        google = ` - men Google: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
  }
  revalidatePath("/arpo/users");
  redirect(`/arpo/users?saved=${encodeURIComponent((active ? "Genaktiveret" : "Deaktiveret - alle sessioner er afsluttet") + google)}`);
}

/** The person's own e-mail (from HR) - where a new Google password may go. Never the work mailbox they can't open. */
async function ownEmailOf(userId: string): Promise<string | null> {
  const e = await prisma.employee.findUnique({ where: { userId }, select: { privateEmail: true } });
  return e?.privateEmail && !onOurDomain(e.privateEmail) ? e.privateEmail : null;
}

/** "Nulstil adgangskode": a new first password for the Google account, mailed to the person's own e-mail. */
export async function resetGooglePassword(userId: string) {
  const me = await requireAdmin();
  if (userId === me.id) throw new Error("Din egen adgangskode skifter du i Google.");
  if (!WORKSPACE_MAIL_APPROVED) throw new Error("Mailen med den nye adgangskode er ikke godkendt endnu.");
  if (!workspaceReady()) throw new Error("Google Workspace er ikke sat op i Arpo endnu.");
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
  if (!u) throw new Error("Brugeren findes ikke.");
  const to = await ownEmailOf(userId);
  if (!to) throw new Error("Der er ingen privat e-mail at sende den nye adgangskode til - skriv den på medarbejderens kort i HR.");
  const { password } = await resetWorkspacePassword(u.email);
  let msg = `Ny adgangskode til ${u.email} er sendt til ${to} - de vælger deres egen ved næste login`;
  try {
    await sendWorkspaceMail("reset", to, u.name, u.email, password);
  } catch (err) {
    // The password is never shown or kept - press again when mail works.
    console.error("[users] mail med ny adgangskode fejlede", err instanceof Error ? err.message : err);
    msg = `Adgangskoden er nulstillet, men mailen kunne ikke sendes - prøv igen`;
  }
  console.info(`[users] ${me.email} nulstillede Google-adgangskoden for ${u.email}`);
  revalidatePath("/arpo/users");
  redirect(`/arpo/users?saved=${encodeURIComponent(msg)}`);
}

/** Signs the person out of Google everywhere and ends their Arpo sessions (a lost phone or laptop). */
export async function signOutGoogle(userId: string) {
  const me = await requireAdmin();
  if (!workspaceReady()) throw new Error("Google Workspace er ikke sat op i Arpo endnu.");
  const u = await prisma.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } }, select: { email: true } });
  await signOutWorkspaceUser(u.email);
  console.info(`[users] ${me.email} loggede ${u.email} ud af Google`);
  revalidatePath("/arpo/users");
  redirect(`/arpo/users?saved=${encodeURIComponent(`${u.email} er logget ud af Google og Arpo overalt`)}`);
}

/** Ends every session of a user (e.g. a lost phone) - they log in again. */
export async function endUserSessions(userId: string) {
  await requireAdmin();
  await prisma.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
  revalidatePath("/arpo/users");
  redirect(`/arpo/users?saved=${encodeURIComponent("Alle sessioner er afsluttet")}`);
}
