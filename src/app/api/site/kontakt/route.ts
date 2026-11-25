import { NextResponse, type NextRequest } from "next/server";
import { receiveInquiry } from "@/lib/site-inquiry";

/*
 * The contact form on nextview360.dk posts here (public/web/site.js; the pages are in site-web/). A
 * hidden "website" field catches bots: filled in, it's thanked and dropped.
 */

/*
 * The Astro site (website/) may be shown from another address than Arpo - a preview before it goes live. Only the
 * addresses named here may post from a browser: nextview360.dk itself and SITE_ORIGINS (comma-separated, e.g. the
 * preview's https://….vercel.app). Nothing else gets CORS headers.
 */
const ORIGINS = new Set(["https://nextview360.dk", "https://www.nextview360.dk", ...(process.env.SITE_ORIGINS ?? "").split(",").map((o) => o.trim().replace(/\/+$/, "")).filter((o) => /^https:\/\/[a-z0-9.-]+$/i.test(o))]);
function cors(request: NextRequest): Record<string, string> {
  const origin = request.headers.get("origin");
  return origin && ORIGINS.has(origin) ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400", Vary: "Origin" } : {};
}

export function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: cors(request) });
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function POST(request: NextRequest) {
  const headers = cors(request);
  const data = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!data) return NextResponse.json({ error: "Ugyldig besked." }, { status: 400, headers });
  if (text(data.website, 200)) return NextResponse.json({ ok: true }, { headers });

  const name = text(data.navn, 120);
  const email = text(data.email, 200);
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Skriv dit navn og en gyldig e-mail." }, { status: 400, headers });

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "ukendt";
  const result = await receiveInquiry(
    {
      name,
      email,
      company: text(data.firma, 160) || undefined,
      phone: text(data.telefon, 40) || undefined,
      interest: text(data.interesse, 80) || undefined,
      message: text(data.besked, 5000) || undefined,
      page: text(data.side, 300) || undefined,
    },
    ip
  );
  return result.ok ? NextResponse.json({ ok: true }, { headers }) : NextResponse.json({ error: result.error }, { status: result.status, headers });
}
