import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getAppBaseUrl, GOOGLE_SCOPES, isGoogleConfigured } from "@/lib/email-oauth";

export async function GET() {
  try {
    await requireUser();
  } catch {
    return NextResponse.redirect(new URL("/login", getAppBaseUrl()));
  }

  if (!isGoogleConfigured()) {
    return NextResponse.redirect(
      new URL("/settings/email?error=google_not_configured", getAppBaseUrl())
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

  return NextResponse.redirect(url.toString());
}
