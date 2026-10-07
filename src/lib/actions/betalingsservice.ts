"use server";

import { revalidatePath } from "next/cache";
import type { PaymentMethod } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import {
  createBsTestDelivery,
  createBsDelivery,
  deleteBsDelivery,
  ensureBsCustomerNumber,
  importBsReturnFile,
  markBsDeliverySubmitted,
  retryBsPaymentRegistration,
} from "@/lib/betalingsservice/service";
import {
  MFT_DEFAULT_PORT,
  generateSftpKey,
  runSftpExchange,
  testSftpConnection,
} from "@/lib/betalingsservice/sftp";

const PAGE = "/settings/betalingsservice";

async function requireBillingUser() {
  const user = await requireUser();
  if (!user.canAccessBilling) throw new Error("Du har ikke adgang til fakturering.");
  return user;
}

function digits(value: FormDataEntryValue | null, length: number, label: string): string | null {
  const v = String(value ?? "").replace(/\s/g, "");
  if (!v) return null;
  if (!/^\d+$/.test(v) || v.length > length) throw new Error(`${label} skal være op til ${length} cifre.`);
  return v.padStart(length, "0");
}

export async function saveBsSettings(formData: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireBillingUser();
  try {
    const subsystem = String(formData.get("subsystem") || "BS1").trim().toUpperCase();
    if (!/^[A-Z0-9]{3}$/.test(subsystem)) throw new Error("Delsystem skal være 3 tegn, fx BS1.");
    const accountRaw = String(formData.get("depositAccountNumber") || "").trim();
    const depositAccountNumber = accountRaw ? Number(accountRaw) : null;
    if (accountRaw && (!Number.isInteger(depositAccountNumber) || depositAccountNumber! <= 0)) {
      throw new Error("Kontonummeret skal være et helt tal, fx 5820.");
    }
    const data = {
      dataSupplierNumber: digits(formData.get("dataSupplierNumber"), 8, "Dataleverandørnummer"),
      pbsNumber: digits(formData.get("pbsNumber"), 8, "PBS-nummer"),
      debtorGroupNumber: digits(formData.get("debtorGroupNumber"), 5, "Debitorgruppenummer"),
      subsystem,
      depositAccountNumber,
    };
    await prisma.bsSettings.upsert({ where: { id: "default" }, create: { id: "default", ...data }, update: data });
    revalidatePath(PAGE);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Kunne ikke gemme." };
  }
}

/** Switches how a customer pays. Moving to Betalingsservice gives it its customer number;
 * only invoices created from then on are collected through Betalingsservice. */
export async function setDealPaymentMethod(dealId: string, method: PaymentMethod) {
  await requireBillingUser();
  if (method === "BETALINGSSERVICE") await ensureBsCustomerNumber(dealId);
  await prisma.deal.update({ where: { id: dealId }, data: { paymentMethod: method } });
  revalidatePath(`/deals/${dealId}`);
  revalidatePath(PAGE);
}

export async function createBsDeliveryAction() {
  const user = await requireBillingUser();
  const result = await createBsDelivery(user.id);
  revalidatePath(PAGE);
  return result;
}

export async function deleteBsDeliveryAction(deliveryId: string) {
  await requireBillingUser();
  const result = await deleteBsDelivery(deliveryId);
  revalidatePath(PAGE);
  return result;
}

export async function markBsDeliverySubmittedAction(deliveryId: string, submitted: boolean) {
  await requireBillingUser();
  await markBsDeliverySubmitted(deliveryId, submitted);
  revalidatePath(PAGE);
}

export async function importBsReturnFileAction(formData: FormData) {
  const user = await requireBillingUser();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false as const, error: "Vælg en fil." };
  if (file.size > 20 * 1024 * 1024) return { ok: false as const, error: "Filen er for stor." };
  const result = await importBsReturnFile(file.name, Buffer.from(await file.arrayBuffer()), user.id);
  revalidatePath(PAGE);
  revalidatePath("/settings/betaling");
  return result;
}

export async function retryBsPaymentRegistrationAction(collectionId: string) {
  await requireBillingUser();
  const lines = await retryBsPaymentRegistration(collectionId);
  revalidatePath(PAGE);
  return lines;
}

export async function saveBsSftpSettings(formData: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireBillingUser();
  const sftpUser = String(formData.get("sftpUser") || "").trim() || null;
  const sftpHost = String(formData.get("sftpHost") || "").trim() || null;
  const portRaw = Number(formData.get("sftpPort") || MFT_DEFAULT_PORT);
  if (!Number.isInteger(portRaw) || portRaw <= 0 || portRaw > 65535) return { ok: false, error: "Ugyldig port." };
  const autoSend = formData.get("autoSend") === "on";
  await prisma.bsSettings.upsert({
    where: { id: "default" },
    create: { id: "default", sftpUser, sftpHost, sftpPort: portRaw, autoSend },
    update: { sftpUser, sftpHost, sftpPort: portRaw, autoSend },
  });
  revalidatePath(PAGE);
  return { ok: true };
}

export async function generateSftpKeyAction() {
  await requireBillingUser();
  const publicKey = await generateSftpKey();
  revalidatePath(PAGE);
  return publicKey;
}

export async function testSftpConnectionAction() {
  await requireBillingUser();
  return testSftpConnection();
}

export async function runSftpExchangeAction() {
  await requireBillingUser();
  const result = await runSftpExchange();
  revalidatePath(PAGE);
  return result;
}

/** Queues a generated file for the next SFTP exchange and runs it right away. */
export async function sendBsDeliveryViaSftpAction(deliveryId: string) {
  await requireBillingUser();
  await prisma.bsDelivery.update({ where: { id: deliveryId }, data: { sendViaSftp: true, sftpError: null } });
  const result = await runSftpExchange();
  revalidatePath(PAGE);
  return result;
}

/** Admin only: a BS 0601 file with fictive customers for Mastercard's test (delsystem KR9). */
export async function createBsTestDeliveryAction() {
  const user = await requireBillingUser();
  if (user.role !== "ADMIN") throw new Error("Kun administratorer kan lave en testfil.");
  const result = await createBsTestDelivery(user.id);
  revalidatePath(PAGE);
  return result;
}

export async function saveBsInvoiceTemplate(templateId: string | null) {
  await requireBillingUser();
  await prisma.bsSettings.upsert({
    where: { id: "default" },
    create: { id: "default", dineroInvoiceTemplateId: templateId || null },
    update: { dineroInvoiceTemplateId: templateId || null },
  });
  revalidatePath(PAGE);
}
