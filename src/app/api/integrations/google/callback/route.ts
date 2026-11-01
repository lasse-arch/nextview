import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getAppBaseUrl } from "@/lib/email-oauth";
import { checkMailboxState, MAILBOX_STATE_COOKIE, MAILBOX_STATE_PATH } from "@/lib/oauth-state";

export async function GET(request: NextRequest) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.redirect(new URL("/api/auth/session-ended", getAppBaseUrl()));
  }

  const code = request.nextUrl.searchParams.get("code");
  const errorParam = request.nextUrl.searchParams.get("error");

  // The state must be the one this user's own "Forbind" set - else it's someone else's code (or a replay): nothing is saved.
  const verifier = checkMailboxState(request.cookies.get(MAILBOX_STATE_COOKIE)?.value, request.nextUrl.searchParams.get("state"), user.id);
  const done = (to: string) => {
    const res = NextResponse.redirect(new URL(to, getAppBaseUrl()));
    res.cookies.delete({ name: MAILBOX_STATE_COOKIE, path: MAILBOX_STATE_PATH });
    return res;
  };
  if (!verifier) return done("/arpo/settings/email?error=google_state");
  if (errorParam || !code) {
    return done("/arpo/settings/email?error=google_denied");
  }

  try {
    const redirectUri = `${getAppBaseUrl()}/api/integrations/google/callback`;
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        code_verifier: verifier,
      }),
    });

    if (!tokenRes.ok) throw new Error(`Token exchange failed: ${await tokenRes.text()}`);

    const tokens = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!profileRes.ok) throw new Error("Kunne ikke hente Google-profil");
    const profile = (await profileRes.json()) as { email: string };

    await prisma.emailAccount.upsert({
      where: { userId_provider: { userId: user.id, provider: "GOOGLE" } },
      create: {
        userId: user.id,
        provider: "GOOGLE",
        email: profile.email,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      },
      update: {
        email: profile.email,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? undefined,
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      },
    });

    return done("/arpo/settings/email?connected=google");
  } catch (err) {
    console.error("Google OAuth callback error", err instanceof Error ? err.message : err);
    return done("/arpo/settings/email?error=google_failed");
  }
}
