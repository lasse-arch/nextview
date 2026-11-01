import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/*
 * One-time OAuth state + PKCE for connecting a Google mailbox: kept in a
 * short-lived httpOnly cookie on the callback's path and bound to the user who
 * started it. A callback without the matching state (someone else's code sent
 * to a logged-in team member) is refused - nothing is saved.
 */

export const MAILBOX_STATE_COOKIE = "nv360_mailbox_oauth";
export const MAILBOX_STATE_PATH = "/api/integrations/google";

export function newMailboxState(userId: string) {
  const state = randomBytes(24).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { state, challenge, cookie: JSON.stringify({ state, verifier, userId }) };
}

const same = (a: string, b: string) => {
  const ab = Buffer.from(a), bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
};

/** The PKCE verifier when the callback's state matches the cookie and the user who started it - else null. */
export function checkMailboxState(cookie: string | undefined, state: string | null, userId: string): string | null {
  if (!cookie || !state) return null;
  try {
    const saved = JSON.parse(cookie) as { state?: unknown; verifier?: unknown; userId?: unknown };
    if (typeof saved.state !== "string" || typeof saved.verifier !== "string" || saved.userId !== userId) return null;
    return same(saved.state, state) ? saved.verifier : null;
  } catch {
    return null;
  }
}
