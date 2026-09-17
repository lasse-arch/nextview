import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { downloadCompletedPdf } from "@/lib/signwell";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const deal = await prisma.deal.findUnique({ where: { id } });
  if (!deal?.signWellDocumentId) {
    return NextResponse.json({ error: "Ingen kontrakt fundet for denne deal" }, { status: 404 });
  }

  const pdf = await downloadCompletedPdf(deal.signWellDocumentId);

  return new NextResponse(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="kontrakt-${deal.companyName.replace(/[^a-z0-9]+/gi, "-")}.pdf"`,
    },
  });
}
