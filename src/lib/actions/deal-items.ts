"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export async function addDealItem(
  dealId: string,
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireUser();

  const location = String(formData.get("location") || "").trim() || null;
  const productType = String(formData.get("productType") || "").trim();
  const isFree = formData.get("isFree") === "on";
  const amountRaw = String(formData.get("amount") || "");
  const amount = !isFree && amountRaw ? Math.round(parseFloat(amountRaw)) : null;
  const url = String(formData.get("url") || "").trim() || null;

  if (!productType) return { ok: false, error: "Angiv en ydelse/produkt." };

  await prisma.dealItem.create({
    data: { dealId, location, productType, amount, isFree, url },
  });

  revalidatePath(`/deals/${dealId}`);
  return { ok: true };
}

export async function removeDealItem(dealId: string, itemId: string) {
  await requireUser();
  await prisma.dealItem.delete({ where: { id: itemId } });
  revalidatePath(`/deals/${dealId}`);
}

export async function updateDealItemUrl(dealId: string, itemId: string, url: string) {
  await requireUser();
  await prisma.dealItem.update({ where: { id: itemId }, data: { url: url.trim() || null } });
  revalidatePath(`/deals/${dealId}`);
}
