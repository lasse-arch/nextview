import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";

/*
 * "Our own visits don't count": the networks the team uses Arpo from are kept
 * as a keyed hash of the address (never the address), and a tour visit from
 * one of them isn't counted - not in the visits, not on the map. A network is
 * forgotten after 60 days without anyone from the team on it.
 */

const KEEP_DAYS = 60;

/** The visitor's address from the request, the first in the forwarded chain. */
export const ipOf = (h: Headers) => h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "";

/** A keyed hash - the address can't be read back from it. IPv6: the network's /64 (a phone's address changes within it). */
export function networkHash(ip: string): string | null {
  if (!ip) return null;
  const net = ip.includes(":") ? ip.split(":").slice(0, 4).join(":") : ip;
  return createHash("sha256").update(`team-network:${process.env.AUTH_SECRET ?? ""}:${net}`).digest("hex").slice(0, 40);
}

const seen = new Map<string, number>();

/** A team member is on Arpo from this network: remembered (at most once an hour per network and server). */
export async function rememberTeamNetwork(ip: string): Promise<void> {
  const hash = networkHash(ip);
  if (!hash || Date.now() - (seen.get(hash) ?? 0) < 3600_000) return;
  seen.set(hash, Date.now());
  await prisma.teamNetwork.upsert({ where: { hash }, create: { hash }, update: { lastSeen: new Date() } }).catch(() => {});
  known.at = 0;
}

const known = { at: 0, set: new Set<string>() };

/** Is this a network the team uses (seen the last 60 days)? Read from a list kept for 5 minutes. */
export async function isTeamNetwork(ip: string): Promise<boolean> {
  const hash = networkHash(ip);
  if (!hash) return false;
  if (Date.now() - known.at > 5 * 60_000) {
    const rows = await prisma.teamNetwork.findMany({ where: { lastSeen: { gte: new Date(Date.now() - KEEP_DAYS * 86_400_000) } }, select: { hash: true } }).catch(() => []);
    known.set = new Set(rows.map((r) => r.hash));
    known.at = Date.now();
  }
  return known.set.has(hash);
}
