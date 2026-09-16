import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getAppBaseUrl, MICROSOFT_SCOPES, isMicrosoftConfigured } from "@/lib/email-oauth";

export async function GET() {
  await requireUser();

  if (!isMicrosoftConfigured()) {
    return NextResponse.redirect(
      new URL("/settings/email?error=microsoft_not_configured", getAppBaseUrl())
    );
  }

  const tenant = process.env.MICROSOFT_TENANT_ID || "common";
  const redirectUri = `${getAppBaseUrl()}/api/integrations/microsoft/callback`;
  const url = new URL(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`);
  url.searchParams.set("client_id", process.env.MICROSOFT_CLIENT_ID!);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", MICROSOFT_SCOPES);

  return NextResponse.redirect(url.toString());
}
