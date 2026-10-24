import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

/**
 * A room's picture for the story cards: /tour-lab/<slug>/historie?rum=<room>&v=<version>.
 * The version changes when the picture is retaken, so it can be cached for good.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { slug } = await params;
  const room = request.nextUrl.searchParams.get("rum") ?? "";
  const row = await prisma.tourStoryImage.findUnique({ where: { tourSlug_room: { tourSlug: slug, room } }, select: { image: true } });
  if (!row) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(row.image), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=31536000, immutable" },
  });
}
