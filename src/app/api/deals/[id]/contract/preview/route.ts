import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { buildContractHtmlData, parseContractProducts } from "@/lib/contract-template-data";
import { buildContractHtml } from "@/lib/contract-html-template";
import { renderContractPdf } from "@/lib/contract-pdf-renderer";

/**
 * Re-renders the contract exactly as it was sent - same template, same
 * products/terms snapshot frozen onto the deal at send-time (contractProducts)
 * - so a seller can check what the customer actually received without
 * waiting for DocuSeal's signed copy to exist. Not literally the file
 * DocuSeal holds, but byte-for-byte the same document, since nothing about
 * an already-sent contract's content can change afterwards.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const deal = await prisma.deal.findUnique({ where: { id }, include: { owner: true } });
  if (!deal) return NextResponse.json({ error: "Deal ikke fundet" }, { status: 404 });

  const products = parseContractProducts(deal.contractProducts);
  if (!products) return NextResponse.json({ error: "Ingen sendt kontrakt fundet for denne deal" }, { status: 404 });

  const sellerFullName = [deal.owner.name, deal.owner.lastName].filter(Boolean).join(" ");
  const htmlData = buildContractHtmlData(
    {
      companyName: deal.companyName,
      displayName: deal.displayName,
      cvrNumber: deal.cvrNumber,
      contactName: deal.contactName,
      contactEmail: deal.contactEmail,
      contactPhone: deal.contactPhone,
      address: deal.address,
      owner: { name: sellerFullName, email: deal.owner.email, phone: deal.owner.phone },
    },
    products
  );

  try {
    const html = buildContractHtml(htmlData, products.language);
    const pdf = await renderContractPdf(html);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="kontrakt-${deal.companyName.replace(/[^a-z0-9]+/gi, "-")}.pdf"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kunne ikke generere preview af kontrakten";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
