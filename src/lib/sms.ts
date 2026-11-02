import "server-only";

/*
 * SMS from Arpo, sent with SureSMS (a Danish SMS service). The credentials are
 * the environment's only - never in the code or the database:
 * SURESMS_API_KEY (an API key from app.suresms.com → User API; sent with the
 * login "apikey"), or SURESMS_LOGIN + SURESMS_PASSWORD. They go in the
 * request's body, never in its address (so no log has them). Without them,
 * nothing is sent: the caller hands the text to the seller's own phone
 * instead. Only Danish mobile numbers, one recipient per message.
 */

// developer.suresms.com/https: the HTTPS API (api.suresms.com is only their front page - it answers every send with 401).
const API = "https://apiv2.suresms.com/Script/SendSMS.aspx";
/** The sender shown on the customer's phone (at most 11 letters) - approved by SureSMS, or it answers 401. */
const SENDER = "Nextview360";

function credentials(): { login: string; password: string } | null {
  const key = process.env.SURESMS_API_KEY;
  if (key) return { login: "apikey", password: key };
  const login = process.env.SURESMS_LOGIN;
  const password = process.env.SURESMS_PASSWORD;
  return login && password ? { login, password } : null;
}

export const smsReady = () => Boolean(credentials());

/** A Danish number as 45 + 8 digits - null when it isn't one. */
export function danishMobile(raw: string): string | null {
  const d = String(raw ?? "").replace(/[\s()-]/g, "").replace(/^\+/, "").replace(/^0045/, "45");
  return /^45\d{8}$/.test(d) ? d : /^\d{8}$/.test(d) ? `45${d}` : null;
}

export async function sendSms(to: string, message: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const auth = credentials();
  if (!auth) return { ok: false, error: "SMS er ikke sat op endnu (SURESMS_API_KEY mangler)." };
  const msisdn = danishMobile(to);
  if (!msisdn) return { ok: false, error: "Det ligner ikke et dansk mobilnummer." };
  try {
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
      body: new URLSearchParams({ login: auth.login, password: auth.password, from: SENDER, to: `+${msisdn}`, text: message.slice(0, 918) }).toString(),
      signal: AbortSignal.timeout(15_000),
      redirect: "error",
    });
    // Their answer as plain text (a 401 comes as a whole web page: its title is enough).
    const raw = await res.text().catch(() => "");
    const body = (raw.match(/<title>([^<]*)<\/title>/i)?.[1] ?? raw.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim().slice(0, 160);
    if (res.status === 401) return { ok: false, error: `SureSMS afviste (401): enten er API-nøglen forkert, eller afsendernavnet "${SENDER}" er ikke godkendt hos SureSMS endnu.` };
    if (/don.t know you/i.test(body)) return { ok: false, error: "SureSMS kender ikke login/API-nøglen - tjek SURESMS_API_KEY i Vercel." };
    if (!res.ok) return { ok: false, error: `SureSMS svarede ${res.status}${body ? `: ${body}` : ""}.` };
    // A 200 can still carry an error in its text.
    if (/error|fejl|invalid|denied|not allowed/i.test(body)) return { ok: false, error: `SureSMS: ${body}` };
    return { ok: true, id: body.slice(0, 80) };
  } catch (err) {
    return { ok: false, error: `SMS'en kunne ikke sendes (${err instanceof Error ? err.message : String(err)}).` };
  }
}
