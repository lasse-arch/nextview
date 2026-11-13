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
  submitters?: {
    id?: number;
    role?: string;
    external_id?: string;
    /** The signer's own code - their signing page is <signing site>/s/<slug>. */
    slug?: string;
    embed_src?: string;
    status?: string;
    opened_at?: string | null;
    completed_at?: string | null;
    declined_at?: string | null;
    values?: { field?: string; value?: unknown }[];
    documents?: { name: string; url: string }[];
  }[];
  completed_at?: string | null;
};

/**
 * Where DocuSeal shows its signing pages: our own domain on the DocuSeal account (Console → Domains, set as default).
 * DOCUSEAL_SIGN_ORIGIN overrides it (e.g. https://docuseal.eu if the domain is ever taken off).
 */
function signOrigin(): string {
  const o = (process.env.DOCUSEAL_SIGN_ORIGIN ?? "").trim().replace(/\/+$/, "");
  return /^https:\/\/[a-z0-9.-]+$/i.test(o) ? o : "https://sign.nextview360.dk";
}

/** The customer's own signing page in DocuSeal (the same link as the button in DocuSeal's mail), or null when it isn't there. */
export async function customerSigningLink(submissionId: string): Promise<string | null> {
  const s = await getSubmission(submissionId);
  const customer = s.submitters?.find((x) => x.external_id === "customer" || x.role === "Customer");
  // Looking a submission up gives the signer's code (slug), not the link - the link is built from it.
  const url = customer?.embed_src ?? (customer?.slug && /^[A-Za-z0-9_-]{6,64}$/.test(customer.slug) ? `${signOrigin()}/s/${customer.slug}` : null);
  // Only DocuSeal's own addresses - theirs, or our own signing domain there (sign.nextview360.dk) - never anything else from the answer.
  return url && /^https:\/\/(([a-z0-9-]+\.)*docuseal\.(eu|com)|sign\.nextview360\.dk)\//i.test(url) ? url : null;
}

/** DocuSeal sends the customer the signing mail again. */
export async function resendCustomerSigningMail(submissionId: string): Promise<void> {
  const s = await getSubmission(submissionId);
  const customer = s.submitters?.find((x) => x.external_id === "customer" || x.role === "Customer");
  if (!customer?.id) throw new Error("DocuSeal: kunden blev ikke fundet på kontrakten.");
  const res = await fetch(`${DOCUSEAL_API_BASE}/submitters/${customer.id}`, { method: "PUT", headers: headers(), body: JSON.stringify({ send_email: true }) });
  if (!res.ok) throw new Error(`DocuSeal: kunne ikke sende mailen igen (${res.status})`);
}

/**
 * What DocuSeal itself says happened to a submission, as the events its
 * webhook would have sent (in order) - so a lost webhook can be made up for.
 */
export async function submissionEvents(submissionId: string): Promise<{ event_type: string; timestamp: string; data: { submission_id: number; external_id?: string; values?: { field?: string; value?: unknown }[] } }[]> {
  const s = await getSubmission(submissionId);
  const id = Number(submissionId);
  const customer = s.submitters?.find((x) => x.external_id === "customer");
  const out: Awaited<ReturnType<typeof submissionEvents>> = [];
  if (customer?.opened_at) out.push({ event_type: "form.viewed", timestamp: customer.opened_at, data: { submission_id: id, external_id: "customer" } });
  if (customer?.declined_at) out.push({ event_type: "form.declined", timestamp: customer.declined_at, data: { submission_id: id, external_id: "customer" } });
  if (customer?.completed_at) out.push({ event_type: "form.completed", timestamp: customer.completed_at, data: { submission_id: id, external_id: "customer", values: customer.values } });
  const all = s.submitters ?? [];
  if (s.status === "completed" || (all.length > 0 && all.every((x) => x.completed_at))) {
    const at = s.completed_at ?? all.map((x) => x.completed_at ?? "").sort().at(-1) ?? new Date().toISOString();
    out.push({ event_type: "submission.completed", timestamp: at, data: { submission_id: id } });
  }
  return out;
}

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
  // Not configured: refused (a forged "signed" event would mark a contract signed and move the invoice e-mail) - only a developer's own machine lets it through.
  if (!secret) return process.env.NODE_ENV === "development";
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
