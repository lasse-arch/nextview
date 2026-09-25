import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getCustomerContractViewUrl } from "@/lib/docuseal";

/**
 * Returns the customer's own DocuSeal signing-form link for a sent (not yet
 * signed) contract - the real, live document with real-time status, exactly
 * what DocuSeal's own admin "Submissions" list opens under "View" - so a
 * seller can check precisely what the customer received/sees.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const deal = await prisma.deal.findUnique({ where: { id } });
  if (!deal?.docusealSubmissionId) {
    return NextResponse.json({ error: "Ingen sendt kontrakt fundet for denne deal" }, { status: 404 });
  }

  try {
    const url = await getCustomerContractViewUrl(deal.docusealSubmissionId);
    if (!url) return NextResponse.json({ error: "Kunne ikke finde et preview-link for kontrakten" }, { status: 404 });
    return NextResponse.json({ url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kunne ikke hente preview af kontrakten";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
