import { NextResponse } from "next/server";
import { tooManyFrom } from "@/lib/ip-limit";
import { siteCustomers } from "@/lib/site-customers";

/*
 * The customer band on nextview360.dk (the Astro site in website/ reads it when it's built): the name and logo of
 * each customer whose tour is online - only what their public tour already shows. Public, read-only, rate limited,
 * cached an hour.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (tooManyFrom(request, "site-kunder", 20)) return NextResponse.json({ error: "For mange forespørgsler." }, { status: 429, headers: { "Cache-Control": "no-store" } });
  const origin = (process.env.APP_BASE_URL ?? new URL(request.url).origin).replace(/\/+$/, "");
  const list = await siteCustomers().catch(() => []);
  // Our own files ("/…") as full addresses - the site may be built and shown somewhere else.
  const customers = list.map((c) => ({ name: c.name, tone: c.tone, logo: c.logo.startsWith("/") ? `${origin}${c.logo}` : c.logo }));
  return NextResponse.json({ customers }, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
}
