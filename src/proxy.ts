import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "nv360_session";
// "/t" = published tours, shown in an iframe on customers' sites (and their pictures, /t/<slug>/historie); "/r" = a customer's report on their tour.
// "/tours" and "/tour-engine": the tours' own files (pictures, sound) and the engine for tours published as files - public like the tours.
const PUBLIC_PATHS = ["/login", "/robots.txt", "/t", "/r", "/p", "/site", "/web", "/tours", "/tour-engine"];

/*
 * Arpo lives under /arpo (the website has "/", customers have /kunde). Its
 * old addresses - /deals/123, /tour-lab/… - send on to the same page under
 * /arpo, so bookmarks and links in old e-mails keep working.
 */
const ARPO_SECTIONS = ["commission", "deals", "kalender", "kunder-live", "leadgeneration", "leadindbakke", "nyheder", "opgaver", "profile", "ringeliste", "settings", "stats", "tour-lab", "users", "vaekst"];
const OLD_ARPO_PATH = new RegExp(`^/(${ARPO_SECTIONS.join("|")})(/|$)`);
/** A tour's pictures were once under Arpo's /tour-lab - tours saved back then still point there. */
const OLD_STORY_PICTURE = /^\/tour-lab\/([^/]+)\/historie$/;

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
  if (/\.[a-z0-9]+$/i.test(pathname) || pathname.startsWith(`/${kind}/`) || (kind === "t" && pathname.startsWith("/p/"))) return NextResponse.next();
  if (kind === "t" && OLD_STORY_PICTURE.test(pathname)) return null;
  const one = pathname.match(/^\/([^/]+)\/?$/);
  if (!one) return NextResponse.redirect("https://nextview360.dk");
  const url = request.nextUrl.clone();
  url.pathname = `/${kind}/${one[1]}`;
  return NextResponse.rewrite(url);
}

/*
 * Arpo moved from arpo.dk (and the short-lived arpo.nextview360.dk) to its
 * APP_BASE_URL (nextview360.dk, under /arpo): the old addresses send every
 * page there, path and all - bookmarks, links in old e-mails and tour codes
 * on customers' sites keep working. /api isn't redirected (the matcher
 * leaves it out), so webhooks still pointing at an old address keep arriving.
 */
const OLD_HOSTS = ["arpo.dk", "www.arpo.dk", "arpo.nextview360.dk"];
const APP_HOST = hostOf(process.env.APP_BASE_URL);

function movedHost(request: NextRequest): NextResponse | null {
  const host = request.headers.get("host")?.toLowerCase();
  if (!host || !APP_HOST || !OLD_HOSTS.includes(host) || OLD_HOSTS.includes(APP_HOST)) return null;
  const { pathname, search } = request.nextUrl;
  // Arpo's own pages go to /arpo; the tours, reports and login keep their paths.
  const path = pathname === "/" ? "/arpo" : OLD_ARPO_PATH.test(pathname) && !OLD_STORY_PICTURE.test(pathname) ? `/arpo${pathname}` : pathname;
  return NextResponse.redirect(new URL(path + search, process.env.APP_BASE_URL), 308);
}

/*
 * The website's own address (NEXT_PUBLIC_SITE_ORIGIN, e.g. https://nextview360.dk,
 * with or without www): "/" is the front page (public/site/index.html) and the
 * old site's pages go to the matching part of it. Login, Arpo (/arpo) and the
 * customers' pages (/kunde) live on the same address - one login for all.
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
  const old = OLD_SITE_PAGES[pathname.replace(/\/+$/, "")];
  if (old) return NextResponse.redirect(new URL(`/${old}`, `https://${host}`), 307);
  return null;
}

export function proxy(request: NextRequest) {
  const site = siteHost(request);
  if (site) return site;
  const moved = movedHost(request);
  if (moved) return moved;
  const short = shortHost(request);
  if (short) return short;
  const { pathname } = request.nextUrl;

  const picture = pathname.match(OLD_STORY_PICTURE);
  if (picture) {
    const url = request.nextUrl.clone();
    url.pathname = `/t/${picture[1]}/historie`;
    return NextResponse.rewrite(url);
  }
  if (OLD_ARPO_PATH.test(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = `/arpo${pathname}`;
    return NextResponse.redirect(url, 308);
  }

  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
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
