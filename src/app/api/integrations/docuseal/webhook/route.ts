import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { verifyWebhookSignature } from "@/lib/docuseal";
import { recalcCommission } from "@/lib/commission-service";
import { sendContractSignedNotification } from "@/lib/notification-service";
import { contractProductsToDealItems, type ContractProducts } from "@/lib/contract-template-data";
import { archiveSignedContractToDrive } from "@/lib/actions/google-drive-archive";

type DocuSealEvent = {
  event_type?: string;
  timestamp?: string;
  data?: {
    external_id?: string;
    status?: string;
    submission?: { id?: number };
    submission_id?: number;
  };
};

// DocuSeal webhooks are configured manually in their Console (no API to
// register one) - a GET here just lets us sanity-check the URL is reachable.
export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signatureHeader = request.headers.get("x-docuseal-signature");

  if (!verifyWebhookSignature(rawBody, signatureHeader)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let payload: DocuSealEvent;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const type = payload.event_type;
  const submissionId = payload.data?.submission?.id ?? payload.data?.submission_id;
  if (!type || !submissionId) return NextResponse.json({ ok: true });

  const deal = await prisma.deal.findUnique({ where: { docusealSubmissionId: String(submissionId) } });
  if (!deal) return NextResponse.json({ ok: true });

  const isCustomer = payload.data?.external_id === "customer";
  const changedAt = payload.timestamp ? new Date(payload.timestamp) : new Date();

  function logEvent(eventType: string) {
    return prisma.contractEvent.create({ data: { dealId: deal!.id, type: eventType, occurredAt: changedAt } });
  }

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
    await logEvent("SIGNED");

    // Carry each product on the now-signed contract down into "Ydelser" as
    // its own line - including ones given away for free - so once there are
    // many customers, it's possible to see at a glance who has what.
    if (deal!.contractProducts) {
      const items = contractProductsToDealItems(deal!.contractProducts as unknown as ContractProducts);
      if (items.length > 0) {
        await prisma.dealItem.createMany({
          data: items.map((item) => ({ ...item, dealId: deal!.id })),
        });
      }
    }

    await recalcCommission(deal!.id);
    await sendContractSignedNotification(deal!.id);
  }

  if (type === "form.viewed") {
    // Only the customer opening it is meaningful here - the director (the
    // other submitter) may auto-preview it, which shouldn't count as "opened".
    // Every open is logged (not just the first) so the hover box can show a
    // history, e.g. the customer opening it several times before signing.
    if (isCustomer) {
      await logEvent("VIEWED");
      if (!deal.contractViewedAt) {
        await prisma.deal.update({
          where: { id: deal.id },
          data: { contractStatus: "VIEWED", contractViewedAt: changedAt },
        });
      }
    }
  } else if (type === "form.completed" && isCustomer) {
    // The customer's own signature is what "underskrevet" should reflect,
    // not submission.completed - which only fires once every submitter
    // (including our own director) has signed, and could lag behind.
    await markSigned();
  } else if (type === "submission.completed") {
    // Backstop in case form.completed's external_id was ever missing.
    await markSigned();
    // Only now (both submitters done) is the fully-signed PDF actually
    // available to download - best-effort, must never fail the webhook.
    try {
      await archiveSignedContractToDrive(deal.id);
    } catch (err) {
      console.error(`Google Drev-arkivering fejlede for deal ${deal.id}:`, err);
    }
  } else if (type === "form.declined") {
    await prisma.deal.update({ where: { id: deal.id }, data: { contractStatus: "DECLINED" } });
    await logEvent("DECLINED");
  } else if (type === "submission.expired" || type === "submission.archived") {
    await prisma.deal.update({ where: { id: deal.id }, data: { contractStatus: "VOIDED" } });
    await logEvent(type === "submission.expired" ? "EXPIRED" : "ARCHIVED");
  }

  return NextResponse.json({ ok: true });
}
