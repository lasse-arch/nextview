import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getAppBaseUrl, MICROSOFT_SCOPES } from "@/lib/email-oauth";

export async function GET(request: NextRequest) {
  const user = await requireUser();
  const code = request.nextUrl.searchParams.get("code");
  const errorParam = request.nextUrl.searchParams.get("error");

  if (errorParam || !code) {
    return NextResponse.redirect(new URL("/settings/email?error=microsoft_denied", getAppBaseUrl()));
  }

  try {
    const tenant = process.env.MICROSOFT_TENANT_ID || "common";
    const redirectUri = `${getAppBaseUrl()}/api/integrations/microsoft/callback`;
    const tokenRes = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.MICROSOFT_CLIENT_ID!,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        scope: MICROSOFT_SCOPES,
      }),
    });

    if (!tokenRes.ok) throw new Error(`Token exchange failed: ${await tokenRes.text()}`);

    const tokens = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    const profileRes = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!profileRes.ok) throw new Error("Kunne ikke hente Microsoft-profil");
    const profile = (await profileRes.json()) as { mail?: string; userPrincipalName: string };

    await prisma.emailAccount.upsert({
      where: { userId_provider: { userId: user.id, provider: "MICROSOFT" } },
      create: {
        userId: user.id,
        provider: "MICROSOFT",
        email: profile.mail || profile.userPrincipalName,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      },
      update: {
        email: profile.mail || profile.userPrincipalName,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? undefined,
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      },
    });

    return NextResponse.redirect(new URL("/settings/email?connected=microsoft", getAppBaseUrl()));
  } catch (err) {
    console.error("Microsoft OAuth callback error", err);
    return NextResponse.redirect(new URL("/settings/email?error=microsoft_failed", getAppBaseUrl()));
  }
}
