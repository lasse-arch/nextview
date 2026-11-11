"use server";

import { revalidatePath } from "next/cache";
import { getCurrentCustomer } from "@/lib/auth";
import { inviteUser, removeUser, type InviteInput } from "@/lib/portal-users";
import { adminPreview } from "@/lib/portal-admin";

/*
 * Brugere on /kunde - the logged-in customer, or (only without a customer
 * session) an admin on "Se som kunde" (`som`), who may do what an owner may;
 * every rule is checked in src/lib/portal-users.ts.
 */
async function actorOf(som?: string) {
  const me = await getCurrentCustomer();
  if (me) return me;
  const admin = await adminPreview(som);
  return admin ? { id: admin.user.id, email: admin.user.email, name: admin.user.name, deals: admin.dealIds.map((dealId) => ({ dealId, role: "OWNER" as const, canApprove: true })), admin: true as const } : null;
}

export async function portalInvite(input: InviteInput, som?: string) {
  const me = await actorOf(som);
  if (!me) return { ok: false as const, error: "Kun kunden selv kan invitere her." };
  const r = await inviteUser(me, input);
  revalidatePath("/kunde");
  return r;
}

export async function portalRemoveUser(accountId: string, som?: string) {
  const me = await actorOf(som);
  if (!me) return { ok: false as const, error: "Kun kunden selv kan fjerne brugere her." };
  const r = await removeUser(me, accountId);
  revalidatePath("/kunde");
  return r;
}
