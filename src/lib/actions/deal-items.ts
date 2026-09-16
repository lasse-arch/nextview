"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export async function addDealItem(dealId: string, formData: FormData) {
  await requireUser();

  const location = String(formData.get("location") || "").trim() || null;
  const productType = String(formData.get("productType") || "").trim();
  const isFree = formData.get("isFree") === "on";
  const amountRaw = String(formData.get("amount") || "");
  const amount = !isFree && amountRaw ? Math.round(parseFloat(amountRaw)) : null;

  if (!productType) throw new Error("Angiv en ydelse/produkt.");

  await prisma.dealItem.create({
    data: { dealId, location, productType, amount, isFree },
  });

  revalidatePath(`/deals/${dealId}`);
  redirect(`/deals/${dealId}?saved=Tilf%C3%B8jelse%20gemt`);
}

export async function removeDealItem(dealId: string, itemId: string) {
  await requireUser();
  await prisma.dealItem.delete({ where: { id: itemId } });
  revalidatePath(`/deals/${dealId}`);
}
