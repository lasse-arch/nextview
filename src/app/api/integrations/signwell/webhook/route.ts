import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { verifyWebhookHash } from "@/lib/signwell";
import { recalcCommission } from "@/lib/commission-service";
import { sendContractSignedNotification } from "@/lib/notification-service";

type SignWellEvent = {
  event?: { type?: string; time?: number; hash?: string; related_signer?: { email?: string } };
  data?: { object?: { id?: string; status?: string } };
};

function isCustomer(deal: { contactEmail: string | null }, signerEmail?: string): boolean {
  if (!deal.contactEmail || !signerEmail) return false;
  return deal.contactEmail.toLowerCase() === signerEmail.toLowerCase();
}

// SignWell's "Validate link" button in the dashboard webhook UI may ping the
// URL before allowing it to be saved - respond so that check passes.
export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  let payload: SignWellEvent;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const type = payload.event?.type;
  const time = payload.event?.time;
  const hash = payload.event?.hash;
  if (!type || !time || !hash || !verifyWebhookHash(type, time, hash)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const documentId = payload.data?.object?.id;
  if (!documentId) return NextResponse.json({ ok: true });

  const deal = await prisma.deal.findUnique({ where: { signWellDocumentId: documentId } });
  if (!deal) return NextResponse.json({ ok: true });

  const changedAt = new Date(time * 1000);

  async function markSigned() {
    if (deal!.contractSignedAt) return;
    await prisma.deal.update({
      where: { id: deal!.id },
      data: {
        contractStatus: "SIGNED",
        contractSignedAt: changedAt,
        soldAt: deal!.soldAt ?? changedAt,
        stage: "CONTRACT_SIGNED",
      },
    });
    await recalcCommission(deal!.id);
    await sendContractSignedNotification(deal!.id);
  }

  if (type === "document_sent") {
    await prisma.deal.update({
      where: { id: deal.id },
      data: {
        contractStatus: "SENT",
        contractSentAt: deal.contractSentAt ?? changedAt,
        stage: "CONTRACT_SENT",
      },
    });
  } else if (type === "document_viewed") {
    // Only the customer opening it is meaningful here - the seller (recipient 1,
    // the document owner) may auto-preview it, which shouldn't count as "opened".
    if (isCustomer(deal, payload.event?.related_signer?.email) && !deal.contractViewedAt) {
      await prisma.deal.update({
        where: { id: deal.id },
        data: { contractStatus: "VIEWED", contractViewedAt: changedAt },
      });
    }
  } else if (type === "document_signed" && isCustomer(deal, payload.event?.related_signer?.email)) {
    // The customer's own signature is what "underskrevet" should reflect,
    // not document_completed - which only fires once every recipient
    // (including our own seller) has signed, and could lag behind.
    await markSigned();
  } else if (type === "document_completed") {
    // Backstop in case document_signed's related_signer info was ever missing.
    await markSigned();
  } else if (type === "document_declined") {
    await prisma.deal.update({ where: { id: deal.id }, data: { contractStatus: "DECLINED" } });
  } else if (type === "document_canceled" || type === "document_expired") {
    await prisma.deal.update({ where: { id: deal.id }, data: { contractStatus: "VOIDED" } });
  }

  return NextResponse.json({ ok: true });
}
