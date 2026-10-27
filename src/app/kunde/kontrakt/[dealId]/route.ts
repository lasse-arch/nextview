import { NextResponse } from "next/server";
import { getCurrentCustomer, getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { downloadCompletedPdf } from "@/lib/docuseal";

/** The signed contract as a PDF - only for a customer login with access to that deal (or an admin looking at the page as the customer). */
export async function GET(_req: Request, { params }: { params: Promise<{ dealId: string }> }) {
  const { dealId } = await params;
  const account = await getCurrentCustomer();
  const allowed = account ? account.deals.some((d) => d.dealId === dealId) : (await getCurrentUser())?.role === "ADMIN";
  if (!allowed) return new NextResponse(null, { status: 404 });
  const deal = await prisma.deal.findUnique({ where: { id: dealId }, select: { docusealSubmissionId: true, contractSignedAt: true } });
  if (!deal?.docusealSubmissionId || !deal.contractSignedAt) return new NextResponse(null, { status: 404 });
  try {
    const pdf = await downloadCompletedPdf(deal.docusealSubmissionId);
    return new NextResponse(new Uint8Array(pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="kontrakt-nextview360.pdf"', "Cache-Control": "private, no-store" },
    });
  } catch {
    return new NextResponse("Kontrakten kunne ikke hentes lige nu - prøv igen om lidt, eller skriv til os.", { status: 502 });
  }
}
