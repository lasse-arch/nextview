import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getAppBaseUrl, GOOGLE_SCOPES, isGoogleConfigured } from "@/lib/email-oauth";
import { MAILBOX_STATE_COOKIE, MAILBOX_STATE_PATH, newMailboxState } from "@/lib/oauth-state";

export async function GET() {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.redirect(new URL("/api/auth/session-ended", getAppBaseUrl()));
  }

  if (!isGoogleConfigured()) {
    return NextResponse.redirect(
      new URL("/arpo/settings/email?error=google_not_configured", getAppBaseUrl())
    );
  }

  const redirectUri = `${getAppBaseUrl()}/api/integrations/google/callback`;
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID!);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_SCOPES);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  // One-time state (bound to this user) and PKCE - the callback refuses an answer it didn't ask for.
  const { state, challenge, cookie } = newMailboxState(user.id);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");

  const res = NextResponse.redirect(url.toString());
  res.cookies.set(MAILBOX_STATE_COOKIE, cookie, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: MAILBOX_STATE_PATH, maxAge: 600 });
  return res;
}
