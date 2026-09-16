import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { downloadSignedDocument } from "@/lib/pandadoc";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;

  const deal = await prisma.deal.findUnique({ where: { id } });
  if (!deal?.pandaDocDocumentId) {
    return NextResponse.json({ error: "Ingen kontrakt fundet for denne deal" }, { status: 404 });
  }

  const pdf = await downloadSignedDocument(deal.pandaDocDocumentId);

  return new NextResponse(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="kontrakt-${deal.companyName.replace(/[^a-z0-9]+/gi, "-")}.pdf"`,
    },
  });
}
