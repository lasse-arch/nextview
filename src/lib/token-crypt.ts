import "server-only";
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";

/*
 * Gmail's tokens (EmailAccount.accessToken / refreshToken) are kept encrypted
 * in the database (AES-256-GCM) - a copy of the database alone gives no
 * access to anyone's mailbox. The key is TOKEN_ENCRYPTION_KEY in Vercel; until
 * that is set, one derived from AUTH_SECRET just for this (so nothing stops
 * working). A stored value says which key it was sealed with ("enc1:" own key,
 * "enc0:" derived), so it can be opened later and sealed again with the best
 * key - and a value from before (plain text) is still read, and sealed on its
 * next use (see resealEmailTokens).
 */

type Version = "enc1" | "enc0";

function keyFor(version: Version): Buffer | null {
  if (version === "enc1") {
    const k = process.env.TOKEN_ENCRYPTION_KEY;
    return k ? createHash("sha256").update(k).digest() : null;
  }
  const secret = process.env.AUTH_SECRET;
  return secret ? Buffer.from(hkdfSync("sha256", secret, "arpo", "gmail-tokens", 32)) : null;
}

/** The key new values are sealed with: the own one when it is set. */
const best = (): Version => (process.env.TOKEN_ENCRYPTION_KEY ? "enc1" : "enc0");

export function sealToken(plain: string | null | undefined): string | null {
  if (!plain) return null;
  const version = best();
  const key = keyFor(version);
  if (!key) throw new Error("Hverken TOKEN_ENCRYPTION_KEY eller AUTH_SECRET er sat - Gmail-adgangen kan ikke gemmes krypteret.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${version}:${Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64")}`;
}

export function openToken(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const m = /^(enc[01]):(.+)$/.exec(stored);
  // From before encryption: plain text (sealed again on its next use).
  if (!m) return stored;
  const key = keyFor(m[1] as Version);
  if (!key) throw new Error(`Gmail-adgangen kan ikke læses: nøglen mangler (${m[1] === "enc1" ? "TOKEN_ENCRYPTION_KEY" : "AUTH_SECRET"}).`);
  const raw = Buffer.from(m[2], "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}

/** Whether a stored value should be sealed again: plain text, or sealed with a weaker key than the one there is now. */
export const needsReseal = (stored: string | null | undefined): boolean => Boolean(stored) && !stored!.startsWith(`${best()}:`);
