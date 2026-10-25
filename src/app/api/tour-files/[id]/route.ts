import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/** A tour's file kept in the database (see src/lib/tour-files.ts). Public - tours are shown to anyone. Never changes, so cached for good. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const file = await prisma.tourFile.findUnique({ where: { id: (await params).id }, select: { data: true, contentType: true, url: true } });
  if (file?.url) return NextResponse.redirect(file.url, 308);
  if (!file?.data) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      // An svg is shown as a picture, never run as a page.
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
