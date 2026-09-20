import { isIntegrationEnabled, isDineroTestMode } from "@/lib/integration-settings";

const DINERO_API_BASE = "https://api.dinero.dk/v1";
const DINERO_AUTH_URL = "https://authz.dinero.dk/dineroapi/oauth/token";

/**
 * Wraps fetch with a small retry-with-backoff for Dinero's rate limiting
 * (429 Too Many Requests) and transient 5xx responses. A bulk run drafts
 * many invoices back-to-back (each involving several Dinero calls: token,
 * contact lookup/create/update, invoice create), which can burst past
 * Dinero's rate limit even though the calls are sequential - retrying
 * instead of failing the line outright avoids marking invoices as FAILED
 * when the real problem is "try again in a second", not a real error.
 */
async function dineroFetch(url: string, init: RequestInit, attempt = 1): Promise<Response> {
  const res = await fetch(url, init);
  if (res.status !== 429 && !(res.status >= 500 && res.status < 600)) return res;
  if (attempt >= 4) return res;

  const retryAfterHeader = res.headers.get("Retry-After");
  const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : NaN;
  const backoffMs = Number.isFinite(retryAfterMs) && retryAfterMs > 0 ? retryAfterMs : 1000 * 2 ** (attempt - 1);

  await new Promise((resolve) => setTimeout(resolve, backoffMs));
  return dineroFetch(url, init, attempt + 1);
}

function hasDineroCredentials(): boolean {
  return Boolean(
    process.env.DINERO_CLIENT_ID &&
      process.env.DINERO_CLIENT_SECRET &&
      process.env.DINERO_API_KEY &&
      process.env.DINERO_ORGANIZATION_ID &&
      process.env.DINERO_SALES_ACCOUNT_NUMBER
  );
}

export async function isDineroConfigured(): Promise<boolean> {
  if (!hasDineroCredentials()) return false;
  return isIntegrationEnabled("DINERO");
}

/**
 * Dinero's OAuth2 "password" grant, scoped to a single organization by
 * passing that organization's personal API key as both username and
 * password (per Dinero's personal-integration docs at
 * developer.dinero.dk/documentation/personal-integration/).
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
    body: new URLSearchParams({
      grant_type: "password",
      scope: "read write",
      username: apiKey,
      password: apiKey,
    }),
  });

  if (!res.ok) throw new Error(`Dinero: kunne ikke godkende (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

type DineroContactInput = {
  name: string;
  cvr: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
};

/** Splits a one-line Danish address ("Vesterbro 18, st, 9000 Aalborg") into the
 * separate street/zip/city fields Dinero's contact form expects, rather than
 * dumping the whole thing into Street and leaving Postnr/By blank. */
function splitDanishAddress(address: string | null): { street: string; zipCode: string; city: string } {
  if (!address) return { street: "", zipCode: "", city: "" };
  const match = address.match(/^([\s\S]*?),?\s*(\d{4})\s+([\s\S]+)$/);
  if (match) return { street: match[1].trim(), zipCode: match[2], city: match[3].trim() };
  return { street: address, zipCode: "", city: "" };
}

/** A contact created by an earlier version of this integration could have
 * literally stored the text "undefined" as its CVR (from an unguarded
 * template-literal interpolation, before `?? ""` was added) - `?? ""` alone
 * doesn't catch that, since it's a real non-nullish string, not null or
 * undefined. Treat that literal text the same as genuinely missing. */
function sanitizeCvr(cvr: string | null): string {
  const trimmed = (cvr ?? "").trim();
  return trimmed.toLowerCase() === "undefined" || trimmed.toLowerCase() === "null" ? "" : trimmed;
}

/**
 * Dinero doesn't reliably auto-fill name/address from CVR on its own (the
 * "Opdatér automatisk fra CVR" checkbox stayed unchecked regardless), so we
 * send our own - already CVR-verified when the deal was first created -
 * name and address, plus CVR, email and phone.
 */
function contactBody(input: DineroContactInput) {
  const { street, zipCode, city } = splitDanishAddress(input.address);
  const cvr = sanitizeCvr(input.cvr);
  return {
    Name: input.name,
    Cvr: cvr,
    // Contacts are looked up by "VatNumber eq ..." (Cvr isn't a filterable
    // property - see findContactByCvr), which suggests Dinero's CVR-nummer
    // UI field (with its "DK" country-code selector) is actually bound to
    // VatNumber, not Cvr - sending both since a fresh contact still came
    // back with an empty CVR field even with Cvr set correctly.
    VatNumber: cvr || undefined,
    Email: input.email ?? undefined,
    Phone: input.phone ?? undefined,
    Street: street || undefined,
    ZipCode: zipCode || undefined,
    City: city || undefined,
    CountryKey: "DK",
    IsPerson: false,
    PaymentConditionType: "Netto",
    PaymentConditionNumberOfDays: 8,
  };
}

/** Creates a Dinero contact and returns its ContactGuid. */
async function createContact(accessToken: string, input: DineroContactInput): Promise<string> {
  const orgId = process.env.DINERO_ORGANIZATION_ID!;

  const res = await dineroFetch(`${DINERO_API_BASE}/${orgId}/contacts`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(contactBody(input)),
  });

  if (!res.ok) throw new Error(`Dinero: kunne ikke oprette kontakt (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { ContactGuid: string };
  return data.ContactGuid;
}

/**
 * Refreshes an already-existing Dinero contact's fields (name, CVR, address).
 * A contact's ContactGuid is cached on the deal (or found again by CVR) and
 * reused for every later invoice, so a contact created before a data-quality
 * fix landed - e.g. the CVR/address-split fix - would otherwise stay wrong in
 * Dinero forever. Called every time an existing contact is reused, so it
 * self-heals with the deal's current data instead of requiring a manual fix
 * in Dinero. Best-effort: a failure here shouldn't block drafting the
 * invoice itself, since the contact already exists and works either way.
 */
async function updateContact(accessToken: string, contactGuid: string, input: DineroContactInput): Promise<void> {
  const orgId = process.env.DINERO_ORGANIZATION_ID!;

  const res = await dineroFetch(`${DINERO_API_BASE}/${orgId}/contacts/${contactGuid}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(contactBody(input)),
  });

  if (!res.ok) throw new Error(`Dinero: kunne ikke opdatere kontakt (${res.status}): ${await res.text()}`);
}

/** Looks up an existing Dinero contact by CVR number. Returns null if none is found. */
async function findContactByCvr(accessToken: string, cvr: string): Promise<string | null> {
  const orgId = process.env.DINERO_ORGANIZATION_ID!;
  // The filterable property is VatNumber, not Cvr (Cvr is only a valid field
  // name for creating a contact, not for filtering an existing one).
  const query = new URLSearchParams({ queryFilter: `VatNumber eq '${cvr}'` });

  const res = await dineroFetch(`${DINERO_API_BASE}/${orgId}/contacts?${query}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) throw new Error(`Dinero: kunne ikke slå kontakt op på CVR (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { Collection: { ContactGuid: string }[] };
  return data.Collection[0]?.ContactGuid ?? null;
}

export type DineroInvoiceLine = { description: string; amount: number };

type DineroInvoiceInput = {
  contactGuid: string;
  /** Invoice-level free-text note shown near the top of the document (Dinero's own "Description" field) -
   * e.g. "Etablering af Hjemmeside + Nextview360 Tour" - distinct from each line's own description. */
  note: string;
  lines: DineroInvoiceLine[];
  invoiceDate: Date;
};

/** Thrown when Dinero rejects a contact GUID as nonexistent (e.g. it was
 * cached on the deal but has since been deleted directly in Dinero) - lets
 * the caller retry once with a freshly created contact instead of just
 * failing outright. */
class DineroInvalidContactError extends Error {}

/** Creates a new invoice in Dinero. Invoices are created as drafts by default. */
async function createInvoiceDraft(
  accessToken: string,
  input: DineroInvoiceInput
): Promise<{ guid: string; number: string | null }> {
  const orgId = process.env.DINERO_ORGANIZATION_ID!;

  const res = await dineroFetch(`${DINERO_API_BASE}/${orgId}/invoices`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      ContactGuid: input.contactGuid,
      Date: input.invoiceDate.toISOString().slice(0, 10),
      // Comment is Dinero's free-text note shown near the top of the invoice
      // (labelled "Kommentarer" in their UI) - distinct from Description,
      // which Dinero treats as a short document title/type and defaults to
      // "Faktura" when left unset, which is what we want there.
      Comment: input.note,
      PaymentConditionType: "Netto",
      PaymentConditionNumberOfDays: 8,
      ProductLines: input.lines.map((line) => ({
        Description: line.description,
        Quantity: 1,
        Unit: "parts",
        BaseAmountValue: line.amount,
        AccountNumber: Number(process.env.DINERO_SALES_ACCOUNT_NUMBER),
      })),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    if (res.status === 400 && body.includes("invalidContactId")) {
      throw new DineroInvalidContactError(`Dinero: kunne ikke oprette faktura-kladde (${res.status}): ${body}`);
    }
    throw new Error(`Dinero: kunne ikke oprette faktura-kladde (${res.status}): ${body}`);
  }
  const data = (await res.json()) as { Guid: string; Number?: string };
  return { guid: data.Guid, number: data.Number ?? null };
}

/**
 * Checks whether a Dinero invoice has been paid. Only meaningful once the
 * invoice has actually been sent/booked from within Dinero (we only ever
 * create drafts) - an unsent draft will simply come back as not paid.
 * Uses PaymentDate being set as the paid signal rather than matching an
 * exact PaymentStatus string, since that enum's values aren't confirmed.
 */
export async function getInvoicePaymentStatus(invoiceGuid: string): Promise<{ paid: boolean; paidDate: string | null }> {
  if (await isDineroTestMode()) return { paid: false, paidDate: null };

  const accessToken = await getAccessToken();
  const orgId = process.env.DINERO_ORGANIZATION_ID!;

  const res = await dineroFetch(`${DINERO_API_BASE}/${orgId}/invoices/${invoiceGuid}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) throw new Error(`Dinero: kunne ikke hente fakturastatus (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { PaymentDate?: string | null };
  return { paid: Boolean(data.PaymentDate), paidDate: data.PaymentDate ?? null };
}

export type DineroDraftResult = {
  contactGuid: string;
  invoiceGuid: string;
  invoiceNumber: string | null;
  /** True if this was a test-mode simulation - no real Dinero API call was made. */
  isTest?: boolean;
};

export async function createQuarterlyInvoiceDraft(params: {
  existingContactGuid: string | null;
  companyName: string;
  cvrNumber: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  address: string | null;
  note: string;
  lines: DineroInvoiceLine[];
  invoiceDate: Date;
}): Promise<DineroDraftResult> {
  if (await isDineroTestMode()) {
    const fake = Math.random().toString(36).slice(2, 8);
    return {
      contactGuid: params.existingContactGuid ?? `TEST-CONTACT-${fake}`,
      invoiceGuid: `TEST-INVOICE-${fake}`,
      invoiceNumber: `TEST-${fake.toUpperCase()}`,
      isTest: true,
    };
  }

  const accessToken = await getAccessToken();
  const contactInput: DineroContactInput = {
    name: params.companyName,
    cvr: params.cvrNumber,
    email: params.contactEmail,
    phone: params.contactPhone,
    address: params.address,
  };

  const reusedContactGuid =
    params.existingContactGuid ?? (params.cvrNumber ? await findContactByCvr(accessToken, params.cvrNumber) : null);

  const contactGuid = reusedContactGuid ?? (await createContact(accessToken, contactInput));
  // A reused contact may have been created before a data-quality fix (e.g.
  // the CVR/address-split fix) landed, so refresh it with the deal's current
  // data on every use rather than leaving it wrong in Dinero indefinitely.
  if (reusedContactGuid) {
    try {
      await updateContact(accessToken, reusedContactGuid, contactInput);
    } catch (err) {
      console.error("Dinero: kunne ikke opdatere eksisterende kontakt", err);
    }
  }

  try {
    const invoice = await createInvoiceDraft(accessToken, {
      contactGuid,
      note: params.note,
      lines: params.lines,
      invoiceDate: params.invoiceDate,
    });
    return { contactGuid, invoiceGuid: invoice.guid, invoiceNumber: invoice.number };
  } catch (err) {
    // The cached/reused contact GUID no longer exists in Dinero (e.g. it was
    // deleted there directly) - create a fresh contact and retry once,
    // rather than leaving the deal permanently stuck drafting against a
    // dead contact ID.
    if (!(err instanceof DineroInvalidContactError)) throw err;

    const freshContactGuid = await createContact(accessToken, contactInput);
    const invoice = await createInvoiceDraft(accessToken, {
      contactGuid: freshContactGuid,
      note: params.note,
      lines: params.lines,
      invoiceDate: params.invoiceDate,
    });
    return { contactGuid: freshContactGuid, invoiceGuid: invoice.guid, invoiceNumber: invoice.number };
  }
}
