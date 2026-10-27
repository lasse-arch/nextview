import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { getCurrentCustomer, getCurrentUser } from "@/lib/auth";
import { CLOUDFLARE_TOUR_ORIGIN, TOUR_ORIGIN } from "@/lib/public-urls";
import { getAppBaseUrl } from "@/lib/email-oauth";

/*
 * A QR code for a tour link ("Brug touren" on the customer's page) - PNG to
 * print. Only for our own tour addresses, and only for someone logged in, so
 * it can't be used as a QR maker for anything else.
 */
export async function GET(req: Request) {
  if (!(await getCurrentUser()) && !(await getCurrentCustomer())) return new NextResponse(null, { status: 401 });
  const raw = new URL(req.url).searchParams.get("url") ?? "";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const own = [CLOUDFLARE_TOUR_ORIGIN, TOUR_ORIGIN, getAppBaseUrl(), "https://explore.nextview360.dk"].filter(Boolean).map((o) => new URL(o!).origin);
  if (url.protocol !== "https:" && !url.hostname.startsWith("localhost")) return new NextResponse(null, { status: 400 });
  if (!own.includes(url.origin) || raw.length > 500) return new NextResponse(null, { status: 400 });
  const png = await QRCode.toBuffer(url.toString(), { type: "png", width: 1024, margin: 2, errorCorrectionLevel: "M" });
  return new NextResponse(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Content-Disposition": 'inline; filename="tour-qr.png"', "Cache-Control": "private, max-age=86400" },
  });
}
