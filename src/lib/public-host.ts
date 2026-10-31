import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/*
 * Is a web address one we may open on someone's behalf? Only a public website:
 * http(s), the normal ports, a real host name - and every address that name
 * points to must be on the public internet. Never our own server, the local
 * network, the cloud's internal addresses or a name that only points there.
 * Used where a customer types an address and our server (or its headless
 * browser, for every request the page makes, redirects included) opens it.
 */

const v4 = (ip: string) => ip.split(".").map(Number);

function publicV4(ip: string): boolean {
  const [a, b, c] = v4(ip);
  if (a === 0 || a === 10 || a === 127) return false; // "this" network, private, loopback
  if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
  if (a === 169 && b === 254) return false; // link-local - cloud metadata lives here
  if (a === 172 && b >= 16 && b <= 31) return false; // private
  if (a === 192 && b === 168) return false; // private
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false; // IETF, documentation
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a === 198 && b === 51 && c === 100) return false; // documentation
  if (a === 203 && b === 0 && c === 113) return false; // documentation
  if (a >= 224) return false; // multicast and reserved
  return true;
}

function publicV6(ip: string): boolean {
  const s = ip.toLowerCase();
  if (s === "::" || s === "::1") return false;
  // IPv4 written as IPv6 (::ffff:10.0.0.1, 64:ff9b::10.0.0.1): judged as the IPv4 address it is.
  const mapped = /^(?:::ffff:|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (mapped) return publicV4(mapped[1]);
  if (/^::ffff:/.test(s) || /^64:ff9b:/.test(s)) return false;
  if (/^f[cd]/.test(s)) return false; // unique local
  if (/^fe[89ab]/.test(s)) return false; // link-local
  if (/^ff/.test(s)) return false; // multicast
  if (/^2001:0?db8:/.test(s)) return false; // documentation
  return true;
}

export function isPublicIp(ip: string): boolean {
  const kind = isIP(ip);
  return kind === 4 ? publicV4(ip) : kind === 6 ? publicV6(ip) : false;
}

const known = new Map<string, { ok: boolean; at: number }>();

/**
 * Every address the host name points to is public. Remembered for a minute
 * (a page asks for the same few hosts again and again).
 *
 * Local development only: this sandbox can't look names up itself (all its
 * traffic goes through a proxy that can't reach any private network), so
 * with PUBLIC_HOST_DNS_VIA_PROXY=1 outside production a name that can't be
 * looked up is let through. In production a name that can't be looked up is
 * always refused.
 */
export async function isPublicHost(hostname: string): Promise<boolean> {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host || host === "localhost" || /\.(local|localhost|internal|lan|home|corp|intranet)$/.test(host)) return false;
  if (isIP(host)) return isPublicIp(host);
  if (!host.includes(".")) return false;
  const hit = known.get(host);
  if (hit && Date.now() - hit.at < 60_000) return hit.ok;
  let ok: boolean;
  try {
    const all = await lookup(host, { all: true, verbatim: true });
    ok = all.length > 0 && all.every((a) => isPublicIp(a.address));
  } catch {
    ok = process.env.NODE_ENV !== "production" && process.env.PUBLIC_HOST_DNS_VIA_PROXY === "1";
  }
  if (known.size > 2000) known.clear();
  known.set(host, { ok, at: Date.now() });
  return ok;
}

/** A URL we may open: http(s), port 80/443, no login in it, a public host. Null otherwise. */
export async function publicWebUrl(raw: string): Promise<URL | null> {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password) return null;
  if (url.port && url.port !== "80" && url.port !== "443") return null;
  return (await isPublicHost(url.hostname)) ? url : null;
}
