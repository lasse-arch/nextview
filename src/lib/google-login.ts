import "server-only";
import { prisma } from "@/lib/db";

/**
 * "Log ind med Google" - single sign-on with the users' Google accounts
 * (Google Workspace @nextview360.dk), reusing Arpo's Google OAuth app (the
 * one Gmail/Kalender are connected through). Only an existing Arpo user can
 * log in this way - matched on the verified e-mail Google returns; nobody is
 * created by logging in.
 *
 * The redirect URI ${APP_BASE_URL}/api/auth/google/callback must be listed
 * under the OAuth client's "Authorized redirect URIs" in Google Cloud.
 */

/** Holds the one-time state between /api/auth/google/start and the callback. */
export const GOOGLE_LOGIN_STATE_COOKIE = "nv360_google_login";

export const REQUIRE_GOOGLE_LOGIN_KEY = "REQUIRE_GOOGLE_LOGIN";

/**
 * "Kræv Google-login": passwords stop working, for logging in and for
 * sessions already started with one. Off unless an admin turned it on -
 * and ALLOW_PASSWORD_LOGIN=1 in the environment turns it off again, as the
 * way back in if Google login ever stops working.
 */
export async function isGoogleLoginRequired(): Promise<boolean> {
  if (process.env.ALLOW_PASSWORD_LOGIN === "1") return false;
  const setting = await prisma.integrationSetting.findUnique({ where: { key: REQUIRE_GOOGLE_LOGIN_KEY } });
  return setting?.enabled === true;
}

export function googleLoginRedirectUri(baseUrl: string): string {
  return `${baseUrl}/api/auth/google/callback`;
}
