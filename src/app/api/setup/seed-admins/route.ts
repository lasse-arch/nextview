import { NextResponse, type NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { prisma } from "@/lib/db";

function randomPassword(): string {
  return crypto.randomBytes(9).toString("base64").replace(/[+/=]/g, "").slice(0, 12);
}

const ADMINS = [
  { name: "Lasse", email: "lasse@nextview360.dk" },
  { name: "Victor", email: "victor@nextview360.dk" },
];

/**
 * One-time production setup endpoint: creates the real admin accounts if
 * they don't already exist. Protected by CRON_SECRET so it can be hit
 * safely from a browser. Idempotent - re-running never touches an
 * existing user's password, and a freshly generated password is only ever
 * returned in the response of the call that created that account.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const results = [];
  for (const admin of ADMINS) {
    const existing = await prisma.user.findUnique({ where: { email: admin.email } });
    if (existing) {
      results.push({ email: admin.email, status: "already_exists" });
      continue;
    }

    const password = randomPassword();
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.create({
      data: {
        name: admin.name,
        email: admin.email,
        passwordHash,
        role: "ADMIN",
        commissionRate: 0,
        isCommissionBased: false,
        payoutFrequency: "MONTHLY",
      },
    });
    results.push({ email: admin.email, status: "created", password });
  }

  return NextResponse.json({ results });
}
