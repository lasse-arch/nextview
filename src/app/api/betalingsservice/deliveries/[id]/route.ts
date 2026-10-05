import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

/** Downloads a generated BS 0601 file, byte for byte as stored (ISO 8859-1, CR-LF). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user.canAccessBilling) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const delivery = await prisma.bsDelivery.findUnique({ where: { id } });
  if (!delivery) return NextResponse.json({ error: "Filen findes ikke" }, { status: 404 });

  return new NextResponse(Buffer.from(delivery.content), {
    headers: {
      "Content-Type": "text/plain; charset=iso-8859-1",
      "Content-Disposition": `attachment; filename="${delivery.fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
