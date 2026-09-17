"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { recalcCommission } from "@/lib/commission-service";
import { createDuplicateDealRecord } from "@/lib/actions/deals";

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

export async function bulkUpdateBindingMonths(dealIds: string[], monthsRaw: string) {
  await requireUser();
  if (dealIds.length === 0) throw new Error("Ingen deals valgt.");

  const months = parseInt(monthsRaw, 10);
  if (isNaN(months) || months <= 0) throw new Error("Angiv en gyldig bindingsperiode (måneder).");

  await prisma.deal.updateMany({ where: { id: { in: dealIds } }, data: { bindingMonths: months } });
  for (const dealId of dealIds) {
    await recalcCommission(dealId);
  }

  revalidatePath("/deals");
  revalidatePath("/commission");
  return { updated: dealIds.length };
}

export async function bulkDuplicateDeals(dealIds: string[]) {
  await requireUser();
  if (dealIds.length === 0) throw new Error("Ingen deals valgt.");

  for (const dealId of dealIds) {
    await createDuplicateDealRecord(dealId);
  }

  revalidatePath("/deals");
  return { duplicated: dealIds.length };
}

export async function bulkSetOwner(dealIds: string[], ownerId: string) {
  await requireUser();
  if (dealIds.length === 0) throw new Error("Ingen deals valgt.");
  if (!ownerId) throw new Error("Vælg en ejer.");

  await prisma.deal.updateMany({ where: { id: { in: dealIds } }, data: { ownerId } });

  revalidatePath("/deals");
  return { updated: dealIds.length };
}

export async function bulkSetSoldProduct(dealIds: string[], products: string[]) {
  await requireUser();
  if (dealIds.length === 0) throw new Error("Ingen deals valgt.");

  await prisma.deal.updateMany({
    where: { id: { in: dealIds } },
    data: { soldProduct: products.length > 0 ? products.join(", ") : null },
  });

  revalidatePath("/deals");
  for (const dealId of dealIds) {
    revalidatePath(`/deals/${dealId}`);
  }
  return { updated: dealIds.length };
}

// companyName is intentionally excluded - it's a required field on Deal and can't be cleared to null.
const STRIPPABLE_FIELDS = ["address", "contactEmail", "contactName", "displayName"] as const;
export type StrippableField = (typeof STRIPPABLE_FIELDS)[number];

/**
 * Clears a field on selected deals wherever it currently contains a URL -
 * a cleanup for imports where a link ended up in the wrong column (e.g. an
 * address or e-mail column that actually held a website link).
 */
export async function bulkStripUrlFromField(dealIds: string[], field: StrippableField) {
  await requireUser();
  if (dealIds.length === 0) throw new Error("Ingen deals valgt.");
  if (!STRIPPABLE_FIELDS.includes(field)) throw new Error("Ugyldigt felt.");

  const result = await prisma.deal.updateMany({
    where: { id: { in: dealIds }, [field]: { contains: "http" } },
    data: { [field]: null },
  });

  revalidatePath("/deals");
  return { updated: result.count };
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
