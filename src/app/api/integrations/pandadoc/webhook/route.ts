import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { recalcCommission } from "@/lib/commission-service";
import { sendContractSignedNotification } from "@/lib/notification-service";

type PandaDocEvent = {
  event?: string;
  data?: {
    id?: string;
    status?: string;
    date_modified?: string;
  };
};

function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
  const sharedKey = process.env.PANDADOC_WEBHOOK_SHARED_KEY;
  if (!sharedKey) {
    // Not yet configured - accept but this should be locked down once the shared key is set in PandaDoc.
    return true;
  }
  if (!signatureHeader) return false;

  const expected = crypto.createHmac("sha256", sharedKey).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("PandaDoc-Signature");

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let events: PandaDocEvent[];
  try {
    const parsed = JSON.parse(rawBody);
    events = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  for (const event of events) {
    const documentId = event.data?.id;
    const status = event.data?.status;
    if (!documentId || !status) continue;

    const deal = await prisma.deal.findUnique({ where: { pandaDocDocumentId: documentId } });
    if (!deal) continue;

    const changedAt = event.data?.date_modified ? new Date(event.data.date_modified) : new Date();

    if (status === "document.sent") {
      await prisma.deal.update({
        where: { id: deal.id },
        data: {
          contractStatus: "SENT",
          contractSentAt: deal.contractSentAt ?? changedAt,
          stage: "CONTRACT_SENT",
        },
      });
    } else if (status === "document.viewed") {
      await prisma.deal.update({
        where: { id: deal.id },
        data: { contractStatus: "VIEWED", contractViewedAt: changedAt },
      });
    } else if (status === "document.completed") {
      await prisma.deal.update({
        where: { id: deal.id },
        data: {
          contractStatus: "SIGNED",
          contractSignedAt: changedAt,
          soldAt: deal.soldAt ?? changedAt,
          stage: "CONTRACT_SIGNED",
        },
      });
      await recalcCommission(deal.id);
      await sendContractSignedNotification(deal.id);
    } else if (status === "document.declined") {
      await prisma.deal.update({ where: { id: deal.id }, data: { contractStatus: "DECLINED" } });
    } else if (status === "document.voided") {
      await prisma.deal.update({ where: { id: deal.id }, data: { contractStatus: "VOIDED" } });
    }
  }

  return NextResponse.json({ ok: true });
}
