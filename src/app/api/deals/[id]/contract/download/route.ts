import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { downloadCompletedPdf } from "@/lib/docuseal";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const deal = await prisma.deal.findUnique({ where: { id } });
  if (!deal?.docusealSubmissionId) {
    return NextResponse.json({ error: "Ingen kontrakt fundet for denne deal" }, { status: 404 });
  }

  try {
    const pdf = await downloadCompletedPdf(deal.docusealSubmissionId);
    return new NextResponse(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="kontrakt-${deal.companyName.replace(/[^a-z0-9]+/gi, "-")}.pdf"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kunne ikke hente den underskrevne kontrakt";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
