"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export async function addDealItem(
  dealId: string,
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();

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

  // Adding a visitkort item this way (rather than via a signed contract)
  // skips the usual signing automation that creates its delivery task, so
  // add one here too instead of leaving the delivery untracked.
  if (productType.toLowerCase() === "visitkort") {
    await prisma.task.create({ data: { title: "Aflever Visitkort", createdById: user.id, dealId } });
    revalidatePath("/opgaver");
  }

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

const MAX_IMAGE_DATA_URL_LENGTH = 2_000_000; // ~1.5MB of actual image data once base64-decoded

export async function updateDealItemImageAction(
  dealId: string,
  itemId: string,
  dataUrl: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireUser();

  if (!dataUrl) {
    await prisma.dealItem.update({ where: { id: itemId }, data: { imageUrl: null } });
    revalidatePath(`/deals/${dealId}`);
    revalidatePath("/kunder-live");
    return { ok: true };
  }

  if (!/^data:image\/(png|jpe?g|webp);base64,/.test(dataUrl)) {
    return { ok: false, error: "Ugyldigt billedformat." };
  }
  if (dataUrl.length > MAX_IMAGE_DATA_URL_LENGTH) {
    return { ok: false, error: "Billedet er for stort - prøv et mindre billede." };
  }

  await prisma.dealItem.update({ where: { id: itemId }, data: { imageUrl: dataUrl } });
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/kunder-live");
  return { ok: true };
}
