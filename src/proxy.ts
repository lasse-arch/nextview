import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "nv360_session";
// "/t" = published tours, shown in an iframe on customers' sites (and their pictures under /tour-lab/<slug>/historie).
const PUBLIC_PATHS = ["/login", "/robots.txt", "/t"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`)) || /^\/tour-lab\/[^/]+\/historie$/.test(pathname);
  const hasSession = request.cookies.has(SESSION_COOKIE);

  if (!hasSession && !isPublic) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (hasSession && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|matterport/|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)"],
};
