import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";

/**
 * A room's picture for the story cards: /t/<slug>/historie?rum=<room>&v=<version>.
 * The version changes when the picture is retaken, so it can be cached for good.
 * Public - the published tours (/t/<slug>) show these pictures to anyone.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const room = request.nextUrl.searchParams.get("rum") ?? "";
  const row = await prisma.tourStoryImage.findUnique({ where: { tourSlug_room: { tourSlug: slug, room } }, select: { image: true } });
  if (!row) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(row.image), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
