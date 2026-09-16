import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { calculateCommissionAmount, calculateCommissionDueDate } from "../src/lib/commission";
import { buildDealEmailAddress } from "../src/lib/email-address";

const prisma = new PrismaClient();

function randomPassword(): string {
  return crypto.randomBytes(9).toString("base64").replace(/[+/=]/g, "").slice(0, 12);
}

/**
 * Creates a real admin user if it doesn't already exist, with a freshly
 * generated random password printed once. Never overwrites an existing
 * user's password - safe to re-run anywhere, including production.
 */
async function ensureAdminUser(name: string, email: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`  ${email} - findes allerede, adgangskode uændret`);
    return existing;
  }

  const password = randomPassword();
  const passwordHash = await bcrypt.hash(password, 10);
  const created = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      role: "ADMIN",
      commissionRate: 0,
      isCommissionBased: false,
      payoutFrequency: "MONTHLY",
    },
  });
  console.log(`  ${email} / ${password}   <-- gem denne adgangskode nu, den vises ikke igen`);
  return created;
}

async function seedDemoData() {
  const users = [
    { name: "Admin (demo)", email: "admin@nextview360.dk", password: "admin123", role: "ADMIN" as const, commissionRate: 0, isCommissionBased: false },
    { name: "Sælger 1 (demo)", email: "saelger1@nextview360.dk", password: "saelger123", role: "SALES" as const, commissionRate: 12, isCommissionBased: true },
    { name: "Sælger 2 (demo)", email: "saelger2@nextview360.dk", password: "saelger123", role: "SALES" as const, commissionRate: 10, isCommissionBased: true },
  ];

  const createdUsers: Record<string, { id: string }> = {};

  for (const u of users) {
    const passwordHash = await bcrypt.hash(u.password, 10);
    const created = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        name: u.name,
        email: u.email,
        passwordHash,
        role: u.role,
        commissionRate: u.commissionRate,
        isCommissionBased: u.isCommissionBased,
        payoutFrequency: "MONTHLY",
      },
    });
    createdUsers[u.email] = created;
  }

  const admin = createdUsers["admin@nextview360.dk"];
  const seller1 = createdUsers["saelger1@nextview360.dk"];
  const seller2 = createdUsers["saelger2@nextview360.dk"];

  const existingDeals = await prisma.deal.count();
  if (existingDeals > 0) {
    console.log("  Demo-deals findes allerede, springer over.");
    return;
  }

  const csvBatch = await prisma.importBatch.create({
    data: { importType: "CSV", fileName: "leads-messe-2026.csv", importedById: admin.id },
  });

  const sampleDeals: Array<{
    companyName: string;
    contactName: string;
    contactEmail: string;
    ownerId: string;
    stage: "LEAD" | "CONTACTED" | "MEETING_BOOKED" | "CONTRACT_SENT" | "CONTRACT_SIGNED" | "FILMED" | "LIVE" | "LOST";
    meetingDate?: Date;
    soldProduct?: string;
    bindingMonths?: number;
    saleAmount?: number;
    soldAt?: Date;
    filmedAt?: Date;
    liveAt?: Date;
    importType: "MANUAL" | "CSV" | "GOOGLE_DOCS";
    importBatchId?: string;
    note?: string;
  }> = [
    {
      companyName: "Nordisk Byg ApS",
      contactName: "Peter Holm",
      contactEmail: "peter@nordiskbyg.dk",
      ownerId: seller1.id,
      stage: "LIVE",
      meetingDate: new Date(new Date().getFullYear(), new Date().getMonth() - 2, 3, 10, 0),
      soldProduct: "Video-pakke Guld",
      bindingMonths: 12,
      saleAmount: 36000,
      soldAt: new Date(new Date().getFullYear(), new Date().getMonth() - 1, 10),
      filmedAt: new Date(new Date().getFullYear(), new Date().getMonth() - 1, 20),
      liveAt: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      importType: "MANUAL",
      note: "Meget tilfreds kunde, ønsker opfølgning om 6 måneder.",
    },
    {
      companyName: "Kaffehuset Aroma",
      contactName: "Mette Sørensen",
      contactEmail: "mette@aroma.dk",
      ownerId: seller2.id,
      stage: "FILMED",
      meetingDate: new Date(new Date().getFullYear(), new Date().getMonth(), 5, 13, 30),
      soldProduct: "Social Media-pakke",
      bindingMonths: 6,
      saleAmount: 18000,
      soldAt: new Date(),
      filmedAt: new Date(),
      importType: "CSV",
      importBatchId: csvBatch.id,
      note: "Optagelse gennemført, afventer redigering.",
    },
    {
      companyName: "Grøn Have A/S",
      contactName: "Lars Vind",
      contactEmail: "lars@groenhave.dk",
      ownerId: seller1.id,
      stage: "MEETING_BOOKED",
      meetingDate: new Date(new Date().getFullYear(), new Date().getMonth(), 25, 14, 0),
      importType: "CSV",
      importBatchId: csvBatch.id,
      note: "Afventer tilbud på udvidet pakke.",
    },
    {
      companyName: "Design & Co",
      contactName: "Anna Bruun",
      contactEmail: "anna@designco.dk",
      ownerId: seller2.id,
      stage: "LEAD",
      importType: "MANUAL",
    },
  ];

  for (const d of sampleDeals) {
    const deal = await prisma.deal.create({
      data: {
        companyName: d.companyName,
        contactName: d.contactName,
        contactEmail: d.contactEmail,
        ownerId: d.ownerId,
        stage: d.stage,
        meetingDate: d.meetingDate,
        soldProduct: d.soldProduct,
        bindingMonths: d.bindingMonths,
        saleAmount: d.saleAmount,
        soldAt: d.soldAt,
        filmedAt: d.filmedAt,
        liveAt: d.liveAt,
        importType: d.importType,
        importBatchId: d.importBatchId,
      },
    });

    await prisma.deal.update({
      where: { id: deal.id },
      data: { dealEmailAddress: buildDealEmailAddress(deal.id) },
    });

    if (d.note) {
      await prisma.note.create({
        data: { dealId: deal.id, authorId: d.ownerId, body: d.note, kind: "MANUAL" },
      });
    }

    if (d.saleAmount && d.soldAt) {
      const owner = await prisma.user.findUniqueOrThrow({ where: { id: d.ownerId } });
      if (owner.isCommissionBased) {
        const amount = calculateCommissionAmount(d.saleAmount, owner.commissionRate);
        const dueDate = calculateCommissionDueDate(d.soldAt, owner.payoutFrequency);
        await prisma.commission.create({
          data: {
            dealId: deal.id,
            sellerId: owner.id,
            rate: owner.commissionRate,
            baseAmount: d.saleAmount,
            amount,
            frequency: owner.payoutFrequency,
            dueDate,
          },
        });
      }
    }
  }

  console.log("  Demo-brugere:");
  for (const u of users) {
    console.log(`    ${u.email} / ${u.password}`);
  }
}

async function main() {
  console.log("Rigtige admin-brugere:");
  await ensureAdminUser("Lasse", "lasse@nextview360.dk");
  await ensureAdminUser("Victor", "victor@nextview360.dk");

  // Demo/test data (fake users + fake deals) - opt-in only, so a fresh
  // production database never gets seeded with placeholder companies.
  if (process.env.SEED_DEMO_DATA === "true") {
    console.log("\nOpretter demo-data (SEED_DEMO_DATA=true):");
    await seedDemoData();
  } else {
    console.log("\nSpringer demo-data over (sæt SEED_DEMO_DATA=true for at inkludere den).");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
