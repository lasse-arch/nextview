/*
 * The tours published as plain files (Cloudflare) live on their own address
 * and read a little from Arpo: live units and free rooms. Those answers are
 * public and read-only (anyone can fetch them anyway), so any page may read
 * them - "*", which also never sends cookies along, so no login can ride on
 * it. A single, fixed header keeps the answers safe to cache. Never use this
 * for anything that isn't public.
 */
export function tourCors(_request: Request, headers: Record<string, string> = {}): Record<string, string> {
  return { ...headers, "Access-Control-Allow-Origin": "*" };
}
