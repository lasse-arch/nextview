import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { cookies } from "next/headers";
import { NextResponse, after } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { customerBandHtml, refreshSiteLogos, siteCustomers } from "@/lib/site-customers";

/*
 * The new nextview360.dk site, still in the works (its pages in site-web/,
 * its pictures, videos and stylesheet in public/web/): only the team, logged
 * in to Arpo, sees the pages - anyone else is sent to the login. The
 * pictures stay public files (videos are too big to pass through here, and
 * without the pages they show nothing).
 */
export async function betaPage(name: string, request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) {
    const next = `/web/${/^[a-z0-9-]+\.html$/.test(name) ? name : "index.html"}`;
    // A login cookie that no longer counts (expired, a password session once Google is required, a customer's):
    // cleared first - else the login page sends it straight on to /arpo, and the way back here is lost.
    const dead = (await cookies()).has("nv360_session");
    const to = dead ? new URL("/api/auth/session-ended", request.url) : new URL("/login", request.url);
    to.searchParams.set("next", next);
    // Never kept by the browser: once logged in, the same address must show the page, not this detour again.
    const res = NextResponse.redirect(to);
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  }
  if (!/^[a-z0-9-]+\.html$/.test(name)) return new NextResponse("Siden findes ikke.", { status: 404 });
  const html = await readFile(path.join(process.cwd(), "site-web", name), "utf8").catch(() => null);
  if (html == null) return new NextResponse("Siden findes ikke.", { status: 404 });
  // The customer band on the front page: filled from the customers who are online now.
  const band = html.includes("<!--kunder-->");
  const page = band ? html.replace("<!--kunder-->", customerBandHtml(await siteCustomers().catch(() => []))) : html;
  // New customers' logos are read from their tour after the page is sent - they're in the band next time.
  if (band) after(() => refreshSiteLogos().catch((e) => console.warn("Kundelogoer kunne ikke hentes:", e instanceof Error ? e.message : e)));
  return new NextResponse(page, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" } });
}
