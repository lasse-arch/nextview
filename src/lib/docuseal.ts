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
 * Creates and immediately sends a submission built from an already-rendered
 * PDF (see contract-html-template.ts + contract-pdf-renderer.ts). Signature/
 * date fields come from {{Sign;type=signature;role=X}}/{{Date;type=date;
 * role=X}} text tags baked into the document content, matched to submitters
 * by `role` - DocuSeal auto-detects these the same way for a PDF as for a
 * docx (verified against the live API before switching to this pipeline).
 */
export async function createAndSendSubmission(params: {
  fileName: string;
  fileBuffer: Buffer;
  documentName: string;
  submitters: DocuSealSubmitter[];
  metadata?: Record<string, string>;
}): Promise<DocuSealSubmission> {
  const res = await fetch(`${DOCUSEAL_API_BASE}/submissions/pdf`, {
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
  documents?: { name: string; url: string }[];
  submitters?: { slug: string; external_id?: string | null; documents?: { name: string; url: string }[] }[];
};

async function getSubmission(submissionId: string): Promise<DocuSealSubmissionDetails> {
  const res = await fetch(`${DOCUSEAL_API_BASE}/submissions/${submissionId}`, { headers: headers() });
  if (!res.ok) {
    throw new Error(`DocuSeal: kunne ikke hente dokumentstatus (${res.status})`);
  }
  return res.json();
}

/**
 * `combined_document_url` is only populated when DocuSeal actually combined
 * multiple documents into one file - for a single-document submission (our
 * case, one PDF per contract) it can be null even once fully signed. Fall
 * back to the submission's own `documents`, then to the first submitter's
 * signed copy, before giving up.
 */
function findSignedDocumentUrl(submission: DocuSealSubmissionDetails): string | null {
  if (submission.combined_document_url) return submission.combined_document_url;
  if (submission.documents?.[0]?.url) return submission.documents[0].url;
  for (const submitter of submission.submitters ?? []) {
    if (submitter.documents?.[0]?.url) return submitter.documents[0].url;
  }
  return null;
}

/**
 * The customer submitter's own signing-form link (`slug`, "unique key to be
 * used in the form signing link" per DocuSeal's API docs) - the exact same
 * live page DocuSeal emailed to them, and what DocuSeal's own admin
 * "Submissions" list opens under "View". Preferred over re-rendering our own
 * copy of the PDF for a preview: this is the real, authoritative document
 * (with live per-submitter status), not a reconstruction.
 */
export async function getCustomerContractViewUrl(submissionId: string): Promise<string | null> {
  const submission = await getSubmission(submissionId);
  const customer = submission.submitters?.find((s) => s.external_id === "customer");
  if (!customer?.slug) return null;
  // The app's customer-facing domain mirrors the API's (api.docuseal.eu ->
  // docuseal.eu), confirmed against DocuSeal's own admin UI, which links to
  // exactly this un-prefixed domain for a submission.
  const appBase = DOCUSEAL_API_BASE.replace("https://api.", "https://");
  return `${appBase}/s/${customer.slug}`;
}

export async function downloadCompletedPdf(submissionId: string): Promise<ArrayBuffer> {
  const submission = await getSubmission(submissionId);
  const documentUrl = findSignedDocumentUrl(submission);
  if (!documentUrl) throw new Error("DocuSeal: ingen underskrevet PDF fundet endnu.");
  const res = await fetch(documentUrl);
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
