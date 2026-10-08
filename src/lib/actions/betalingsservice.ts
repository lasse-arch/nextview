"use server";

import { revalidatePath } from "next/cache";
import type { PaymentMethod } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createPreviewInvoiceDrafts, isDineroConfigured } from "@/lib/dinero";
import { invoiceTerms } from "@/lib/invoice-service";
import { previewSignupMail, sendSignupMails } from "@/lib/betalingsservice/signup-mail";
import { BS_SIGNUP_TEMPLATE } from "@/lib/email-templates";
import { requireUser } from "@/lib/auth";
import {
  createBsTestDelivery,
  createBsDelivery,
  deleteBsDelivery,
  ensureBsCustomerNumber,
  importBsReturnFile,
  markBsDeliverySubmitted,
  retryBsPaymentRegistration,
  switchAllCustomersToBs,
  getBsSettings,
} from "@/lib/betalingsservice/service";
import {
  MFT_DEFAULT_PORT,
  generateSftpKey,
  runSftpExchange,
  testSftpConnection,
  type SftpRunResult,
} from "@/lib/betalingsservice/sftp";
import { createRelayToken, relayCloudConfig } from "@/lib/betalingsservice/relay";
import { getAppBaseUrl } from "@/lib/email-oauth";

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

/** The one-off move of every existing customer to Betalingsservice. */
export async function switchAllCustomersToBsAction() {
  await requireBillingUser();
  const result = await switchAllCustomersToBs();
  revalidatePath(PAGE);
  return result;
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

/** Through the relay server, an exchange is asked for and happens at its next check-in. */
async function requestRelayExchange(): Promise<SftpRunResult | null> {
  const s = await getBsSettings();
  if (!s.relayTokenHash) return null;
  await prisma.bsSettings.update({ where: { id: "default" }, data: { relayExchangeRequestedAt: new Date() } });
  revalidatePath(PAGE);
  return {
    ok: true,
    lines: ["Bestilt - serveren forbinder til Mastercard inden for 5 minutter. Genindlæs siden for at se resultatet."],
  };
}

export async function testSftpConnectionAction() {
  await requireBillingUser();
  return (await requestRelayExchange()) ?? testSftpConnection();
}

export async function runSftpExchangeAction() {
  await requireBillingUser();
  const relayed = await requestRelayExchange();
  if (relayed) return relayed;
  const result = await runSftpExchange();
  revalidatePath(PAGE);
  return result;
}

/** Queues a generated file for the next SFTP exchange and runs it right away. */
export async function sendBsDeliveryViaSftpAction(deliveryId: string) {
  await requireBillingUser();
  await prisma.bsDelivery.update({ where: { id: deliveryId }, data: { sendViaSftp: true, sftpError: null } });
  const relayed = await requestRelayExchange();
  if (relayed) return relayed;
  const result = await runSftpExchange();
  revalidatePath(PAGE);
  return result;
}

/** Admin only: a new relay token and the server's setup (cloud-init), shown once. */
export async function createRelaySetupAction(): Promise<{ ok: true; cloudConfig: string } | { ok: false; error: string }> {
  try {
    const user = await requireBillingUser();
    if (user.role !== "ADMIN") throw new Error("Kun administratorer kan sætte serveren op.");
    const token = await createRelayToken();
    revalidatePath(PAGE);
    return { ok: true, cloudConfig: relayCloudConfig(getAppBaseUrl(), token) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Kunne ikke lave opsætningen." };
  }
}

/** Admin only: stop using the relay server (its token stops working). */
export async function disconnectRelayAction() {
  const user = await requireBillingUser();
  if (user.role !== "ADMIN") throw new Error("Kun administratorer kan fjerne serveren.");
  await prisma.bsSettings.update({
    where: { id: "default" },
    data: { relayTokenHash: null, relayPublicKey: null, relayIp: null, relayLastSeenAt: null, relayExchangeRequestedAt: null },
  });
  revalidatePath(PAGE);
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

/**
 * Admin only: two invoice drafts in the real Dinero (never booked or sent),
 * made out to our own company, to check the layout - one collected via
 * Betalingsservice (the chosen template, "not signed up" notice) and one
 * normal invoice (default template with the FI code, sign-up text).
 */
export async function createBsPreviewDraftsAction(): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  try {
    const user = await requireBillingUser();
    if (user.role !== "ADMIN") throw new Error("Kun administratorer kan lave prøvekladder.");
    if (!(await isDineroConfigured())) throw new Error("Dinero er ikke sat op.");
    const settings = await prisma.bsSettings.findUnique({ where: { id: "default" } });
    if (!settings?.pbsNumber || !settings.debtorGroupNumber) throw new Error("Udfyld PBS-nr. og debitorgruppe under Aftale først.");
    const info = {
      mandateActive: false,
      customerNumber: "NV00000",
      pbsNumber: settings.pbsNumber,
      debtorGroupNumber: settings.debtorGroupNumber,
      signupLink: settings.signupLink,
    };
    const now = new Date();
    const nextQuarter = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 + 3, 1);
    const lines = [{ description: "PRØVEKLADDE - slet mig (Nextview360 Tour)", amount: 3000 }];
    const bs = invoiceTerms("BETALINGSSERVICE", 2, nextQuarter, "da", now, info);
    const normal = invoiceTerms("INVOICE", 0, now, "da", now, info);
    const created = await createPreviewInvoiceDrafts({ name: "Nextview360 ApS", cvr: "46452445" }, [
      {
        note: `${bs.noteSuffix}\n\nPRØVEKLADDE (Betalingsservice) - slet mig`,
        lines,
        invoiceDate: bs.invoiceDate,
        paymentDays: bs.paymentDays,
        collectedViaBetalingsservice: true,
        invoiceTemplateId: settings.dineroInvoiceTemplateId,
      },
      {
        note: `${normal.noteSuffix}\n\nPRØVEKLADDE (almindelig faktura) - slet mig`,
        lines,
        invoiceDate: normal.invoiceDate,
        paymentDays: normal.paymentDays,
      },
    ]);
    return { ok: true, count: created.length };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Kunne ikke lave prøvekladder." };
  }
}

/** The BS Tilmeldingslink from Mastercard Connect (BS Customer Portal). */
export async function saveBsSignupLink(link: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const user = await requireBillingUser();
    const value = link.trim();
    if (value && !/^https:\/\/\S+$/i.test(value)) throw new Error("Linket skal starte med https://");
    await prisma.bsSettings.upsert({
      where: { id: "default" },
      create: { id: "default", signupLink: value || null },
      update: { signupLink: value || null },
    });
    // A ready-made e-mail template for sending the link from a deal - made
    // once, the first time a link is saved; edit or delete it like any other.
    if (value && !(await prisma.emailTemplate.findFirst({ where: { name: BS_SIGNUP_TEMPLATE.name } }))) {
      await prisma.emailTemplate.create({ data: { ...BS_SIGNUP_TEMPLATE, createdById: user.id } });
    }
    revalidatePath(PAGE);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Kunne ikke gemme linket." };
  }
}

export async function previewSignupMailAction() {
  await requireBillingUser();
  return previewSignupMail();
}

/** Sends the sign-up e-mail - to one customer, or the next batch of those who haven't had it. */
export async function sendSignupMailsAction(
  dealId?: string
): Promise<{ ok: true; sent: number; failed: { name: string; error: string }[]; remaining: number } | { ok: false; error: string }> {
  try {
    await requireBillingUser();
    const result = await sendSignupMails(dealId);
    revalidatePath(PAGE);
    return { ok: true, ...result };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Kunne ikke sende mails." };
  }
}
