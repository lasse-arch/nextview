import "server-only";

/*
 * SMS from Arpo, sent with GatewayAPI (a Danish SMS service). The key is the
 * environment's GATEWAYAPI_TOKEN only - never in the code or the database.
 * Without it, nothing is sent: the caller hands the text to the seller's own
 * phone instead. Only Danish mobile numbers, one recipient per message.
 */

const API = "https://gatewayapi.com/rest/mtsms";
/** The sender shown on the customer's phone (at most 11 letters). */
const SENDER = "Nextview360";

export const smsReady = () => Boolean(process.env.GATEWAYAPI_TOKEN);

/** A Danish number as 45 + 8 digits - null when it isn't one. */
export function danishMobile(raw: string): string | null {
  const d = String(raw ?? "").replace(/[\s()-]/g, "").replace(/^\+/, "").replace(/^0045/, "45");
  const n = /^45\d{8}$/.test(d) ? d : /^\d{8}$/.test(d) ? `45${d}` : null;
  return n;
}

export async function sendSms(to: string, message: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const token = process.env.GATEWAYAPI_TOKEN;
  if (!token) return { ok: false, error: "SMS er ikke sat op endnu (GATEWAYAPI_TOKEN mangler)." };
  const msisdn = danishMobile(to);
  if (!msisdn) return { ok: false, error: "Det ligner ikke et dansk mobilnummer." };
  try {
    const res = await fetch(API, {
      method: "POST",
      headers: { Authorization: `Token ${token}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ sender: SENDER, message: message.slice(0, 918), recipients: [{ msisdn: Number(msisdn) }] }),
      signal: AbortSignal.timeout(15_000),
      redirect: "error",
    });
    const body = (await res.json().catch(() => null)) as { ids?: unknown[]; message?: string } | null;
    if (!res.ok) return { ok: false, error: `GatewayAPI svarede ${res.status}${body?.message ? `: ${String(body.message).slice(0, 160)}` : ""}.` };
    return { ok: true, id: String(body?.ids?.[0] ?? "") };
  } catch (err) {
    return { ok: false, error: `SMS'en kunne ikke sendes (${err instanceof Error ? err.message : String(err)}).` };
  }
}
