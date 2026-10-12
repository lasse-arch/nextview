import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createSession, safeNextPath } from "@/lib/auth";
import { getAppBaseUrl } from "@/lib/email-oauth";
import { GOOGLE_LOGIN_STATE_COOKIE as STATE_COOKIE, googleLoginRedirectUri } from "@/lib/google-login";

function sameString(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Google's answer to "Log ind med Google": checks the state, gets the
 * account's verified e-mail and logs in the Arpo user with that e-mail. */
export async function GET(request: NextRequest) {
  const base = getAppBaseUrl();
  const fail = (error: string) => {
    const res = NextResponse.redirect(new URL(`/login?error=${error}`, base));
    res.cookies.delete({ name: STATE_COOKIE, path: "/api/auth/google" });
    return res;
  };

  let saved: { state: string; next: string } | null = null;
  try {
    saved = JSON.parse(request.cookies.get(STATE_COOKIE)?.value ?? "null");
  } catch {
    saved = null;
  }
  const state = request.nextUrl.searchParams.get("state");
  const code = request.nextUrl.searchParams.get("code");
  if (request.nextUrl.searchParams.get("error")) return fail("google_cancelled");
  if (!saved || !state || !code || !sameString(saved.state, state)) return fail("google_state");

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: googleLoginRedirectUri(base),
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) throw new Error(`Token exchange failed: ${await tokenRes.text()}`);
    const tokens = (await tokenRes.json()) as { access_token: string };

    const infoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!infoRes.ok) throw new Error(`Userinfo failed: ${infoRes.status}`);
    const info = (await infoRes.json()) as { email?: string; email_verified?: boolean };
    if (!info.email || info.email_verified !== true) return fail("google_unverified");

    const user = await prisma.user.findFirst({ where: { email: { equals: info.email.trim(), mode: "insensitive" } } });
    if (!user) return fail("google_unknown_user");

    await prisma.user.update({ where: { id: user.id }, data: { lastGoogleLoginAt: new Date() } });
    await createSession(user.id, "google");
    const res = NextResponse.redirect(new URL(safeNextPath(saved.next), base));
    res.cookies.delete({ name: STATE_COOKIE, path: "/api/auth/google" });
    return res;
  } catch (err) {
    console.error("Log ind med Google fejlede", err);
    return fail("google_failed");
  }
}
