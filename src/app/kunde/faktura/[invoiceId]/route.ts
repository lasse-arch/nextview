import { NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { downloadInvoicePdf } from "@/lib/dinero";

/** A sent invoice as the PDF from Dinero - only for a customer login with access to its deal. */
export async function GET(_req: Request, { params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await params;
  const account = await getCurrentCustomer();
  if (!account) return new NextResponse(null, { status: 404 });
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: { dealId: true, dineroInvoiceGuid: true, dineroInvoiceNumber: true, sentAt: true } });
  if (!invoice?.dineroInvoiceGuid || !invoice.sentAt || !account.deals.some((d) => d.dealId === invoice.dealId)) return new NextResponse(null, { status: 404 });
  try {
    const pdf = await downloadInvoicePdf(invoice.dineroInvoiceGuid);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="faktura-${(invoice.dineroInvoiceNumber ?? "nextview360").replace(/[^\w-]/g, "")}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new NextResponse("Fakturaen kunne ikke hentes lige nu - prøv igen om lidt, eller skriv til os.", { status: 502 });
  }
}
