import crypto from "node:crypto";
import { isIntegrationEnabled } from "@/lib/integration-settings";

const SIGNWELL_API_BASE = "https://www.signwell.com/api/v1";

function hasSignWellCredentials(): boolean {
  return Boolean(process.env.SIGNWELL_API_KEY);
}

export async function isSignWellConfigured(): Promise<boolean> {
  if (!hasSignWellCredentials()) return false;
  return isIntegrationEnabled("SIGNWELL");
}

function apiKey(): string {
  const key = process.env.SIGNWELL_API_KEY;
  if (!key) throw new Error("SIGNWELL_API_KEY er ikke konfigureret");
  return key;
}

function headers(): Record<string, string> {
  return { "X-Api-Key": apiKey(), "Content-Type": "application/json" };
}

export type SignWellRecipient = { id: string; name: string; email: string };

export type SignWellDocument = {
  id: string;
  name: string;
  status: string;
  recipients: { id: string; name: string; email: string; signing_url?: string; status: string }[];
};

/**
 * Creates and immediately sends a signature request built from an already
 * finished .docx file (produced by our own contract-generator.ts). SignWell
 * converts the document itself, so no separate PDF conversion step is needed.
 * Signature/date fields come from {{signature:N}}/{{date:N}} text tags
 * baked into the document content (text_tags: true), not pixel coordinates -
 * robust against the filled document's length varying between deals.
 */
export async function createAndSendSignatureRequest(params: {
  fileName: string;
  fileBuffer: Buffer;
  documentName: string;
  recipients: SignWellRecipient[];
  metadata?: Record<string, string>;
}): Promise<SignWellDocument> {
  const res = await fetch(`${SIGNWELL_API_BASE}/documents`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      test_mode: process.env.SIGNWELL_TEST_MODE === "true",
      name: params.documentName,
      files: [{ name: params.fileName, file_base64: params.fileBuffer.toString("base64") }],
      recipients: params.recipients,
      text_tags: true,
      draft: false,
      metadata: params.metadata,
    }),
  });

  if (!res.ok) {
    throw new Error(`SignWell: kunne ikke oprette dokument (${res.status}): ${await res.text()}`);
  }

  return res.json();
}

/** Fetches the completed, signed PDF as a URL (SignWell hosts the file). */
export async function getCompletedPdfUrl(documentId: string): Promise<string> {
  const res = await fetch(`${SIGNWELL_API_BASE}/documents/${documentId}/completed_pdf?url_only=true`, {
    headers: headers(),
  });
  if (!res.ok) {
    throw new Error(`SignWell: kunne ikke hente underskrevet PDF (${res.status})`);
  }
  const data = (await res.json()) as { file_url: string };
  return data.file_url;
}

export async function downloadCompletedPdf(documentId: string): Promise<ArrayBuffer> {
  const fileUrl = await getCompletedPdfUrl(documentId);
  const res = await fetch(fileUrl);
  if (!res.ok) {
    throw new Error(`SignWell: kunne ikke downloade underskrevet PDF (${res.status})`);
  }
  return res.arrayBuffer();
}

/**
 * Registers our webhook callback URL with SignWell if it isn't already
 * registered (idempotent - safe to call on every send). Returns the
 * webhook's id, which SignWell uses as the HMAC key for event.hash
 * verification (see verifyWebhookHash) - stored so later verification
 * doesn't need another API round-trip.
 */
export async function ensureWebhookRegistered(callbackUrl: string): Promise<string | null> {
  const listRes = await fetch(`${SIGNWELL_API_BASE}/hooks`, { headers: headers() });
  if (listRes.ok) {
    const hooks = (await listRes.json()) as { id: string; callback_url: string }[];
    const existing = hooks.find((h) => h.callback_url === callbackUrl);
    if (existing) return existing.id;
  } else if (listRes.status === 401) {
    throw new Error(`SignWell afviste API-nøglen (401): ${await listRes.text()}`);
  }

  const createRes = await fetch(`${SIGNWELL_API_BASE}/hooks`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ callback_url: callbackUrl }),
  });
  if (!createRes.ok) {
    throw new Error(`SignWell: kunne ikke oprette webhook (${createRes.status}): ${await createRes.text()}`);
  }
  const created = (await createRes.json()) as { id: string };
  return created.id;
}

/** Verifies event.hash = HMAC-SHA256(webhookId, `${event.type}@${event.time}`). */
export function verifyWebhookHash(eventType: string, eventTime: number, hash: string): boolean {
  const webhookId = process.env.SIGNWELL_WEBHOOK_ID;
  if (!webhookId) {
    // Not yet registered/configured - accept but this should be locked down once set.
    return true;
  }
  const data = `${eventType}@${eventTime}`;
  const expected = crypto.createHmac("sha256", webhookId).update(data).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(hash));
  } catch {
    return false;
  }
}
