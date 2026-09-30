import { NextResponse, type NextRequest } from "next/server";
import { PDFDocument } from "pdf-lib";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateCustomerReportPdfBuffer } from "@/lib/customer-report-service";
import { currentMonthLabel } from "@/lib/customer-report-template";
import { dealName } from "@/lib/labels";

// Each deal's stats now come from a real Matterport browser-scrape (login +
// several page loads), not the old faster bulk system - noticeably slower
// per deal, so this ceiling is set high to give a "download all" attempt a
// real chance; Vercel will clamp it to whatever the plan actually allows.
// A very large customer list can still realistically exceed even this - if
// it does in practice, downloading all of them in one request isn't viable
// and this should move to some kind of background/chunked approach instead.
export const maxDuration = 300;

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
  let lastError: unknown;

  for (const deal of deals) {
    try {
      pdfBuffers.push(await generateCustomerReportPdfBuffer(deal));
    } catch (err) {
      console.error(`Kunne ikke generere besøgsrapport-PDF for ${dealName(deal)}`, err);
      lastError = err;
      skipped++;
    }
  }

  if (pdfBuffers.length === 0) {
    // Surface the actual underlying error (not just a generic fallback) -
    // needed to debug e.g. the Matterport scraper from the real message it
    // throws, rather than guessing blind.
    const detail = lastError instanceof Error ? lastError.message : null;
    return NextResponse.json(
      {
        error: detail
          ? `Ingen af de valgte kunder kunne hente statistik. Sidste fejl: ${detail}`
          : "Ingen af de valgte kunder har et gyldigt MP-Skin nummer, eller PDF-generering fejlede.",
      },
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
      ? `Besøgsrapport ${dealName(deals[0])} ${currentMonthLabel(deals[0].reportLanguage)}.pdf`
      : `Besøgsrapporter ${currentMonthLabel("DA")}.pdf`;

  return new NextResponse(new Blob([new Uint8Array(finalBytes)], { type: "application/pdf" }), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="report.pdf"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "X-Skipped-Count": String(skipped),
    },
  });
}
