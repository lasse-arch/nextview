import { getInternalState, setInternalState } from "@/lib/integration-settings";

/*
 * What the DocuSeal webhook last received - shown under Indstillinger →
 * Kontrakter, so "the contract wasn't marked opened until we pressed Tjek
 * status" can be answered at a glance: no events at all (wrong address in
 * DocuSeal), refused (the signing key doesn't match), or arriving but
 * without form.viewed (the event isn't ticked in DocuSeal).
 *
 * Nothing from the request body is kept beyond the event's type, and a
 * refused request (which anyone can send) is written at most once a minute.
 */

export type WebhookLog = {
  /** The latest accepted event, and when. */
  ok?: { at: string; type: string };
  /** Accepted event types, each with when it last came. */
  types?: Record<string, string>;
  /** The latest refused request, and why. */
  refused?: { at: string; reason: string };
};

export async function readWebhookLog(): Promise<WebhookLog> {
  try {
    return JSON.parse((await getInternalState("DOCUSEAL_WEBHOOK_LOG")) ?? "{}") as WebhookLog;
  } catch {
    return {};
  }
}

export async function logWebhook(r: { ok: true; type: string } | { ok: false; reason: string }): Promise<void> {
  try {
    const log = await readWebhookLog();
    const now = new Date().toISOString();
    if (r.ok) {
      const type = r.type.replace(/[^a-z._]/gi, "").slice(0, 40) || "ukendt";
      await setInternalState("DOCUSEAL_WEBHOOK_LOG", JSON.stringify({ ...log, ok: { at: now, type }, types: { ...log.types, [type]: now } }));
    } else {
      if (log.refused && Date.now() - new Date(log.refused.at).getTime() < 60_000) return;
      await setInternalState("DOCUSEAL_WEBHOOK_LOG", JSON.stringify({ ...log, refused: { at: now, reason: r.reason } }));
    }
  } catch {
    // Bookkeeping only - never fails the webhook.
  }
}
