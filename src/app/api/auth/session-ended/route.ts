import { NextResponse, type NextRequest } from "next/server";
import { getTeamUser, safeNextPath } from "@/lib/auth";
import { homeOf } from "@/lib/team-roles";
import { getAppBaseUrl } from "@/lib/email-oauth";

/**
 * Where the app sends a browser whose session cookie no longer counts (a
 * password session once Google login is required, a deleted user, an
 * expired token): clears the cookie, then on to the login page. Without
 * this, the proxy would bounce /login straight back to / for as long as
 * the dead cookie is there.
 */
export async function GET(request: NextRequest) {
  // Still logged in, just without access to that page (a filmer or developer on a sales page): to their own part of Arpo, not logged out.
  const member = await getTeamUser();
  if (member) return NextResponse.redirect(new URL(homeOf(member), getAppBaseUrl()));
  // ?next=/arpo from Arpo's pages: back to the team's login, and on to Arpo after it.
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));
  const res = NextResponse.redirect(new URL(`/login?error=session_ended${next !== "/" ? `&next=${encodeURIComponent(next)}` : ""}`, getAppBaseUrl()));
  res.cookies.delete("nv360_session");
  return res;
}
