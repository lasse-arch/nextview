"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { recalcCommission } from "@/lib/commission-service";
import type { CommissionFrequency, Role } from "@prisma/client";

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
  const role = String(formData.get("role") || "SALES") as Role;
  const isCommissionBased = formData.get("isCommissionBased") === "on";
  const commissionRate = parseFloat(String(formData.get("commissionRate") || "0"));
  const payoutFrequency = String(formData.get("payoutFrequency") || "MONTHLY") as CommissionFrequency;

  if (!name || !email || !password) throw new Error("Navn, e-mail og adgangskode er påkrævet");

  const passwordHash = await hashPassword(password);

  await prisma.user.create({
    data: { name, email, passwordHash, role, isCommissionBased, commissionRate, payoutFrequency },
  });

  revalidatePath("/users");
}

export async function updateUser(userId: string, formData: FormData) {
  await requireAdmin();

  const name = String(formData.get("name") || "").trim();
  const role = String(formData.get("role") || "SALES") as Role;
  const isCommissionBased = formData.get("isCommissionBased") === "on";
  const commissionRate = parseFloat(String(formData.get("commissionRate") || "0"));
  const payoutFrequency = String(formData.get("payoutFrequency") || "MONTHLY") as CommissionFrequency;
  const newPassword = String(formData.get("newPassword") || "");
  const recalcExisting = formData.get("recalcExisting") === "on";

  const data: Record<string, unknown> = { name, role, isCommissionBased, commissionRate, payoutFrequency };
  if (newPassword) {
    data.passwordHash = await hashPassword(newPassword);
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

  revalidatePath("/users");
  revalidatePath("/deals");
  revalidatePath("/commission");
}
