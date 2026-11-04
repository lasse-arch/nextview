import "server-only";
import { randomInt } from "node:crypto";

/*
 * A showcase link's secret part, readable: the tour's own name and a short
 * code - /vis/skyum-idraetsefterskole-k7m2x9qa4b instead of a long jumble that
 * looks like phishing in an SMS. The code is 10 characters from 31 that can't
 * be mistaken for each other (no 0/o, 1/l/i): ~8·10^14 to guess from, and
 * /vis allows each address only a few opens a minute. Old links keep working.
 */
const CHARS = "abcdefghjkmnpqrstuvwxyz23456789";

export function niceDemoToken(slug: string): string {
  const name =
    slug
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .replace(/-+$/, "") || "tour";
  let code = "";
  for (let i = 0; i < 10; i++) code += CHARS[randomInt(CHARS.length)];
  return `${name}-${code}`;
}
