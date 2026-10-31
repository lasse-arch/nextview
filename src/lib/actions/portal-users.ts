"use server";

import { revalidatePath } from "next/cache";
import { getCurrentCustomer } from "@/lib/auth";
import { inviteUser, removeUser, type InviteInput } from "@/lib/portal-users";

/*
 * Brugere on /kunde - only the logged-in customer acts here (never an admin
 * looking as the customer); every rule is checked in src/lib/portal-users.ts.
 */
export async function portalInvite(input: InviteInput) {
  const me = await getCurrentCustomer();
  if (!me) return { ok: false as const, error: "Kun kunden selv kan invitere her." };
  const r = await inviteUser(me, input);
  revalidatePath("/kunde");
  return r;
}

export async function portalRemoveUser(accountId: string) {
  const me = await getCurrentCustomer();
  if (!me) return { ok: false as const, error: "Kun kunden selv kan fjerne brugere her." };
  const r = await removeUser(me, accountId);
  revalidatePath("/kunde");
  return r;
}
