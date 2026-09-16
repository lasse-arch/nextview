"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { recalcCommission } from "@/lib/commission-service";

export async function bulkUpdateSaleAmount(dealIds: string[], amountRaw: string) {
  await requireUser();
  if (dealIds.length === 0) throw new Error("Ingen deals valgt.");

  const amount = Math.round(parseFloat(amountRaw));
  if (isNaN(amount) || amount < 0) throw new Error("Angiv et gyldigt salgsbeløb.");

  await prisma.deal.updateMany({ where: { id: { in: dealIds } }, data: { saleAmount: amount } });
  for (const dealId of dealIds) {
    await recalcCommission(dealId);
  }

  revalidatePath("/deals");
  revalidatePath("/commission");
  return { updated: dealIds.length };
}

export async function bulkAddProduct(
  dealIds: string[],
  productType: string,
  amountRaw: string,
  isFree: boolean
) {
  await requireUser();
  if (dealIds.length === 0) throw new Error("Ingen deals valgt.");
  if (!productType) throw new Error("Vælg et produkt.");

  const amount = !isFree && amountRaw ? Math.round(parseFloat(amountRaw)) : null;

  await prisma.dealItem.createMany({
    data: dealIds.map((dealId) => ({ dealId, productType, amount, isFree })),
  });

  revalidatePath("/deals");
  for (const dealId of dealIds) {
    revalidatePath(`/deals/${dealId}`);
  }
  return { updated: dealIds.length };
}
