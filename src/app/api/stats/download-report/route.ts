import { NextResponse, type NextRequest } from "next/server";
import { PDFDocument } from "pdf-lib";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateCustomerReportPdfBuffer } from "@/lib/customer-report-service";
import { dealName } from "@/lib/labels";

// Rendering each PDF (headless Chromium) can take a few seconds per deal -
// generous ceiling for a handful of customers downloaded together.
export const maxDuration = 120;

/**
 * "Download PDF" on the /stats page - one or several deal ids (comma-
 * separated `dealIds`), no email/Drive/history side effects, just the raw
 * PDF(s) back as a file. One deal downloads as its own report; several are
 * merged into a single multi-page PDF (via pdf-lib) rather than a zip, so it
 * stays a plain one-click browser download either way.
 */
export async function GET(request: NextRequest) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dealIds = (request.nextUrl.searchParams.get("dealIds") || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (dealIds.length === 0) {
    return NextResponse.json({ error: "Ingen kunder valgt." }, { status: 400 });
  }

  const deals = await prisma.deal.findMany({
    where: { id: { in: dealIds } },
    select: { id: true, companyName: true, displayName: true, mpSkinId: true, reportLanguage: true },
  });

  let skipped = deals.length < dealIds.length ? dealIds.length - deals.length : 0;
  const pdfBuffers: Buffer[] = [];

  for (const deal of deals) {
    try {
      pdfBuffers.push(await generateCustomerReportPdfBuffer(deal));
    } catch (err) {
      console.error(`Kunne ikke generere besøgsrapport-PDF for ${dealName(deal)}`, err);
      skipped++;
    }
  }

  if (pdfBuffers.length === 0) {
    return NextResponse.json(
      { error: "Ingen af de valgte kunder har et gyldigt MP-Skin nummer, eller PDF-generering fejlede." },
      { status: 400 }
    );
  }

  let finalBytes: Buffer;
  if (pdfBuffers.length === 1) {
    finalBytes = pdfBuffers[0];
  } else {
    const merged = await PDFDocument.create();
    for (const buffer of pdfBuffers) {
      const doc = await PDFDocument.load(buffer);
      const pages = await merged.copyPages(doc, doc.getPageIndices());
      pages.forEach((page) => merged.addPage(page));
    }
    finalBytes = Buffer.from(await merged.save());
  }

  const fileName =
    pdfBuffers.length === 1 && deals.length === 1
      ? `${dealName(deals[0])} - besøgsrapport.pdf`
      : `Besøgsrapporter.pdf`;

  return new NextResponse(new Blob([new Uint8Array(finalBytes)], { type: "application/pdf" }), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="report.pdf"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "X-Skipped-Count": String(skipped),
    },
  });
}
