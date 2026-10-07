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
  // Every one of these calls is a live, mutable lookup (token, contact
  // search/create/update, invoice create, payment status) - Next.js's
  // fetch() patches in its own Data Cache by default, and none of these
  // should ever be served stale, so caching is explicitly turned off
  // rather than relying on it happening to not kick in.
  const res = await fetch(url, { ...init, cache: "no-store" });
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

/**
 * A contact created by an earlier version of this integration could have
 * literally stored the text "undefined" as its CVR (from an unguarded
 * template-literal interpolation, before `?? ""` was added) - `?? ""` alone
 * doesn't catch that, since it's a real non-nullish string, not null or
 * undefined. Treat that literal text the same as genuinely missing.
 *
 * Also strips everything but digits - a Danish CVR is always 8 plain
 * digits, so any whitespace/dash/hidden character (e.g. from a CSV import)
 * is definitely not meant to be part of it. This matters a lot here:
 * Dinero's queryFilter is an exact string match, so a CVR with so much as
 * a stray trailing space would silently fail to find a contact that was
 * itself created with the (correctly sanitized) clean value - which is
 * exactly how a duplicate contact could keep getting created for the same
 * company every time its deal's CVR lookup ran.
 */
function sanitizeCvr(cvr: string | null): string {
  const trimmed = (cvr ?? "").trim();
  if (trimmed.toLowerCase() === "undefined" || trimmed.toLowerCase() === "null") return "";
  return trimmed.replace(/\D/g, "");
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

type DineroContactDetail = { name: string | null; cvr: string | null; vatNumber: string | null; email: string | null };

/**
 * Fetches one contact's Name/CVR/VatNumber by its GUID. An earlier attempt
 * at this looked like it 404'd against this organization - but that call
 * happened while a separate bug meant `undefined` was sometimes passed in
 * as the GUID (naturally 404ing, since no contact has that id), not
 * because the endpoint itself is broken. Returns null on any failure
 * rather than throwing, since it's used to enrich an already-known link
 * or a plain listing, not to gate anything.
 */
async function fetchContactDetail(accessToken: string, contactGuid: string): Promise<DineroContactDetail | null> {
  const orgId = process.env.DINERO_ORGANIZATION_ID!;
  const res = await dineroFetch(`${DINERO_API_BASE}/${orgId}/contacts/${contactGuid}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    console.error(`Dinero: kunne ikke hente kontaktdetaljer for ${contactGuid} (${res.status}): ${await res.text()}`);
    return null;
  }
  const data = (await res.json()) as { Name?: string; Cvr?: string; VatNumber?: string; Email?: string };
  return {
    name: data.Name ?? null,
    cvr: data.Cvr ?? null,
    vatNumber: data.VatNumber ?? null,
    email: data.Email ?? null,
  };
}

/**
 * List Contacts v2 (`/v2/{organizationId}/contacts`) - confirmed via
 * Dinero's own OpenAPI spec to take the same queryFilter DSL as v1
 * (identical filterable-fields list, identical response shape), but this is
 * the endpoint Dinero's own docs point at for exactly this use case
 * ("When you want to create a new contact, it's a good idea to query to see
 * if something similar already exists and use that instead").
 */
async function dineroContactsSearch(accessToken: string, queryFilter: string): Promise<string[]> {
  const orgId = process.env.DINERO_ORGANIZATION_ID!;
  // The v2 list also returns contacts deleted in Dinero (deletedOnly=false
  // doesn't change that - checked against a live company), so DeletedAt is
  // asked for and deleted contacts are skipped; otherwise an invoice could be
  // put on a contact someone has deleted. Fields come back spelled exactly as
  // requested ("ContactGuid", "DeletedAt").
  const query = new URLSearchParams({ queryFilter, pageSize: "1000", fields: "ContactGuid,DeletedAt" });

  const res = await dineroFetch(`https://api.dinero.dk/v2/${orgId}/contacts?${query}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Dinero: kunne ikke søge kontakter (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { Collection: { ContactGuid?: string; contactGuid?: string; DeletedAt?: string | null }[] };
  return data.Collection.filter((c) => !c.DeletedAt)
    .map((c) => c.ContactGuid ?? c.contactGuid)
    .filter((g): g is string => Boolean(g));
}

/**
 * Finds a contact by an exact VatNumber match - authoritative when it hits,
 * since a CVR uniquely identifies a company, unlike name matching which
 * breaks on renames, punctuation and Danish characters. Tried before name
 * search for exactly that reason.
 */
async function findContactGuidsByVatNumber(accessToken: string, cvr: string): Promise<string[]> {
  const clean = sanitizeCvr(cvr);
  if (!clean) return [];
  return dineroContactsSearch(accessToken, `VatNumber eq '${clean}'`);
}

/**
 * Finds contacts by a direct, targeted server-side "Name contains" search -
 * "Name" with the "contains" operator is the one property/operator pair
 * Dinero's own 400 error explicitly confirms as valid (its own example:
 * "Name+contains+'test'"), unlike IsDebitor/IsCreditor (rejected outright as
 * unrecognized properties). Targeted rather than listing everything and
 * matching client-side: far fewer requests (no per-contact enrichment
 * needed just to find candidates), and avoids needing any "give me
 * everything" filter at all, which this API doesn't seem to have a
 * reliable one for.
 */
async function nameContainsSearch(accessToken: string, term: string): Promise<string[]> {
  const escaped = term.replace(/'/g, "''");
  return dineroContactsSearch(accessToken, `Name contains '${escaped}'`);
}

const DANISH_TRANSLITERATIONS: [RegExp, string][] = [
  [/æ/g, "ae"],
  [/ø/g, "oe"],
  [/å/g, "aa"],
  [/Æ/g, "Ae"],
  [/Ø/g, "Oe"],
  [/Å/g, "Aa"],
];

async function findContactGuidsByName(accessToken: string, companyName: string): Promise<string[]> {
  const trimmed = companyName.trim();
  if (!trimmed) return [];

  const exact = await nameContainsSearch(accessToken, trimmed);
  if (exact.length > 0) return exact;

  // Fall back to progressively "safer" substrings, in case Dinero's
  // contains-matching mishandles Danish æ/ø/å somewhere along the way -
  // first a plain transliteration of the full name, then just its first
  // word (shorter, more likely to be plain ASCII, and still a real match
  // for company names that lead with an unaccented word).
  const transliterated = DANISH_TRANSLITERATIONS.reduce((s, [pattern, repl]) => s.replace(pattern, repl), trimmed);
  if (transliterated !== trimmed) {
    const byTransliterated = await nameContainsSearch(accessToken, transliterated);
    if (byTransliterated.length > 0) return byTransliterated;
  }

  const firstWord = trimmed.split(/\s+/)[0];
  if (firstWord && firstWord !== trimmed && firstWord.length >= 3) {
    return nameContainsSearch(accessToken, firstWord);
  }
  return [];
}

/**
 * Looks up an existing Dinero contact, preferring an exact CVR/VatNumber
 * match (unambiguous) and falling back to a name search only when that
 * finds nothing - e.g. the existing contact predates us always setting
 * VatNumber, or has no CVR at all. Returns null if nothing matches, and the
 * caller then creates a fresh contact exactly as it always did before this
 * search existed.
 */
async function findContactByCvr(accessToken: string, cvr: string, companyName?: string): Promise<string | null> {
  try {
    const byVat = await findContactGuidsByVatNumber(accessToken, cvr);
    if (byVat.length > 0) return byVat[0];
  } catch (err) {
    console.error("Dinero: kunne ikke slå kontakt op på CVR", err);
  }

  if (!companyName) return null;
  try {
    const guids = await findContactGuidsByName(accessToken, companyName);
    if (guids.length === 0) return null;
    if (guids.length === 1) return guids[0];

    // More than one name match (e.g. two duplicate contacts) - prefer
    // whichever one's CVR actually matches this deal's, if we can tell.
    const cleanCvr = sanitizeCvr(cvr);
    if (!cleanCvr) return guids[0];
    for (const guid of guids) {
      const detail = await fetchContactDetail(accessToken, guid);
      if (detail && (sanitizeCvr(detail.vatNumber) === cleanCvr || sanitizeCvr(detail.cvr) === cleanCvr)) return guid;
    }
    return guids[0];
  } catch (err) {
    // This search is a best-effort optimization to avoid creating a
    // duplicate contact - it must never be the reason an invoice draft
    // fails outright. Worst case on failure: a fresh contact gets created
    // as it always would have before this search existed.
    console.error("Dinero: kunne ikke slå kontakt op på navn", err);
    return null;
  }
}

export type DineroInvoiceLine = { description: string; amount: number };

type DineroInvoiceInput = {
  contactGuid: string;
  /** Invoice-level free-text note shown near the top of the document (Dinero's own "Description" field) -
   * e.g. "Etablering af Hjemmeside + Nextview360 Tour" - distinct from each line's own description. */
  note: string;
  lines: DineroInvoiceLine[];
  invoiceDate: Date;
  /** Netto payment days - 8 unless the due date has to land on a specific
   * day (a Betalingsservice collection date). */
  paymentDays?: number;
  /** Collected through Betalingsservice - turn off the invoice's own online
   * payment options (MobilePay/PensoPay), so it can't also be paid there. */
  collectedViaBetalingsservice?: boolean;
  /** Dinero invoice template (design) to use instead of the default. */
  invoiceTemplateId?: string | null;
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
): Promise<{ guid: string; number: string | null; timestamp: string | null }> {
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
      PaymentConditionNumberOfDays: input.paymentDays ?? 8,
      ...(input.collectedViaBetalingsservice ? { IsMobilePayInvoiceEnabled: false, IsPensoPayEnabled: false } : {}),
      ...(input.invoiceTemplateId ? { InvoiceTemplateId: input.invoiceTemplateId } : {}),
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
  // Dinero's own inconsistency, confirmed via its OpenAPI spec: request
  // bodies use "Timestamp" (one word), but every response (this one,
  // GET .../invoices/{guid}, and the /book response) returns it as
  // "TimeStamp" (capital S) instead - reading it as "Timestamp" here always
  // came back undefined, which is what made bookAndSendInvoice send a null
  // Timestamp to /book and get "The Timestamp field is required." back.
  const data = (await res.json()) as { Guid: string; Number?: string; TimeStamp?: string };
  return { guid: data.Guid, number: data.Number ?? null, timestamp: data.TimeStamp ?? null };
}

/**
 * Books (finalizes) a draft invoice and sends it to the customer by email -
 * so "Opret faktura-kladde" results in the customer actually receiving the
 * invoice, rather than a draft that still has to be reviewed and sent by
 * hand inside Dinero. These are two separate Dinero API calls (confirmed
 * against Dinero's own swagger.json and the eikc/dinero-go client library):
 * POST .../book takes only a Timestamp (the optimistic-concurrency token)
 * and returns a NEW Timestamp, which the follow-up POST .../email call must
 * use - reusing the pre-book Timestamp on the email call fails. Skips the
 * email step entirely (leaving a booked-but-unsent invoice) when there's no
 * receiver address to send to, since Dinero requires one.
 */
async function bookAndSendInvoice(
  accessToken: string,
  invoiceGuid: string,
  timestamp: string | null,
  receiverEmail: string | null
): Promise<void> {
  const orgId = process.env.DINERO_ORGANIZATION_ID!;

  const ts =
    timestamp ??
    (await (async () => {
      const res = await dineroFetch(`${DINERO_API_BASE}/${orgId}/invoices/${invoiceGuid}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(`Dinero: kunne ikke hente faktura før bogføring (${res.status}): ${await res.text()}`);
      const data = (await res.json()) as { TimeStamp?: string };
      return data.TimeStamp ?? null;
    })());
  if (!ts) throw new Error(`Dinero: fandt ingen Timestamp for faktura ${invoiceGuid} - kan ikke bogføre`);

  const bookRes = await dineroFetch(`${DINERO_API_BASE}/${orgId}/invoices/${invoiceGuid}/book`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ Timestamp: ts }),
  });
  if (!bookRes.ok) throw new Error(`Dinero: kunne ikke bogføre faktura (${bookRes.status}): ${await bookRes.text()}`);
  const bookData = (await bookRes.json()) as { TimeStamp?: string };
  const bookedTimestamp = bookData.TimeStamp ?? ts;

  if (!receiverEmail) {
    console.error(`Dinero: faktura ${invoiceGuid} bogført, men ikke sendt - ingen kontakt-mail`);
    return;
  }

  const emailRes = await dineroFetch(`${DINERO_API_BASE}/${orgId}/invoices/${invoiceGuid}/email`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      Timestamp: bookedTimestamp,
      Receiver: receiverEmail,
      // The checkbox shown in Dinero's UI ("Vedhæft faktura som PDF (kun
      // mail)") maps to this field - confirmed via Dinero's OpenAPI spec.
      // "AddVoucherAsAttachment" (no "Pdf") isn't a real field on this
      // model and would have silently been ignored.
      AddVoucherAsPdfAttachment: true,
      // Marked required in Dinero's own spec despite being a plain boolean -
      // sent explicitly rather than relying on an implicit default.
      ShouldAddTrustPilotEmailAsBcc: false,
    }),
  });
  if (!emailRes.ok) throw new Error(`Dinero: kunne ikke afsende faktura (${emailRes.status}): ${await emailRes.text()}`);
}

/**
 * Checks whether a Dinero invoice has been paid.
 *
 * `PaymentDate` turned out to be the invoice's due date (set on every booked
 * invoice regardless of whether it's paid), not a "paid on" date - a bad
 * signal, confirmed when it reported an unsent draft as paid. The `Status`
 * field (Draft/Booked/Paid/OverPaid/Overdue) replaced it and was briefly
 * suspected of the same false positive, but that turned out to be a stale
 * deploy still running the old PaymentDate check at the moment it was
 * tested - a fresh check on the same still-untouched draft correctly came
 * back "Draft". `rawStatus` is kept in the result (and shown by the caller)
 * so that keeps being visible rather than trusted blindly.
 */
export async function getInvoicePaymentStatus(
  invoiceGuid: string
): Promise<{ paid: boolean; paidDate: string | null; rawStatus: string | null }> {
  if (await isDineroTestMode()) return { paid: false, paidDate: null, rawStatus: null };

  const accessToken = await getAccessToken();
  const orgId = process.env.DINERO_ORGANIZATION_ID!;

  const res = await dineroFetch(`${DINERO_API_BASE}/${orgId}/invoices/${invoiceGuid}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) throw new Error(`Dinero: kunne ikke hente fakturastatus (${res.status}): ${await res.text()}`);
  // Confirmed against a live Dinero test company: `Status` is only
  // Draft/Booked; whether it's paid is in `PaymentStatus`
  // (Draft/Booked/Paid/OverPaid/Overdue) - a paid invoice reads
  // Status "Booked", PaymentStatus "Paid".
  const data = (await res.json()) as { Status?: string; PaymentStatus?: string };
  const status = data.PaymentStatus ?? data.Status ?? null;
  const paid = status === "Paid" || status === "OverPaid";
  return { paid, paidDate: null, rawStatus: status };
}

export type DineroDraftResult = {
  contactGuid: string;
  invoiceGuid: string;
  invoiceNumber: string | null;
  /** True if this was a test-mode simulation - no real Dinero API call was made. */
  isTest?: boolean;
  /**
   * Set if the draft was created successfully in Dinero but the follow-up
   * booking/emailing step then failed - the draft still exists under
   * invoiceGuid, so this must never be treated as an overall failure (doing
   * so would make a retry create a second, duplicate draft for the same
   * period). The caller should keep the draft as-is and surface this for
   * manual follow-up (book/send by hand in Dinero, or fix and retry just the
   * send step) instead.
   */
  sendError?: string;
};

/** Runs bookAndSendInvoice but never throws - a failure here must not undo
 * or hide the fact that the draft itself was created successfully. */
async function bookAndSendOrCapture(
  accessToken: string,
  invoiceGuid: string,
  timestamp: string | null,
  receiverEmail: string | null
): Promise<string | undefined> {
  try {
    await bookAndSendInvoice(accessToken, invoiceGuid, timestamp, receiverEmail);
    return undefined;
  } catch (err) {
    console.error(`Dinero: faktura ${invoiceGuid} oprettet, men bogføring/afsendelse fejlede`, err);
    return err instanceof Error ? err.message : "Ukendt fejl ved bogføring/afsendelse";
  }
}

/**
 * Dinero only numbers an invoice when it's booked - the create response
 * (a draft) has no Number - so the real invoice number is read back after
 * booking. Falls back to whatever the draft had if that lookup fails.
 */
async function bookedNumber(invoiceGuid: string, draftNumber: string | null): Promise<string | null> {
  try {
    return (await getInvoiceTotals(invoiceGuid)).number ?? draftNumber;
  } catch {
    return draftNumber;
  }
}

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
  paymentDays?: number;
  collectedViaBetalingsservice?: boolean;
  invoiceTemplateId?: string | null;
}): Promise<DineroDraftResult> {
  const accessToken = await getAccessToken();

  if (await isDineroTestMode()) return createTestModeDraft(accessToken, params);

  const contactInput: DineroContactInput = {
    name: params.companyName,
    cvr: params.cvrNumber,
    email: params.contactEmail,
    phone: params.contactPhone,
    address: params.address,
  };

  const reusedContactGuid =
    params.existingContactGuid ?? (await findContactByCvr(accessToken, params.cvrNumber ?? "", params.companyName));

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
      paymentDays: params.paymentDays,
      collectedViaBetalingsservice: params.collectedViaBetalingsservice,
      invoiceTemplateId: params.invoiceTemplateId,
    });
    const sendError = await bookAndSendOrCapture(accessToken, invoice.guid, invoice.timestamp, params.contactEmail);
    return { contactGuid, invoiceGuid: invoice.guid, invoiceNumber: await bookedNumber(invoice.guid, invoice.number), sendError };
  } catch (err) {
    // The cached/reused contact GUID no longer exists in Dinero (e.g. it was
    // deleted there directly) - re-run the CVR/name search once more before
    // giving up and creating a fresh contact. Without this, a deleted
    // cached contact would always spawn a brand new one even when a
    // perfectly good existing contact for the same company is sitting
    // right there in Dinero - the cache being stale is exactly the
    // situation this search exists to recover from.
    if (!(err instanceof DineroInvalidContactError)) throw err;

    const recoveredGuid = await findContactByCvr(accessToken, params.cvrNumber ?? "", params.companyName);
    const freshContactGuid = recoveredGuid ?? (await createContact(accessToken, contactInput));
    if (recoveredGuid) {
      try {
        await updateContact(accessToken, recoveredGuid, contactInput);
      } catch (updateErr) {
        console.error("Dinero: kunne ikke opdatere genfundet kontakt", updateErr);
      }
    }
    const invoice = await createInvoiceDraft(accessToken, {
      contactGuid: freshContactGuid,
      note: params.note,
      lines: params.lines,
      invoiceDate: params.invoiceDate,
      paymentDays: params.paymentDays,
      collectedViaBetalingsservice: params.collectedViaBetalingsservice,
      invoiceTemplateId: params.invoiceTemplateId,
    });
    const sendError = await bookAndSendOrCapture(accessToken, invoice.guid, invoice.timestamp, params.contactEmail);
    return { contactGuid: freshContactGuid, invoiceGuid: invoice.guid, invoiceNumber: await bookedNumber(invoice.guid, invoice.number), sendError };
  }
}

/**
 * Creates invoice DRAFTS in the real Dinero - never booked, never sent - so
 * the actual layout (template, payment details, comment text) can be looked
 * at in Dinero before anything goes to a customer. Deliberately ignores test
 * mode, since its whole point is to show the real thing. The drafts are
 * made out to our own company (found by CVR, created once if missing) and
 * can be deleted in Dinero afterwards.
 */
export async function createPreviewInvoiceDrafts(
  ownCompany: { name: string; cvr: string },
  drafts: Omit<DineroInvoiceInput, "contactGuid">[]
): Promise<{ guid: string }[]> {
  const accessToken = await getAccessToken();
  const contactGuid =
    (await findContactByCvr(accessToken, ownCompany.cvr, ownCompany.name)) ??
    (await createContact(accessToken, { name: ownCompany.name, cvr: ownCompany.cvr, email: null, phone: null, address: null }));
  const created: { guid: string }[] = [];
  for (const draft of drafts) {
    const invoice = await createInvoiceDraft(accessToken, { ...draft, contactGuid });
    created.push({ guid: invoice.guid });
  }
  return created;
}

/** Marks a test-mode draft's guid in the CRM ("TEST-<real Dinero guid>"),
 * so it's never collected, payment-checked or mistaken for a real invoice. */
export const TEST_DRAFT_PREFIX = "TEST-";

/**
 * Test mode: a real DRAFT in Dinero, on the customer's real contact (found
 * by CVR/name, or created if it doesn't exist yet), so the actual invoice
 * can be looked at in Dinero - but never booked or sent, and an existing
 * contact is never changed. Deleted again with "Slet testkladder".
 */
async function createTestModeDraft(
  accessToken: string,
  params: Parameters<typeof createQuarterlyInvoiceDraft>[0]
): Promise<DineroDraftResult> {
  const contactGuid =
    (await findContactByCvr(accessToken, params.cvrNumber ?? "", params.companyName)) ??
    (await createContact(accessToken, {
      name: params.companyName,
      cvr: params.cvrNumber,
      email: params.contactEmail,
      phone: params.contactPhone,
      address: params.address,
    }));
  const invoice = await createInvoiceDraft(accessToken, {
    contactGuid,
    note: params.note,
    lines: params.lines,
    invoiceDate: params.invoiceDate,
    paymentDays: params.paymentDays,
    collectedViaBetalingsservice: params.collectedViaBetalingsservice,
    invoiceTemplateId: params.invoiceTemplateId,
  });
  return { contactGuid, invoiceGuid: `${TEST_DRAFT_PREFIX}${invoice.guid}`, invoiceNumber: "TEST-KLADDE", isTest: true };
}

/**
 * Deletes a test-mode draft from Dinero. Only ever a draft: an invoice that
 * has been booked in the meantime (by hand in Dinero) is left alone.
 * Returns what happened, for the "Slet testkladder" summary.
 */
export async function deleteTestModeDraft(storedGuid: string): Promise<"deleted" | "gone" | "booked" | "skipped"> {
  const guid = storedGuid.slice(TEST_DRAFT_PREFIX.length);
  // Older test drafts ("TEST-INVOICE-xxxx") were never in Dinero at all.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(guid)) return "skipped";
  const accessToken = await getAccessToken();
  const orgId = process.env.DINERO_ORGANIZATION_ID!;
  const res = await dineroFetch(`${DINERO_API_BASE}/${orgId}/invoices/${guid}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 404) return "gone";
  if (!res.ok) throw new Error(`Dinero: kunne ikke hente testkladde (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { Status?: string; TimeStamp?: string };
  if (data.Status && data.Status !== "Draft") return "booked";
  const del = await dineroFetch(`${DINERO_API_BASE}/${orgId}/invoices/${guid}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ Timestamp: data.TimeStamp }),
  });
  if (del.status === 404) return "gone";
  if (!del.ok) {
    const body = await del.text();
    // Already deleted by hand in Dinero: it still reads fine, but deleting
    // it again is refused with "Item is deleted" (code 65).
    if (del.status === 400 && /is deleted/i.test(body)) return "gone";
    throw new Error(`Dinero: kunne ikke slette testkladde (${del.status}): ${body}`);
  }
  return "deleted";
}

/** A booked invoice's total incl. VAT and current concurrency timestamp. */
export async function getInvoiceTotals(
  invoiceGuid: string
): Promise<{ totalInclVat: number; number: string | null; timestamp: string | null }> {
  const accessToken = await getAccessToken();
  const orgId = process.env.DINERO_ORGANIZATION_ID!;
  const res = await dineroFetch(`${DINERO_API_BASE}/${orgId}/invoices/${invoiceGuid}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Dinero: kunne ikke hente faktura (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { TotalInclVat?: number; Number?: number | string; TimeStamp?: string };
  if (typeof data.TotalInclVat !== "number") throw new Error("Dinero: fakturaen har intet totalbeløb.");
  return {
    totalInclVat: data.TotalInclVat,
    number: data.Number != null ? String(data.Number) : null,
    timestamp: data.TimeStamp ?? null,
  };
}

/**
 * Registers a payment on a booked invoice (POST .../invoices/{guid}/payments)
 * against `depositAccountNumber` - for Betalingsservice that's the
 * mellemregningskonto the bank's lump-sum deposit is reconciled against.
 */
export async function registerInvoicePayment(
  invoiceGuid: string,
  payment: { amount: number; depositAccountNumber: number; paymentDate: Date; description: string; externalReference: string }
): Promise<void> {
  const accessToken = await getAccessToken();
  const orgId = process.env.DINERO_ORGANIZATION_ID!;
  const { timestamp } = await getInvoiceTotals(invoiceGuid);
  const res = await dineroFetch(`${DINERO_API_BASE}/${orgId}/invoices/${invoiceGuid}/payments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      Timestamp: timestamp,
      DepositAccountNumber: payment.depositAccountNumber,
      ExternalReference: payment.externalReference,
      PaymentDate: payment.paymentDate.toISOString().slice(0, 10),
      Description: payment.description,
      Amount: payment.amount,
      RemainderIsFee: false,
    }),
  });
  if (!res.ok) throw new Error(`Dinero: kunne ikke registrere betaling (${res.status}): ${await res.text()}`);
}

/** The organization's invoice templates (designs) - for picking the one
 * Betalingsservice invoices use. */
export async function listInvoiceTemplates(): Promise<{ id: string; name: string; isDefault: boolean }[]> {
  const accessToken = await getAccessToken();
  const orgId = process.env.DINERO_ORGANIZATION_ID!;
  const res = await dineroFetch(`${DINERO_API_BASE}/${orgId}/invoices/templates`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Dinero: kunne ikke hente fakturaskabeloner (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { Id: string; Name: string; IsDefault?: boolean }[];
  return data.map((t) => ({ id: t.Id, name: t.Name, isDefault: Boolean(t.IsDefault) }));
}
