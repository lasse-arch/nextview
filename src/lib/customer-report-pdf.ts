import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";

/**
 * Renders the customer visitor-stats report (customer-report-template.ts) to
 * a PDF buffer - same @sparticuz/chromium approach as contract-pdf-renderer.ts,
 * sized to fit Vercel's serverless function limits.
 */
export async function renderCustomerReportPdf(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluateHandle("document.fonts.ready");

    const pdf = await page.pdf({
      width: "1280px",
      height: "720px",
      printBackground: true,
      margin: { top: "0", bottom: "0", left: "0", right: "0" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
