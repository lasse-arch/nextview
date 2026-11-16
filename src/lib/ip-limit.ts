import "server-only";

/*
 * A simple limit on how often one address may call a public endpoint (per
 * server instance, in memory - enough to stop a script hammering it; the
 * tours' own calls stay far below). `bucket` keeps endpoints apart.
 */

const seen = new Map<string, { at: number; n: number }>();

export function ipOf(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "ukendt";
}

/** True when this address has asked more than `perMinute` times in the last minute. */
export function tooManyFrom(request: Request, bucket: string, perMinute: number): boolean {
  const key = `${bucket}:${ipOf(request)}`;
  const now = Date.now();
  const a = seen.get(key);
  if (!a || now - a.at > 60_000) {
    if (seen.size > 20_000) seen.clear();
    seen.set(key, { at: now, n: 1 });
    return false;
  }
  return ++a.n > perMinute;
}
