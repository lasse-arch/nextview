import { NextResponse, type NextRequest } from "next/server";
import { receiveInquiry } from "@/lib/site-inquiry";

/*
 * The contact form on nextview360.dk posts here (public/web/site.js). A
 * hidden "website" field catches bots: filled in, it's thanked and dropped.
 */

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function POST(request: NextRequest) {
  const data = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!data) return NextResponse.json({ error: "Ugyldig besked." }, { status: 400 });
  if (text(data.website, 200)) return NextResponse.json({ ok: true });

  const name = text(data.navn, 120);
  const email = text(data.email, 200);
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Skriv dit navn og en gyldig e-mail." }, { status: 400 });

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
  return result.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: result.error }, { status: result.status });
}
