import { NextResponse, type NextRequest } from "next/server";
import { verifyWebhookSignature } from "@/lib/docuseal";
import { handleDocuSealEvent, type DocuSealEvent } from "@/lib/docuseal-events";

// DocuSeal webhooks are configured manually in their Console (no API to
// register one) - a GET here just lets us sanity-check the URL is reachable.
// The address must be the exact one under Indstillinger → DocuSeal: one that
// redirects (an old domain, www) loses the event - DocuSeal doesn't follow it.
// The daily status check (cron/contract-status) catches any that are lost.
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

  await handleDocuSealEvent(payload);
  return NextResponse.json({ ok: true });
}
