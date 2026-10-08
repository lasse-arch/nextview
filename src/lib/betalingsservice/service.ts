/**
 * Betalingsservice as its own data supplier: the CRM builds the BS 0601
 * collection file from the Dinero invoices of customers set to pay through
 * Betalingsservice, and reads back BS 0602 (payments) and BS 0603 (mandates)
 * to mark invoices paid - registering each payment in Dinero against the
 * Betalingsservice mellemregningskonto - and keep mandates up to date.
 *
 * Files go to and from Betalingsservice by hand (MFT HTTPS needs MitID
 * Erhverv in a browser), so this only ever produces/consumes the files.
 *
 * Double-billing guards:
 * - only invoices created for a Betalingsservice customer (Invoice.collectViaBs,
 *   due on the collection date with "betal ikke via bankoverførsel") are collected;
 * - an invoice is in at most one collection (bsCollectionId, claimed atomically);
 * - a Dinero payment is registered at most once per invoice (bsPaymentRegisteredAt);
 * - the same result file can't be imported twice (BsReturnImport.contentHash).
 */
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { dealName } from "@/lib/labels";
import { isDineroTestMode } from "@/lib/integration-settings";
import { getInvoicePaymentStatus, getInvoiceTotals, registerInvoicePayment } from "@/lib/dinero";
import { buildBs0601, type Bs0601Collection } from "./bs0601";
import { parseBsReturnDelivery, type BsPayment } from "./bs-returns";
import { BsFormatError } from "./fixed-width";
import { deliveryDeadline, firstBankingDayOfMonth, nextBankingDayOnOrAfter, utcDay } from "./banking-days";

const MAX_DAYS_AHEAD = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

export async function getBsSettings() {
  return prisma.bsSettings.upsert({ where: { id: "default" }, create: { id: "default" }, update: {} });
}

type BsSettingsRow = Awaited<ReturnType<typeof getBsSettings>>;

export function missingBsSettings(s: BsSettingsRow): string[] {
  const missing: string[] = [];
  if (!s.dataSupplierNumber) missing.push("dataleverandørnummer");
  if (!s.pbsNumber) missing.push("PBS-nummer");
  if (!s.debtorGroupNumber) missing.push("debitorgruppenummer");
  if (!s.depositAccountNumber) missing.push("mellemregningskonto i Dinero");
  return missing;
}

/** Gives the deal its permanent Betalingsservice customer number (NV00001, ...) if it has none yet. */
export async function ensureBsCustomerNumber(dealId: string): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const deal = await tx.deal.findUniqueOrThrow({ where: { id: dealId }, select: { bsCustomerNumber: true } });
    if (deal.bsCustomerNumber) return deal.bsCustomerNumber;
    await tx.bsSettings.upsert({ where: { id: "default" }, create: { id: "default" }, update: {} });
    const settings = await tx.bsSettings.update({
      where: { id: "default" },
      data: { nextCustomerNumber: { increment: 1 } },
    });
    const customerNumber = `NV${String(settings.nextCustomerNumber - 1).padStart(5, "0")}`;
    await tx.deal.update({ where: { id: dealId }, data: { bsCustomerNumber: customerNumber } });
    return customerNumber;
  });
}

const CUSTOMER_STAGES = ["CONTRACT_SIGNED", "FILMED", "LIVE"] as const;

/** Deals the one-off "move everyone to Betalingsservice" would switch:
 * every deal still on normal invoices, except churned and lost ones. */
const switchableDealsWhere = {
  paymentMethod: "INVOICE" as const,
  churnedAt: null,
  // EAN customers (public institutions) get e-invoices - never Betalingsservice.
  eanNumber: null,
  stage: { not: "LOST" as const },
};

export async function countSwitchableDeals(): Promise<{ customers: number; other: number }> {
  const [customers, all] = await Promise.all([
    prisma.deal.count({ where: { ...switchableDealsWhere, stage: { in: [...CUSTOMER_STAGES] } } }),
    prisma.deal.count({ where: switchableDealsWhere }),
  ]);
  return { customers, other: all - customers };
}

/**
 * Moves every existing customer (and every open deal, so it's on
 * Betalingsservice once signed) to Betalingsservice and gives each customer
 * its customer number. Done once: afterwards a customer set back to normal
 * invoices on the deal page stays that way.
 */
export async function switchAllCustomersToBs(): Promise<{ switched: number }> {
  const deals = await prisma.deal.findMany({ where: switchableDealsWhere, select: { id: true, stage: true } });
  for (const deal of deals) {
    if ((CUSTOMER_STAGES as readonly string[]).includes(deal.stage)) await ensureBsCustomerNumber(deal.id);
  }
  await prisma.$transaction([
    prisma.deal.updateMany({ where: { id: { in: deals.map((d) => d.id) } }, data: { paymentMethod: "BETALINGSSERVICE" } }),
    prisma.bsSettings.upsert({
      where: { id: "default" },
      create: { id: "default", allCustomersSwitchedAt: new Date() },
      update: { allCustomersSwitchedAt: new Date() },
    }),
  ]);
  return { switched: deals.length };
}

/** "Centralgårdsvej 121, 9440 Aabybro" -> street + 4-digit postcode. */
export function splitDanishAddress(address: string | null): { street: string | null; postalCode: string | null } {
  if (!address) return { street: null, postalCode: null };
  const match = address.match(/^(.*?)[,\s]+(\d{4})\s+\S.*$/);
  if (!match) return { street: address.trim() || null, postalCode: null };
  return { street: match[1].trim() || null, postalCode: match[2] };
}

const bsDealFields = {
  id: true,
  companyName: true,
  displayName: true,
  cvrNumber: true,
  address: true,
  parentDealId: true,
  bsCustomerNumber: true,
  bsMandateNumber: true,
  bsMandateStatus: true,
} as const;

type BsDeal = Prisma.DealGetPayload<{ select: typeof bsDealFields }>;

const pendingInvoiceInclude = {
  deal: {
    select: { ...bsDealFields, parent: { select: { ...bsDealFields, combinedInvoicing: true } } },
  },
} as const;

function sameCvr(a: string | null, b: string | null): boolean {
  const clean = (v: string | null) => (v ?? "").replace(/\D/g, "");
  return Boolean(clean(a)) && clean(a) === clean(b);
}

/**
 * The deal whose Betalingsservice customer number and mandate pay for this
 * one. A branch billed together with its parent (combined invoicing, same
 * CVR - see Deal.combinedInvoicing) always pays through the parent, even
 * when one of its invoices happens to go out on its own: the customer signs
 * up once, for the whole company.
 */
export function bsPayerOf(deal: BsDeal & { parent: (BsDeal & { combinedInvoicing: boolean }) | null }): BsDeal {
  const parent = deal.parent;
  return parent && parent.combinedInvoicing && sameCvr(parent.cvrNumber, deal.cvrNumber) ? parent : deal;
}

/** Same as bsPayerOf, looked up by deal id. */
export async function resolveBsPayer(dealId: string) {
  const deal = await prisma.deal.findUniqueOrThrow({
    where: { id: dealId },
    select: { ...bsDealFields, parent: { select: { ...bsDealFields, combinedInvoicing: true } } },
  });
  return bsPayerOf(deal);
}

export type PendingBsCollection = {
  key: string;
  dealId: string;
  dealName: string;
  customerNumber: string | null;
  invoiceIds: string[];
  dineroGuids: string[];
  invoiceNumbers: string[];
  dueDate: Date;
  deadline: Date;
  /** Sum of the invoice rows (excl. VAT) - the exact incl. VAT total is read from Dinero when the file is made. */
  amountExclVat: number;
  automatic: boolean;
  /** Reasons it can't go in a file right now; empty when it's ready. */
  problems: string[];
  /** True when it's simply not time yet (more than 90 days ahead). */
  notYet: boolean;
  /** Set when the collection is moved off the invoice's own due date because
   * the customer already has a collection that day (BS allows one per day). */
  shiftedFrom: Date | null;
};

/**
 * Every Betalingsservice invoice not yet in a file, one entry per BS
 * collection: rows sharing a Dinero invoice (a combined invoice) are one
 * invoice, and invoices for the same customer on the same date are one
 * collection (BS allows only one per customer per date).
 */
export async function listPendingBsCollections(now = new Date()): Promise<PendingBsCollection[]> {
  const rows = await prisma.invoice.findMany({
    where: {
      collectViaBs: true,
      bsCollectionId: null,
      paidAt: null,
      status: "DRAFT_CREATED",
      dineroInvoiceGuid: { not: null },
      // Test drafts from Dinero's Testtilstand are never collected.
      NOT: { dineroInvoiceGuid: { startsWith: "TEST-" } },
      dueDate: { not: null },
    },
    include: pendingInvoiceInclude,
    orderBy: { dueDate: "asc" },
  });

  const byGuid = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byGuid.get(row.dineroInvoiceGuid!) ?? [];
    list.push(row);
    byGuid.set(row.dineroInvoiceGuid!, list);
  }

  const collections = new Map<string, PendingBsCollection>();
  for (const [guid, invoiceRows] of byGuid) {
    const lead = invoiceRows.find((r) => !r.deal.parentDealId) ?? invoiceRows[0];
    const deal = bsPayerOf(lead.deal);
    const dueDate = lead.dueDate!;
    const key = `${deal.bsCustomerNumber ?? deal.id}|${dueDate.toISOString().slice(0, 10)}`;
    const existing = collections.get(key);
    const amount = invoiceRows.reduce((sum, r) => sum + r.amount, 0);
    const number = lead.dineroInvoiceNumber ?? "?";
    if (existing) {
      existing.invoiceIds.push(...invoiceRows.map((r) => r.id));
      existing.dineroGuids.push(guid);
      existing.invoiceNumbers.push(number);
      existing.amountExclVat += amount;
      continue;
    }

    const deadline = deliveryDeadline(dueDate);
    const problems: string[] = [];
    if (!deal.bsCustomerNumber) problems.push("Kunden har intet Betalingsservice-kundenummer.");
    const { street, postalCode } = splitDanishAddress(deal.address);
    if (!street || !postalCode) problems.push("Adressen mangler gade og postnummer (fx \"Vej 1, 9440 Aabybro\").");
    if (!lead.dineroInvoiceNumber) problems.push("Fakturaen har intet Dinero-fakturanummer endnu.");
    if (deadline.getTime() < now.getTime()) {
      problems.push(
        `Fristen for opkrævning d. ${formatDay(dueDate)} var ${formatDeadline(deadline)} - opkræv denne faktura på anden vis.`
      );
    }
    const notYet = dueDate.getTime() - now.getTime() > MAX_DAYS_AHEAD * DAY_MS;

    collections.set(key, {
      key,
      dealId: deal.id,
      dealName: dealName(deal),
      customerNumber: deal.bsCustomerNumber,
      invoiceIds: invoiceRows.map((r) => r.id),
      dineroGuids: [guid],
      invoiceNumbers: [number],
      dueDate,
      deadline,
      amountExclVat: amount,
      automatic: deal.bsMandateStatus === "ACTIVE" && Boolean(deal.bsMandateNumber),
      problems,
      notYet,
      shiftedFrom: null,
    });
  }
  // BS allows one collection per customer per payment date - also across
  // files, so a second invoice due the same day as one already sent (say the
  // establishment fee and a quarter both landing on the 1st) is collected on
  // the next banking day instead.
  const result = [...collections.values()];
  const customerNumbers = result.map((p) => p.customerNumber).filter((c): c is string => Boolean(c));
  if (customerNumbers.length > 0) {
    const taken = await prisma.bsCollection.findMany({
      where: { customerNumber: { in: customerNumbers }, status: { in: ["IN_FILE", "PAID"] } },
      select: { customerNumber: true, dueDate: true },
    });
    const takenDays = new Set(taken.map((t) => `${t.customerNumber}|${t.dueDate.toISOString().slice(0, 10)}`));
    for (const p of result) {
      if (!p.customerNumber) continue;
      const original = p.dueDate;
      let day = p.dueDate;
      while (takenDays.has(`${p.customerNumber}|${day.toISOString().slice(0, 10)}`)) {
        day = nextBankingDayOnOrAfter(new Date(day.getTime() + DAY_MS));
      }
      takenDays.add(`${p.customerNumber}|${day.toISOString().slice(0, 10)}`);
      if (day.getTime() !== original.getTime()) {
        p.dueDate = day;
        p.shiftedFrom = original;
        p.deadline = deliveryDeadline(day);
        p.problems = p.problems.filter((x) => !x.startsWith("Fristen for opkrævning"));
        if (p.deadline.getTime() < now.getTime()) {
          p.problems.push(`Fristen for opkrævning d. ${formatDay(day)} var ${formatDeadline(p.deadline)} - opkræv denne faktura på anden vis.`);
        }
      }
    }
  }
  return result.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
}

function formatDay(d: Date): string {
  return new Intl.DateTimeFormat("da-DK", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(d);
}

function formatDeadline(d: Date): string {
  return new Intl.DateTimeFormat("da-DK", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Copenhagen",
  }).format(d);
}

async function invoiceTotalOre(guid: string, fallbackExclVat: number, testMode: boolean): Promise<number> {
  if (testMode || guid.startsWith("TEST-")) return Math.round(fallbackExclVat * 1.25 * 100);
  const { totalInclVat } = await getInvoiceTotals(guid);
  return Math.round(totalInclVat * 100);
}

export type CreateDeliveryResult =
  | { ok: true; deliveryId: string; collections: number; skipped: number; notes?: string[] }
  | { ok: false; error: string };

/** Builds one BS 0601 file from every ready pending collection and stores it for download. */
export async function createBsDelivery(
  userId: string | null,
  options: { sendViaSftp?: boolean } = {}
): Promise<CreateDeliveryResult> {
  const settings = await getBsSettings();
  const missing = missingBsSettings(settings);
  if (missing.length > 0) return { ok: false, error: `Udfyld først: ${missing.join(", ")}.` };

  const pending = await listPendingBsCollections();
  const testMode = await isDineroTestMode();
  const candidates = pending.filter((p) => p.problems.length === 0 && !p.notYet);

  // Last check against Dinero right before collecting: an invoice the
  // customer has already paid by bank transfer (registered in Dinero) is
  // marked paid here and left out, so it's never also collected.
  const notes: string[] = [];
  const ready: PendingBsCollection[] = [];
  for (const p of candidates) {
    // Checked per Dinero invoice: a collection can hold several (same
    // customer, same date), and only the ones actually paid are dropped.
    const paidGuids = new Set<string>();
    for (const guid of p.dineroGuids) {
      if (testMode || guid.startsWith("TEST-")) continue;
      try {
        if ((await getInvoicePaymentStatus(guid)).paid) paidGuids.add(guid);
      } catch (err) {
        return { ok: false, error: `Kunne ikke tjekke betalingsstatus i Dinero: ${err instanceof Error ? err.message : String(err)}` };
      }
    }
    if (paidGuids.size === 0) {
      ready.push(p);
      continue;
    }
    const paidRows = await prisma.invoice.findMany({
      where: { id: { in: p.invoiceIds }, dineroInvoiceGuid: { in: [...paidGuids] } },
      select: { id: true },
    });
    await prisma.invoice.updateMany({ where: { id: { in: paidRows.map((r) => r.id) }, paidAt: null }, data: { paidAt: new Date() } });
    const paidNumbers = p.dineroGuids.flatMap((g, i) => (paidGuids.has(g) ? [p.invoiceNumbers[i]] : []));
    notes.push(`${p.dealName}: faktura ${paidNumbers.join(", ")} er allerede betalt i Dinero - ikke opkrævet via Betalingsservice.`);
    const keep = p.dineroGuids.map((g, i) => ({ g, n: p.invoiceNumbers[i] })).filter((x) => !paidGuids.has(x.g));
    if (keep.length > 0) {
      const paidIds = new Set(paidRows.map((r) => r.id));
      ready.push({
        ...p,
        dineroGuids: keep.map((x) => x.g),
        invoiceNumbers: keep.map((x) => x.n),
        invoiceIds: p.invoiceIds.filter((id) => !paidIds.has(id)),
      });
    }
  }
  if (ready.length === 0) {
    return {
      ok: false,
      error: notes.length > 0 ? notes.join(" ") : "Ingen fakturaer er klar til en betalingsfil lige nu.",
    };
  }
  const deals = await prisma.deal.findMany({
    where: { id: { in: ready.map((p) => p.dealId) } },
    select: { id: true, companyName: true, cvrNumber: true, address: true, bsMandateNumber: true },
  });
  const dealById = new Map(deals.map((d) => [d.id, d]));
  const invoiceRows = await prisma.invoice.findMany({
    where: { id: { in: ready.flatMap((p) => p.invoiceIds) } },
    select: { id: true, amount: true, dineroInvoiceGuid: true },
  });

  const built: { pending: PendingBsCollection; collection: Bs0601Collection }[] = [];
  try {
    for (const p of ready) {
      let amountOre = 0;
      for (const guid of p.dineroGuids) {
        const exclVat = invoiceRows.filter((r) => r.dineroInvoiceGuid === guid).reduce((s, r) => s + r.amount, 0);
        amountOre += await invoiceTotalOre(guid, exclVat, testMode);
      }
      const deal = dealById.get(p.dealId)!;
      const { street, postalCode } = splitDanishAddress(deal.address);
      const reference = p.invoiceNumbers[0].slice(-9);
      built.push({
        pending: p,
        collection: {
          customerNumber: p.customerNumber!,
          mandateNumber: p.automatic ? deal.bsMandateNumber : null,
          nameAndAddressLines: [deal.companyName, street!],
          postalCode: postalCode!,
          cvrNumber: deal.cvrNumber,
          dueDate: p.dueDate,
          amountOre,
          reference,
          textLines: [
            `Nextview360 - faktura nr. ${p.invoiceNumbers.join(", ")}`,
            "Fakturaen er sendt til dig på e-mail fra Dinero.",
          ],
        },
      });
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Kunne ikke hente fakturabeløb fra Dinero." };
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const s = await tx.bsSettings.update({
        where: { id: "default" },
        data: { nextDeliverySequence: { increment: 1 } },
      });
      const sequence = s.nextDeliverySequence - 1;
      const result = buildBs0601(
        {
          dataSupplierNumber: settings.dataSupplierNumber!,
          subsystem: settings.subsystem,
          pbsNumber: settings.pbsNumber!,
          debtorGroupNumber: settings.debtorGroupNumber!,
          deliveryId: sequence,
          mainText: "Nextview360",
        },
        built.map((b) => b.collection)
      );
      const today = new Date().toISOString().slice(0, 10).replaceAll("-", "");
      const delivery = await tx.bsDelivery.create({
        data: {
          sequence,
          fileName: `BS0601-${String(sequence).padStart(4, "0")}-${today}.txt`,
          content: new Uint8Array(result.file),
          collectionCount: result.totals.collections,
          totalOre: result.totals.amountOre,
          firstDueDate: new Date(Math.min(...built.map((b) => b.collection.dueDate.getTime()))),
          createdById: userId,
          sendViaSftp: options.sendViaSftp ?? false,
        },
      });
      for (const b of built) {
        const collection = await tx.bsCollection.create({
          data: {
            deliveryId: delivery.id,
            dealId: b.pending.dealId,
            customerNumber: b.collection.customerNumber,
            mandateNumber: b.collection.mandateNumber ?? null,
            dueDate: b.collection.dueDate,
            amountOre: b.collection.amountOre,
            reference: b.collection.reference!,
          },
        });
        // Claim the invoices - if any of them got into another file in the
        // meantime (a second click), the whole file is rolled back.
        const claimed = await tx.invoice.updateMany({
          where: { id: { in: b.pending.invoiceIds }, bsCollectionId: null },
          data: { bsCollectionId: collection.id },
        });
        if (claimed.count !== b.pending.invoiceIds.length) {
          throw new BsFormatError("Nogle af fakturaerne er lige blevet lagt i en anden betalingsfil - prøv igen.");
        }
      }
      return {
        ok: true as const,
        deliveryId: delivery.id,
        collections: built.length,
        skipped: pending.length - ready.length,
        notes,
      };
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Kunne ikke lave betalingsfilen." };
  }
}

const TEST_SUBSYSTEM = "KR9";
const TEST_CUSTOMERS: { name: string; street: string; postalCode: string }[] = [
  { name: "Testkunde Et ApS", street: "Testvej 1", postalCode: "8000" },
  { name: "Testkunde To ApS", street: "Prøvegade 2", postalCode: "9000" },
  { name: "Testkunde Tre ApS", street: "Eksempelvej 3", postalCode: "5000" },
  { name: "Testkunde Fire ApS", street: "Dummyvej 4", postalCode: "2100" },
  { name: "Testkunde Fem ApS", street: "Testvej 5", postalCode: "7100" },
  { name: "Testkunde Seks ApS", street: "Prøvegade 6", postalCode: "6700" },
  { name: "Testkunde Syv ApS", street: "Eksempelvej 7", postalCode: "4000" },
  { name: "Testkunde Otte ApS", street: "Dummyvej 8", postalCode: "8700" },
  { name: "Testkunde Ni ApS", street: "Testvej 9", postalCode: "9200" },
  { name: "Testkunde Ti ApS", street: "Prøvegade 10", postalCode: "3000" },
  { name: "Testkunde Elleve ApS", street: "Eksempelvej 11", postalCode: "8600" },
  { name: "Testkunde Tolv ApS", street: "Dummyvej 12", postalCode: "7400" },
  { name: "Testkunde Tretten ApS", street: "Testvej 13", postalCode: "6000" },
  { name: "Testkunde Fjorten ApS", street: "Prøvegade 14", postalCode: "2800" },
  { name: "Testkunde Femten ApS", street: "Eksempelvej 15", postalCode: "9440" },
];

/** A file is a test file when its name says so - see createBsTestDelivery. */
export function isTestDeliveryFileName(fileName: string): boolean {
  return fileName.includes("-TEST-");
}

/**
 * Builds a BS 0601 test file for Mastercard's free test (delsystem KR9):
 * 15 fictive customers (TEST001-TEST015) with made-up addresses and
 * amounts, all as indbetalingskort, due on the first banking day of next
 * month (section 0112 requires the following month). Touches no real invoice, deal or customer - it's only
 * stored as a delivery so it can be downloaded or sent via SFTP.
 */
/**
 * The mandates Mastercard's test system registered for our 15 test customers
 * (its BS 0603 of 8 Oct 2026, D3808688001-603.KR9).
 */
const TEST_MANDATES: Record<string, string> = {
  TEST001: "000101529",
  TEST002: "000101531",
  TEST003: "000101533",
  TEST004: "000101535",
  TEST005: "000101537",
  TEST006: "000101539",
  TEST007: "000101540",
  TEST008: "000101541",
  TEST009: "000101542",
  TEST010: "000101543",
  TEST011: "000101530",
  TEST012: "000101532",
  TEST013: "000101534",
  TEST014: "000101536",
  TEST015: "000101538",
};

export async function createBsTestDelivery(userId: string): Promise<CreateDeliveryResult> {
  const settings = await getBsSettings();
  const missing = missingBsSettings(settings).filter((m) => m !== "mellemregningskonto i Dinero");
  if (missing.length > 0) return { ok: false, error: `Udfyld først: ${missing.join(", ")}.` };

  // Section 0112 test files must be due in the following month (and in the
  // future), whatever the production deadline - so always the first banking
  // day of next month, never the month after.
  const now = new Date();
  const dueDate = firstBankingDayOfMonth(utcDay(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const collections: Bs0601Collection[] = TEST_CUSTOMERS.map((c, i) => ({
    customerNumber: `TEST${String(i + 1).padStart(3, "0")}`,
    // TEST001-TEST010 as automatic payments (with the mandates Mastercard
    // registered for them), the rest as payment slips - so both are tested.
    mandateNumber: i < 10 ? TEST_MANDATES[`TEST${String(i + 1).padStart(3, "0")}`] : null,
    nameAndAddressLines: [c.name, c.street],
    postalCode: c.postalCode,
    dueDate,
    amountOre: (1000 + i * 125) * 100,
    reference: `T${String(i + 1).padStart(3, "0")}`,
    textLines: [`Nextview360 - testopkrævning ${i + 1}`, "Dette er en test - ikke en rigtig regning."],
  }));

  try {
    return await prisma.$transaction(async (tx) => {
      const s = await tx.bsSettings.update({ where: { id: "default" }, data: { nextDeliverySequence: { increment: 1 } } });
      const sequence = s.nextDeliverySequence - 1;
      const result = buildBs0601(
        {
          dataSupplierNumber: settings.dataSupplierNumber!,
          subsystem: TEST_SUBSYSTEM,
          pbsNumber: settings.pbsNumber!,
          debtorGroupNumber: settings.debtorGroupNumber!,
          deliveryId: sequence,
          mainText: "Nextview360 - TEST",
        },
        collections
      );
      const today = new Date().toISOString().slice(0, 10).replaceAll("-", "");
      const delivery = await tx.bsDelivery.create({
        data: {
          sequence,
          fileName: `BS0601-TEST-${TEST_SUBSYSTEM}-${String(sequence).padStart(4, "0")}-${today}.txt`,
          content: new Uint8Array(result.file),
          collectionCount: result.totals.collections,
          totalOre: result.totals.amountOre,
          firstDueDate: dueDate,
          createdById: userId,
        },
      });
      return { ok: true as const, deliveryId: delivery.id, collections: collections.length, skipped: 0 };
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Kunne ikke lave testfilen." };
  }
}

/** Deletes a file that hasn't been uploaded yet, so its invoices can go in a new one. */
export async function deleteBsDelivery(deliveryId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const delivery = await prisma.bsDelivery.findUnique({ where: { id: deliveryId } });
  if (!delivery) return { ok: false, error: "Filen findes ikke." };
  if (delivery.submittedAt) return { ok: false, error: "Filen er markeret som uploadet og kan ikke fortrydes her." };
  const withResults = await prisma.bsCollection.count({ where: { deliveryId, status: { not: "IN_FILE" } } });
  if (withResults > 0) return { ok: false, error: "Der er allerede kommet resultater for filen - den kan ikke slettes." };
  await prisma.bsDelivery.delete({ where: { id: deliveryId } });
  return { ok: true };
}

export async function markBsDeliverySubmitted(deliveryId: string, submitted: boolean): Promise<void> {
  await prisma.bsDelivery.update({ where: { id: deliveryId }, data: { submittedAt: submitted ? new Date() : null } });
}

const OUTCOME_STATUS = {
  PAID: "PAID",
  REJECTED: "REJECTED",
  CANCELLED: "CANCELLED",
  CHARGED_BACK: "CHARGED_BACK",
} as const;

const OUTCOME_LABEL: Record<BsPayment["outcome"], string> = {
  PAID: "betalt",
  REJECTED: "afvist",
  CANCELLED: "annulleret",
  CHARGED_BACK: "tilbageført",
};

/**
 * A collection that didn't go through (rejected by the customer, cancelled,
 * or charged back) leaves the customer with a Betalingsservice invoice and
 * no payment - someone has to chase them. Marks the invoices and puts a
 * task on the deal, assigned to whoever imported the file (or an admin
 * with billing access when it came in by itself over SFTP).
 */
async function flagFailedCollection(
  collection: { id: string; dealId: string; dueDate: Date },
  name: string,
  outcomeLabel: string,
  amountOre: number,
  userId: string | null
): Promise<void> {
  const invoices = await prisma.invoice.findMany({
    where: { bsCollectionId: collection.id },
    select: { dineroInvoiceNumber: true },
  });
  const numbers = invoices.map((i) => i.dineroInvoiceNumber).filter(Boolean).join(", ") || "-";
  const due = new Intl.DateTimeFormat("da-DK", { day: "numeric", month: "long", timeZone: "UTC" }).format(collection.dueDate);
  await prisma.invoice.updateMany({
    where: { bsCollectionId: collection.id },
    data: { bsPaymentError: `Betalingsservice: ${outcomeLabel} (opkrævning d. ${due}) - ikke betalt.` },
  });
  const assignee =
    (userId && (await prisma.user.findUnique({ where: { id: userId }, select: { id: true } }))) ||
    (await prisma.user.findFirst({ where: { role: "ADMIN", canAccessBilling: true }, orderBy: { createdAt: "asc" }, select: { id: true } }));
  if (!assignee) return;
  await prisma.task.create({
    data: {
      title: `Ryk ${name}: Betalingsservice-betaling ${outcomeLabel} (faktura ${numbers}, ${kr(amountOre)})`,
      description:
        `Betalingen d. ${due} via Betalingsservice blev ${outcomeLabel}, så fakturaen er stadig ubetalt. ` +
        `Kontakt kunden og få dem til at betale ved bankoverførsel - fx ved at sende en rykker fra Dinero. ` +
        `Fakturaen bliver markeret betalt i Arpo, når betalingen er registreret i Dinero.`,
      assigneeId: assignee.id,
      createdById: assignee.id,
      dealId: collection.dealId,
      dueDate: new Date(),
    },
  });
}

function kr(ore: number): string {
  return `${(ore / 100).toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr`;
}

/** Registers the Dinero payment for each of a paid collection's invoices, at most once each. */
async function registerCollectionPayments(collectionId: string, lines: string[]): Promise<void> {
  const settings = await getBsSettings();
  const collection = await prisma.bsCollection.findUniqueOrThrow({
    where: { id: collectionId },
    include: { invoices: true, deal: { select: { companyName: true, displayName: true } } },
  });
  const testMode = await isDineroTestMode();
  const name = dealName(collection.deal);
  const guids = [...new Set(collection.invoices.map((i) => i.dineroInvoiceGuid).filter((g): g is string => Boolean(g)))];

  for (const guid of guids) {
    const rows = collection.invoices.filter((i) => i.dineroInvoiceGuid === guid);
    const number = rows[0].dineroInvoiceNumber ?? guid;
    if (testMode || guid.startsWith("TEST-")) {
      await prisma.invoice.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { bsPaymentError: null } });
      lines.push(`  ${name}: faktura ${number} - testtilstand, ingen betaling registreret i Dinero.`);
      continue;
    }
    if (!settings.depositAccountNumber) {
      await prisma.invoice.updateMany({
        where: { id: { in: rows.map((r) => r.id) } },
        data: { bsPaymentError: "Ingen mellemregningskonto angivet under Betalingsservice." },
      });
      lines.push(`  ${name}: faktura ${number} - IKKE registreret i Dinero (ingen mellemregningskonto angivet).`);
      continue;
    }
    if (rows.every((r) => r.bsPaymentRegisteredAt)) continue;

    // Paid through Betalingsservice, but Dinero already has the invoice as
    // paid (the customer also paid by bank transfer) - don't register a
    // second payment; flag it so the money is refunded.
    try {
      const status = await getInvoicePaymentStatus(guid);
      if (status.paid) {
        const error = `Dobbeltbetaling: faktura ${number} var allerede betalt i Dinero (bankoverførsel), og kunden har nu også betalt via Betalingsservice - refundér det ene beløb.`;
        await prisma.invoice.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { bsPaymentError: error } });
        lines.push(`  ${name}: ${error.toUpperCase().slice(0, 15)}${error.slice(15)}`);
        continue;
      }
    } catch (err) {
      const error = `Kunne ikke tjekke Dinero før registrering: ${err instanceof Error ? err.message : String(err)}`;
      await prisma.invoice.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { bsPaymentError: error } });
      lines.push(`  ${name}: faktura ${number} - ${error}`);
      continue;
    }

    // Claim before calling Dinero, so two imports racing can't both register it.
    const claimed = await prisma.invoice.updateMany({
      where: { id: { in: rows.map((r) => r.id) }, bsPaymentRegisteredAt: null },
      data: { bsPaymentRegisteredAt: new Date(), bsPaymentError: null },
    });
    if (claimed.count === 0) continue;
    try {
      const { totalInclVat } = await getInvoiceTotals(guid);
      await registerInvoicePayment(guid, {
        amount: totalInclVat,
        depositAccountNumber: settings.depositAccountNumber,
        paymentDate: collection.paymentDate ?? new Date(),
        description: `Betalingsservice - faktura ${number}`,
        externalReference: `BS-${collection.id}-${guid}`.slice(0, 128),
      });
      lines.push(`  ${name}: faktura ${number} registreret som betalt i Dinero.`);
    } catch (err) {
      const error = err instanceof Error ? err.message : "Ukendt fejl";
      await prisma.invoice.updateMany({
        where: { id: { in: rows.map((r) => r.id) } },
        data: { bsPaymentRegisteredAt: null, bsPaymentError: error },
      });
      lines.push(`  ${name}: faktura ${number} - FEJL ved registrering i Dinero: ${error}`);
    }
  }
}

/** "Prøv igen" for a paid collection whose Dinero registration failed. */
export async function retryBsPaymentRegistration(collectionId: string): Promise<string[]> {
  const lines: string[] = [];
  await registerCollectionPayments(collectionId, lines);
  return lines;
}

export type ImportReturnResult =
  | { ok: true; alreadyImported: boolean; deliveryType: string; lines: string[] }
  | { ok: false; error: string };

/** Reads an uploaded BS 0602 (payments) or BS 0603 (mandates) file and applies it. */
export async function importBsReturnFile(fileName: string, file: Buffer, userId: string | null): Promise<ImportReturnResult> {
  let parsed;
  try {
    parsed = parseBsReturnDelivery(file);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Filen kunne ikke læses." };
  }

  const contentHash = createHash("sha256").update(file).digest("hex");
  const previous = await prisma.bsReturnImport.findUnique({ where: { contentHash } });
  if (previous) {
    return {
      ok: true,
      alreadyImported: true,
      deliveryType: previous.deliveryType,
      lines: [`Filen er allerede indlæst ${formatDeadline(previous.createdAt)} - intet er ændret.`, ...previous.summary.split("\n")],
    };
  }

  let importRow;
  try {
    importRow = await prisma.bsReturnImport.create({
      data: {
        fileName,
        contentHash,
        deliveryType: parsed.deliveryType,
        paymentCount: parsed.payments.length,
        mandateCount: parsed.mandates.length,
        summary: "",
        createdById: userId,
      },
    });
  } catch {
    return { ok: false, error: "Filen bliver allerede indlæst - vent et øjeblik og genindlæs siden." };
  }

  const lines: string[] = [];
  try {
    for (const payment of parsed.payments) {
      const reference = payment.reference.trim();
      const collection = await prisma.bsCollection.findFirst({
        where: { customerNumber: payment.customerNumber.trim(), reference },
        orderBy: { createdAt: "desc" },
        include: { deal: { select: { companyName: true, displayName: true } } },
      });
      if (!collection) {
        lines.push(
          `Ukendt opkrævning: kunde ${payment.customerNumber.trim()}, reference "${reference}" (${OUTCOME_LABEL[payment.outcome]}, ${kr(payment.paidAmountOre || payment.amountOre)}) - tjek den i Betalingsservice.`
        );
        continue;
      }
      const name = dealName(collection.deal);
      const status = OUTCOME_STATUS[payment.outcome];
      await prisma.bsCollection.update({
        where: { id: collection.id },
        data: {
          status,
          statusAt: new Date(),
          channel: payment.channel,
          paidAmountOre: payment.outcome === "PAID" ? payment.paidAmountOre || payment.amountOre : collection.paidAmountOre,
          paymentDate: payment.paymentDate ?? collection.paymentDate,
        },
      });
      const via = payment.channel === "automatic" ? "automatisk betaling" : "indbetalingskort";

      if (payment.outcome === "PAID") {
        await prisma.invoice.updateMany({
          where: { bsCollectionId: collection.id, paidAt: null },
          data: { paidAt: payment.paymentDate ?? new Date() },
        });
        lines.push(`${name}: betalt via ${via}, ${kr(payment.paidAmountOre || payment.amountOre)}.`);
        await registerCollectionPayments(collection.id, lines);
      } else if (payment.outcome === "CHARGED_BACK") {
        const registered = await prisma.invoice.count({
          where: { bsCollectionId: collection.id, bsPaymentRegisteredAt: { not: null } },
        });
        await prisma.invoice.updateMany({ where: { bsCollectionId: collection.id }, data: { paidAt: null } });
        lines.push(
          `${name}: TILBAGEFØRT (${kr(payment.amountOre)}) - fakturaen står som ubetalt igen.${
            registered > 0 ? " Fjern betalingen på fakturaen i Dinero manuelt og ryk kunden." : " Ryk kunden."
          } Der er lavet en opgave på dealen.`
        );
        await flagFailedCollection(collection, name, OUTCOME_LABEL[payment.outcome], payment.amountOre, userId);
      } else {
        lines.push(
          `${name}: ${OUTCOME_LABEL[payment.outcome].toUpperCase()} via ${via} (${kr(payment.amountOre)}) - fakturaen er ikke betalt. Der er lavet en opgave på dealen om at rykke kunden.`
        );
        await flagFailedCollection(collection, name, OUTCOME_LABEL[payment.outcome], payment.amountOre, userId);
      }
    }

    for (const mandate of parsed.mandates) {
      const customerNumber = mandate.customerNumber.trim();
      const deal = await prisma.deal.findUnique({
        where: { bsCustomerNumber: customerNumber },
        select: { id: true, companyName: true, displayName: true },
      });
      if (!deal) {
        lines.push(`Ukendt kundenummer i aftalefilen: ${customerNumber}.`);
        continue;
      }
      const active = mandate.event === "ACTIVE" || mandate.event === "REGISTERED";
      await prisma.deal.update({
        where: { id: deal.id },
        data: {
          bsMandateStatus: active ? "ACTIVE" : "CANCELLED",
          bsMandateNumber: mandate.mandateNumber.trim() || null,
          bsMandateChangedAt: mandate.date ?? new Date(),
        },
      });
      lines.push(
        active
          ? `${dealName(deal)}: tilmeldt automatisk betaling.`
          : `${dealName(deal)}: afmeldt automatisk betaling - får indbetalingskort fremover.`
      );
    }

    if (lines.length === 0) lines.push("Filen indeholdt ingen betalinger eller aftaler.");
    await prisma.bsReturnImport.update({ where: { id: importRow.id }, data: { summary: lines.join("\n") } });
    return { ok: true, alreadyImported: false, deliveryType: parsed.deliveryType, lines };
  } catch (err) {
    // Everything above is safe to re-run, so let the same file be uploaded again.
    await prisma.bsReturnImport.delete({ where: { id: importRow.id } }).catch(() => {});
    return { ok: false, error: err instanceof Error ? err.message : "Kunne ikke indlæse filen." };
  }
}
