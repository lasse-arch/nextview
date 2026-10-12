import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/auth";
import { getAppBaseUrl, isGoogleConfigured } from "@/lib/email-oauth";
import { GOOGLE_LOGIN_STATE_COOKIE as STATE_COOKIE, googleLoginRedirectUri } from "@/lib/google-login";

/** "Log ind med Google": off to Google's sign-in, with a one-time state
 * (kept in a short-lived cookie) the callback checks the answer against. */
export async function GET(request: NextRequest) {
  const base = getAppBaseUrl();
  if (!isGoogleConfigured()) return NextResponse.redirect(new URL("/login?error=google_not_configured", base));

  const next = safeNextPath(request.nextUrl.searchParams.get("next"));
  // Google sends the answer to APP_BASE_URL's host - start from that host
  // too (e.g. arpo.dk → www.arpo.dk), or the state cookie set here wouldn't
  // be there when the answer comes back.
  if (request.headers.get("host") && new URL(base).host !== request.headers.get("host")) {
    return NextResponse.redirect(new URL(`/api/auth/google/start?next=${encodeURIComponent(next)}`, base));
  }

  const state = randomBytes(24).toString("base64url");

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID!);
  url.searchParams.set("redirect_uri", googleLoginRedirectUri(base));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");

  const res = NextResponse.redirect(url.toString());
  res.cookies.set(STATE_COOKIE, JSON.stringify({ state, next }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth/google",
    maxAge: 10 * 60,
  });
  return res;
}
