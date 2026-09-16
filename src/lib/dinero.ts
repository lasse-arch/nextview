import { isIntegrationEnabled } from "@/lib/integration-settings";

const DINERO_API_BASE = "https://api.dinero.dk/v1";
const DINERO_AUTH_URL = "https://authz.dinero.dk/dinero/oauth/token";

function hasDineroCredentials(): boolean {
  return Boolean(
    process.env.DINERO_CLIENT_ID &&
      process.env.DINERO_CLIENT_SECRET &&
      process.env.DINERO_API_KEY &&
      process.env.DINERO_ORGANIZATION_ID
  );
}

export async function isDineroConfigured(): Promise<boolean> {
  if (!hasDineroCredentials()) return false;
  return isIntegrationEnabled("DINERO");
}

/**
 * Dinero's OAuth2 "password" grant, scoped to a single organization by
 * passing that organization's personal API key as both username and
 * password. Not yet verified against a live Dinero account - built from
 * Dinero's public API documentation. Test and adjust once credentials are
 * available (Dinero -> Indstillinger -> API for the API key; a registered
 * developer app for client id/secret).
 */
async function getAccessToken(): Promise<string> {
  const clientId = process.env.DINERO_CLIENT_ID!;
  const clientSecret = process.env.DINERO_CLIENT_SECRET!;
  const apiKey = process.env.DINERO_API_KEY!;
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch(DINERO_AUTH_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "password", username: apiKey, password: apiKey }),
  });

  if (!res.ok) throw new Error(`Dinero: kunne ikke godkende (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

type DineroContactInput = {
  name: string;
  cvr: string | null;
  email: string | null;
  address: string | null;
};

/** Creates a Dinero contact and returns its ContactGuid. */
async function createContact(accessToken: string, input: DineroContactInput): Promise<string> {
  const orgId = process.env.DINERO_ORGANIZATION_ID!;

  const res = await fetch(`${DINERO_API_BASE}/${orgId}/contacts`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      Name: input.name,
      Cvr: input.cvr ?? undefined,
      Email: input.email ?? undefined,
      Street: input.address ?? undefined,
      Country: "Danmark",
      IsPerson: false,
      PaymentConditionType: "Netto",
      PaymentConditionNumberOfDays: 8,
    }),
  });

  if (!res.ok) throw new Error(`Dinero: kunne ikke oprette kontakt (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { ContactGuid: string };
  return data.ContactGuid;
}

type DineroInvoiceInput = {
  contactGuid: string;
  description: string;
  amount: number;
  invoiceDate: Date;
};

/** Creates a new invoice in Dinero. Invoices are created as drafts by default. */
async function createInvoiceDraft(
  accessToken: string,
  input: DineroInvoiceInput
): Promise<{ guid: string; number: string | null }> {
  const orgId = process.env.DINERO_ORGANIZATION_ID!;

  const res = await fetch(`${DINERO_API_BASE}/${orgId}/invoices`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      ContactGuid: input.contactGuid,
      Date: input.invoiceDate.toISOString().slice(0, 10),
      PaymentConditionType: "Netto",
      PaymentConditionNumberOfDays: 8,
      ProductLines: [
        {
          Description: input.description,
          Quantity: 1,
          BaseAmountValue: input.amount,
        },
      ],
    }),
  });

  if (!res.ok) throw new Error(`Dinero: kunne ikke oprette faktura-kladde (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { Guid: string; Number?: string };
  return { guid: data.Guid, number: data.Number ?? null };
}

export type DineroDraftResult = { contactGuid: string; invoiceGuid: string; invoiceNumber: string | null };

export async function createQuarterlyInvoiceDraft(params: {
  existingContactGuid: string | null;
  companyName: string;
  cvrNumber: string | null;
  contactEmail: string | null;
  address: string | null;
  description: string;
  amount: number;
  invoiceDate: Date;
}): Promise<DineroDraftResult> {
  const accessToken = await getAccessToken();

  const contactGuid =
    params.existingContactGuid ??
    (await createContact(accessToken, {
      name: params.companyName,
      cvr: params.cvrNumber,
      email: params.contactEmail,
      address: params.address,
    }));

  const invoice = await createInvoiceDraft(accessToken, {
    contactGuid,
    description: params.description,
    amount: params.amount,
    invoiceDate: params.invoiceDate,
  });

  return { contactGuid, invoiceGuid: invoice.guid, invoiceNumber: invoice.number };
}
