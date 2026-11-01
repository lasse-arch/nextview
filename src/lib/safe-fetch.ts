import "server-only";
import { lookup, type LookupAddress } from "node:dns";
import { Agent } from "undici";
import { isPublicIp, publicWebUrl } from "@/lib/public-host";

/*
 * Fetching an address someone else chose (a customer's website, a page from a
 * tour's setup, a link found on such a page): only public websites, checked
 * again on every redirect - and in production the IP is checked at the moment
 * the connection is made, so a name can't point somewhere public for the check
 * and somewhere internal for the fetch (DNS rebinding).
 */

type Cb = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;
const pinned = new Agent({
  connect: {
    lookup(hostname: string, opts: { all?: boolean }, cb: Cb) {
      lookup(hostname, { all: true, verbatim: true }, (err, list) => {
        if (err) return cb(err, "");
        if (!list.length || list.some((a) => !isPublicIp(a.address))) return cb(Object.assign(new Error(`Blocked address for ${hostname}`), { code: "EBLOCKED" }), "");
        return opts.all ? cb(null, list) : cb(null, list[0].address, list[0].family);
      });
    },
  } as never,
});

export class BlockedAddress extends Error {}

/** fetch() for an address from outside: public http(s) only, every redirect re-checked (at most `maxRedirects`). Throws BlockedAddress when it isn't allowed. */
export async function safeFetch(raw: string | URL, init: RequestInit & { maxRedirects?: number } = {}): Promise<Response> {
  const { maxRedirects = 5, ...rest } = init;
  let next = String(raw);
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const url = await publicWebUrl(next);
    if (!url) throw new BlockedAddress("Adressen er ikke en offentlig hjemmeside.");
    const res = await fetch(url, { ...rest, redirect: "manual", ...(process.env.NODE_ENV === "production" ? { dispatcher: pinned } : {}) } as RequestInit);
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      next = new URL(res.headers.get("location")!, url).href;
      continue;
    }
    return res;
  }
  throw new BlockedAddress("For mange omdirigeringer.");
}

/** A response's body, at most `max` bytes (read as it comes - a lying content-length doesn't matter). */
export async function readLimited(res: Response, max: number): Promise<Buffer> {
  if (!res.body) return Buffer.alloc(0);
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      throw new Error(`Filen er for stor (over ${Math.round(max / 1_000_000)} MB).`);
    }
    parts.push(value);
  }
  return Buffer.concat(parts);
}
