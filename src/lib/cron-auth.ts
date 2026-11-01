import "server-only";
import { timingSafeEqual } from "node:crypto";

/**
 * May this request run a cron or internal job? Only with
 * "Authorization: Bearer <CRON_SECRET>" (Vercel's crons send it; the app's own
 * queue kicks too), compared in constant time. Never from the URL (it ends up
 * in logs). Without CRON_SECRET nothing is let in - except on a developer's
 * own machine (NODE_ENV development), so the queues still run locally.
 */
export function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV === "development";
  const got = Buffer.from(request.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}
