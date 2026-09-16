import { isIntegrationEnabled } from "@/lib/integration-settings";

const PANDADOC_API_BASE = "https://api.pandadoc.com/public/v1";

function hasPandaDocCredentials(): boolean {
  return Boolean(process.env.PANDADOC_API_KEY && process.env.PANDADOC_TEMPLATE_ID);
}

export async function isPandaDocConfigured(): Promise<boolean> {
  if (!hasPandaDocCredentials()) return false;
  return isIntegrationEnabled("PANDADOC");
}

function getApiKey(): string {
  const key = process.env.PANDADOC_API_KEY;
  if (!key) throw new Error("PANDADOC_API_KEY er ikke konfigureret");
  return key;
}

function authHeader(): Record<string, string> {
  return { Authorization: `API-Key ${getApiKey()}` };
}

type DealForContract = {
  companyName: string;
  contactName: string | null;
  contactEmail: string | null;
  soldProduct: string | null;
  bindingMonths: number | null;
  saleAmount: number | null;
  owner: { name: string; email: string };
};

function splitName(fullName: string | null): { first: string; last: string } {
  if (!fullName || !fullName.trim()) return { first: "Kunde", last: "" };
  const parts = fullName.trim().split(/\s+/);
  return { first: parts[0], last: parts.slice(1).join(" ") || parts[0] };
}

/**
 * Token names must match exactly what is defined in your PandaDoc template
 * (Content Library → your template → Tokens). Rename the `name` values below
 * if your template uses different token names.
 */
function buildTokens(deal: DealForContract) {
  return [
    { name: "Client.Company", value: deal.companyName },
    { name: "Client.Name", value: deal.contactName ?? "" },
    { name: "Client.Email", value: deal.contactEmail ?? "" },
    { name: "Deal.Product", value: deal.soldProduct ?? "" },
    { name: "Deal.BindingMonths", value: deal.bindingMonths != null ? String(deal.bindingMonths) : "" },
    { name: "Deal.Price", value: deal.saleAmount != null ? String(deal.saleAmount) : "" },
    { name: "Seller.Name", value: deal.owner.name },
    { name: "Seller.Email", value: deal.owner.email },
  ];
}

export async function createDocumentFromDeal(
  deal: DealForContract,
  documentName: string
): Promise<{ id: string; status: string }> {
  const templateId = process.env.PANDADOC_TEMPLATE_ID;
  if (!templateId) throw new Error("PANDADOC_TEMPLATE_ID er ikke konfigureret");

  const recipientRole = process.env.PANDADOC_CLIENT_ROLE || "Client";
  const { first, last } = splitName(deal.contactName);

  const res = await fetch(`${PANDADOC_API_BASE}/documents`, {
    method: "POST",
    headers: { ...authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({
      name: documentName,
      template_uuid: templateId,
      recipients: [
        {
          email: deal.contactEmail ?? undefined,
          first_name: first,
          last_name: last,
          role: recipientRole,
        },
      ],
      tokens: buildTokens(deal),
    }),
  });

  if (!res.ok) {
    throw new Error(`PandaDoc: kunne ikke oprette dokument (${res.status}): ${await res.text()}`);
  }

  return res.json();
}

export async function sendDocument(documentId: string, message?: string): Promise<void> {
  const res = await fetch(`${PANDADOC_API_BASE}/documents/${documentId}/send`, {
    method: "POST",
    headers: { ...authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({
      message: message || "Se venligst kontrakten og underskriv.",
      silent: false,
    }),
  });

  if (!res.ok) {
    throw new Error(`PandaDoc: kunne ikke sende dokument (${res.status}): ${await res.text()}`);
  }
}

/**
 * A document freshly created from a template starts as "document.uploaded"
 * while PandaDoc processes the tokens/fields, then becomes "document.draft"
 * (ready to send). We poll briefly for that transition before calling send.
 */
export async function waitForDocumentDraftReady(documentId: string, attempts = 10, delayMs = 1500) {
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(`${PANDADOC_API_BASE}/documents/${documentId}`, {
      headers: authHeader(),
    });
    if (res.ok) {
      const data = (await res.json()) as { status: string };
      if (data.status === "document.draft" || data.status === "document.error") {
        return data.status;
      }
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return null;
}

export async function downloadSignedDocument(documentId: string): Promise<ArrayBuffer> {
  const res = await fetch(`${PANDADOC_API_BASE}/documents/${documentId}/download`, {
    headers: authHeader(),
  });
  if (!res.ok) {
    throw new Error(`PandaDoc: kunne ikke downloade dokument (${res.status})`);
  }
  return res.arrayBuffer();
}
