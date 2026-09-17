import crypto from "node:crypto";
import { isIntegrationEnabled } from "@/lib/integration-settings";

// This account is on DocuSeal's EU server (confirmed via a live API check) -
// api.docuseal.com (the global server) rejects this key with 401.
const DOCUSEAL_API_BASE = "https://api.docuseal.eu";

function hasDocuSealCredentials(): boolean {
  return Boolean(process.env.DOCUSEAL_API_KEY);
}

export async function isDocuSealConfigured(): Promise<boolean> {
  if (!hasDocuSealCredentials()) return false;
  return isIntegrationEnabled("DOCUSEAL");
}

function apiKey(): string {
  const key = process.env.DOCUSEAL_API_KEY;
  if (!key) throw new Error("DOCUSEAL_API_KEY er ikke konfigureret");
  return key;
}

function headers(): Record<string, string> {
  return { "X-Auth-Token": apiKey(), "Content-Type": "application/json" };
}

export type DocuSealSubmitter = { role: string; name: string; email: string; externalId: string };

export type DocuSealSubmission = {
  id: number;
  submitters: { id: number; email: string; role: string; external_id?: string }[];
};

/**
 * Creates and immediately sends a submission built from an already finished
 * .docx file (produced by our own contract-generator.ts) - DocuSeal accepts
 * .docx directly, no PDF conversion needed. Signature/date fields come from
 * {{Sign;type=signature;role=X}}/{{Date;type=date;role=X}} text tags baked
 * into the document content, matched to submitters by `role`.
 */
export async function createAndSendSubmission(params: {
  fileName: string;
  fileBuffer: Buffer;
  documentName: string;
  submitters: DocuSealSubmitter[];
  metadata?: Record<string, string>;
}): Promise<DocuSealSubmission> {
  const res = await fetch(`${DOCUSEAL_API_BASE}/submissions/docx`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      name: params.documentName,
      documents: [{ name: params.fileName, file: params.fileBuffer.toString("base64") }],
      submitters: params.submitters.map((s) => ({
        role: s.role,
        name: s.name,
        email: s.email,
        external_id: s.externalId,
      })),
      // "preserved" (the default) only emails the customer after the
      // director has signed - "random" sends to both immediately so the
      // customer isn't stuck waiting on someone here to sign first.
      order: "random",
      metadata: params.metadata,
    }),
  });

  if (!res.ok) {
    throw new Error(`DocuSeal: kunne ikke oprette dokument (${res.status}): ${await res.text()}`);
  }

  const data = (await res.json()) as { id: number; submitters: { id: number; email: string; role: string; external_id?: string }[] };
  if (typeof data.id !== "number" || !Array.isArray(data.submitters)) {
    throw new Error("DocuSeal: uventet svar ved oprettelse af dokument.");
  }
  return { id: data.id, submitters: data.submitters };
}

type DocuSealSubmissionDetails = {
  id: number;
  status: string;
  combined_document_url: string | null;
};

async function getSubmission(submissionId: string): Promise<DocuSealSubmissionDetails> {
  const res = await fetch(`${DOCUSEAL_API_BASE}/submissions/${submissionId}`, { headers: headers() });
  if (!res.ok) {
    throw new Error(`DocuSeal: kunne ikke hente dokumentstatus (${res.status})`);
  }
  return res.json();
}

export async function downloadCompletedPdf(submissionId: string): Promise<ArrayBuffer> {
  const submission = await getSubmission(submissionId);
  if (!submission.combined_document_url) throw new Error("DocuSeal: ingen underskrevet PDF fundet endnu.");
  const res = await fetch(submission.combined_document_url);
  if (!res.ok) {
    throw new Error(`DocuSeal: kunne ikke downloade underskrevet PDF (${res.status})`);
  }
  return res.arrayBuffer();
}

/**
 * Archives an in-progress (not yet completed) submission - used when
 * resending an edited, still-unsigned contract, so the customer can't sign
 * a stale copy if they still have the old email around. Best-effort: errors
 * are swallowed since this must never block sending the replacement.
 */
export async function cancelDocuSealSubmission(submissionId: string): Promise<void> {
  try {
    await fetch(`${DOCUSEAL_API_BASE}/submissions/${submissionId}`, {
      method: "DELETE",
      headers: headers(),
    });
  } catch {
    // Non-fatal - see above.
  }
}

/**
 * Verifies the `X-Docuseal-Signature` header, formatted `<timestamp>.<hmac>`
 * where the hmac is HMAC-SHA256(secret, `${timestamp}.${rawBody}`) - see
 * DocuSeal's webhook docs. Rejects requests older than 5 minutes to guard
 * against replay. DOCUSEAL_WEBHOOK_SECRET comes from the HMAC tab in
 * DocuSeal's Console (webhooks are configured there, not via API).
 */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.DOCUSEAL_WEBHOOK_SECRET;
  if (!secret) {
    // Not yet configured - accept but this should be locked down once set.
    return true;
  }
  if (!signatureHeader) return false;

  const [timestamp, signature] = signatureHeader.split(".", 2);
  if (!timestamp || !signature) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;

  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}
