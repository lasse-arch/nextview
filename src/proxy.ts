import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "nv360_session";
// "/t" = published tours, shown in an iframe on customers' sites (and their pictures under /tour-lab/<slug>/historie); "/r" = a customer's report on their tour.
const PUBLIC_PATHS = ["/login", "/robots.txt", "/t", "/r", "/p", "/site"];

/*
 * The short public addresses (see lib/public-urls.ts): on the tour host
 * /<slug> is the tour (/t/<slug>), on the portal host /<token> is the
 * portal (/r/<token>). Nothing else of Arpo is reachable on those hosts.
 */
const hostOf = (origin: string | undefined) => (origin ? origin.replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase() : null);
const TOUR_HOST = hostOf(process.env.NEXT_PUBLIC_TOUR_ORIGIN);
const PORTAL_HOST = hostOf(process.env.NEXT_PUBLIC_PORTAL_ORIGIN);

function shortHost(request: NextRequest): NextResponse | null {
  const host = request.headers.get("host")?.toLowerCase();
  const kind = host && host === TOUR_HOST ? "t" : host && host === PORTAL_HOST ? "r" : null;
  if (!kind) return null;
  const { pathname } = request.nextUrl;
  // Files (audio, logos, scripts) and the tour's own sub-addresses are served as they are.
  if (/\.[a-z0-9]+$/i.test(pathname) || pathname.startsWith(`/${kind}/`) || (kind === "t" && (pathname.startsWith("/p/") || /^\/tour-lab\/[^/]+\/historie$/.test(pathname)))) return NextResponse.next();
  const one = pathname.match(/^\/([^/]+)\/?$/);
  if (!one) return NextResponse.redirect("https://nextview360.dk");
  const url = request.nextUrl.clone();
  url.pathname = `/${kind}/${one[1]}`;
  return NextResponse.rewrite(url);
}

/*
 * Arpo moved from arpo.dk to its APP_BASE_URL (arpo.nextview360.dk): the old
 * address sends every page there, path and all - bookmarks, links in old
 * e-mails and tour codes on customers' sites keep working. /api isn't
 * redirected (the matcher leaves it out), so webhooks still pointing at the
 * old address keep arriving.
 */
const OLD_HOSTS = ["arpo.dk", "www.arpo.dk"];
const APP_HOST = hostOf(process.env.APP_BASE_URL);

function movedHost(request: NextRequest): NextResponse | null {
  const host = request.headers.get("host")?.toLowerCase();
  if (!host || !APP_HOST || !OLD_HOSTS.includes(host) || OLD_HOSTS.includes(APP_HOST)) return null;
  const url = new URL(request.nextUrl.pathname + request.nextUrl.search, process.env.APP_BASE_URL);
  return NextResponse.redirect(url, 308);
}

/*
 * The website's own address (NEXT_PUBLIC_SITE_ORIGIN, e.g. https://nextview360.dk,
 * with or without www): "/" is the front page (public/site/index.html), the old site's
 * pages go to the matching part of it, and nothing else of Arpo is reachable.
 */
const SITE_HOST = hostOf(process.env.NEXT_PUBLIC_SITE_ORIGIN)?.replace(/^www\./, "") ?? null;
const OLD_SITE_PAGES: Record<string, string> = { "/cases": "#cases", "/kontakt": "#kontakt", "/om-os": "#kontakt" };

function siteHost(request: NextRequest): NextResponse | null {
  const host = request.headers.get("host")?.toLowerCase();
  if (!SITE_HOST || !host || host.replace(/^www\./, "") !== SITE_HOST) return null;
  const { pathname } = request.nextUrl;
  if (pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/site/index.html";
    return NextResponse.rewrite(url);
  }
  // Files (pictures, fonts) are served as they are.
  if (/\.[a-z0-9]+$/i.test(pathname)) return NextResponse.next();
  const home = new URL(`/${OLD_SITE_PAGES[pathname.replace(/\/+$/, "").split("/").slice(0, 2).join("/")] ?? ""}`, `https://${host}`);
  return NextResponse.redirect(home, 307);
}

export function proxy(request: NextRequest) {
  const site = siteHost(request);
  if (site) return site;
  const moved = movedHost(request);
  if (moved) return moved;
  const short = shortHost(request);
  if (short) return short;
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
