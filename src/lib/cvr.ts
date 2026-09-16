export type CvrCompanyData = {
  cvr: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
};

export type CvrLookupResult =
  | { ok: true; data: CvrCompanyData }
  | { ok: false; error: string };

function isOfficialConfigured(): boolean {
  return Boolean(process.env.CVR_API_USERNAME && process.env.CVR_API_PASSWORD);
}

type VirkAddress = {
  vejnavn?: string | null;
  husnummerFra?: number | null;
  husnummerTil?: number | null;
  bogstavFra?: string | null;
  bogstavTil?: string | null;
  postnummer?: number | null;
  postdistrikt?: string | null;
};

function formatVirkAddress(addr: VirkAddress | null | undefined): string | null {
  if (!addr) return null;
  let houseNumber = "";
  if (addr.husnummerFra != null) {
    houseNumber = `${addr.husnummerFra}${addr.bogstavFra ?? ""}`;
    if (addr.husnummerTil != null) {
      houseNumber += `-${addr.husnummerTil}${addr.bogstavTil ?? ""}`;
    }
  }
  const street = [addr.vejnavn, houseNumber].filter(Boolean).join(" ");
  const city = addr.postnummer && addr.postdistrikt ? `${addr.postnummer} ${addr.postdistrikt}` : addr.postdistrikt;
  return [street, city].filter(Boolean).join(", ") || null;
}

/**
 * Official CVR register (distribution.virk.dk, cvr-permanent Elasticsearch index).
 * Requires a free system-user (Basic Auth). Note: this government host only
 * serves this API over plain HTTP (HTTPS connects but resets) - that's the
 * documented behavior of the service itself, not something we can change.
 * The data returned is the public company register, not sensitive in transit.
 */
async function lookupViaOfficialApi(cvrNumber: string): Promise<CvrLookupResult> {
  const username = process.env.CVR_API_USERNAME!;
  const password = process.env.CVR_API_PASSWORD!;
  const auth = Buffer.from(`${username}:${password}`).toString("base64");

  let res: Response;
  try {
    res = await fetch("http://distribution.virk.dk/cvr-permanent/virksomhed/_search", {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: { term: { "Vrvirksomhed.cvrNummer": Number(cvrNumber) } } }),
    });
  } catch {
    return { ok: false, error: "Kunne ikke kontakte det officielle CVR-register. Prøv igen senere." };
  }

  if (res.status === 401 || res.status === 403) {
    return { ok: false, error: "Adgang til det officielle CVR-register blev afvist (tjek brugernavn/adgangskode)." };
  }
  if (!res.ok) {
    return { ok: false, error: "Det officielle CVR-register svarede med en fejl." };
  }

  const json = await res.json();
  const hit = json?.hits?.hits?.[0]?._source?.Vrvirksomhed;
  if (!hit) {
    return { ok: false, error: "Intet firma fundet med det CVR-nummer." };
  }

  const meta = hit.virksomhedMetadata ?? {};
  const name: string | null = meta.nyesteNavn?.navn ?? null;
  if (!name) {
    return { ok: false, error: "Intet firmanavn fundet for det CVR-nummer." };
  }

  const contactInfo: string[] = Array.isArray(meta.nyesteKontaktoplysninger) ? meta.nyesteKontaktoplysninger : [];
  const email = contactInfo.find((c) => c.includes("@")) ?? null;
  const phone = contactInfo.find((c) => !c.includes("@")) ?? null;

  return {
    ok: true,
    data: {
      cvr: cvrNumber,
      name,
      address: formatVirkAddress(meta.nyesteBeliggenhedsadresse),
      phone,
      email,
    },
  };
}

function formatCvrApiAddress(raw: {
  address?: string | null;
  zipcode?: string | number | null;
  city?: string | null;
}): string | null {
  const parts = [raw.address, raw.zipcode && raw.city ? `${raw.zipcode} ${raw.city}` : raw.city].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

/** Fallback: cvrapi.dk, a free wrapper around the CVR register. No signup
 * required for normal internal-tool volume, but subject to a per-IP quota. */
async function lookupViaCvrApiDk(cvrNumber: string): Promise<CvrLookupResult> {
  const userAgent = process.env.CVR_LOOKUP_USER_AGENT || "Nextview360 CRM (kontakt: admin@nextview360.dk)";

  let res: Response;
  try {
    res = await fetch(`https://cvrapi.dk/api?search=${cvrNumber}&country=dk`, {
      headers: { "User-Agent": userAgent },
    });
  } catch {
    return { ok: false, error: "Kunne ikke kontakte CVR-opslagstjenesten. Prøv igen senere." };
  }

  let json: Record<string, unknown>;
  try {
    json = await res.json();
  } catch {
    return { ok: false, error: "Uventet svar fra CVR-opslagstjenesten." };
  }

  if (!res.ok || typeof json.error === "string") {
    const code = typeof json.error === "string" ? json.error : "";
    if (code === "NOT_FOUND") return { ok: false, error: "Intet firma fundet med det CVR-nummer." };
    if (code === "QUOTA_EXCEEDED")
      return { ok: false, error: "CVR-opslag er midlertidigt ikke tilgængeligt (kvote opbrugt). Udfyld manuelt." };
    return { ok: false, error: "Kunne ikke slå CVR-nummeret op. Udfyld manuelt." };
  }

  const name = typeof json.name === "string" ? json.name : null;
  if (!name) return { ok: false, error: "Intet firmanavn fundet for det CVR-nummer." };

  return {
    ok: true,
    data: {
      cvr: cvrNumber,
      name,
      address: formatCvrApiAddress({
        address: typeof json.address === "string" ? json.address : null,
        zipcode: (json.zipcode as string | number | undefined) ?? null,
        city: typeof json.city === "string" ? json.city : null,
      }),
      phone: typeof json.phone === "string" ? json.phone : json.phone != null ? String(json.phone) : null,
      email: typeof json.email === "string" ? json.email : null,
    },
  };
}

export async function lookupCvrNumber(cvrNumber: string): Promise<CvrLookupResult> {
  const cleaned = cvrNumber.replace(/\s|-/g, "");
  if (!/^\d{8}$/.test(cleaned)) {
    return { ok: false, error: "CVR-nummer skal være 8 cifre." };
  }

  if (isOfficialConfigured()) {
    const result = await lookupViaOfficialApi(cleaned);
    if (result.ok || result.error === "Intet firma fundet med det CVR-nummer.") {
      return result;
    }
    // Official API errored (network/auth) - fall back rather than block the user.
    return lookupViaCvrApiDk(cleaned);
  }

  return lookupViaCvrApiDk(cleaned);
}
