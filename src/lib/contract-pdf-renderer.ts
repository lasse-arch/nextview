import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";

/**
 * Renders contract HTML (see contract-html-template.ts) to a PDF buffer.
 * Uses @sparticuz/chromium - a Chromium build sized to fit Vercel's
 * serverless function limits - rather than the full `playwright`/`puppeteer`
 * packages, which bundle a ~300MB browser that doesn't fit in a deployed
 * function. DocuSeal auto-detects the {{Sign;...}}/{{Date;...}} text tags
 * embedded in the HTML the same way for a PDF as it does for a docx.
 */
export async function renderContractPdf(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 794, height: 1123 });
    await page.setContent(html, { waitUntil: "load" });
    // setContent doesn't support waiting for network idle, so explicitly
    // wait for the Google Fonts stylesheet linked in the template to finish
    // loading before printing - otherwise the PDF can render with a
    // fallback system font instead of Inter.
    await page.evaluateHandle("document.fonts.ready");
    const pdf = await page.pdf({ format: "a4", printBackground: true });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
