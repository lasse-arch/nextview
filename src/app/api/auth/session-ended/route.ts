import { NextResponse } from "next/server";
import { getAppBaseUrl } from "@/lib/email-oauth";

/**
 * Where the app sends a browser whose session cookie no longer counts (a
 * password session once Google login is required, a deleted user, an
 * expired token): clears the cookie, then on to the login page. Without
 * this, the proxy would bounce /login straight back to / for as long as
 * the dead cookie is there.
 */
export async function GET() {
  const res = NextResponse.redirect(new URL("/login?error=session_ended", getAppBaseUrl()));
  res.cookies.delete("nv360_session");
  return res;
}
