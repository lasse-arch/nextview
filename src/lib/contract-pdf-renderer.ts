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

    // One tall page sized exactly to the content, rather than standard A4
    // pagination - a contract read on screen (never printed) should just be
    // one continuous document, with no mid-card page-break artifacts (a
    // product card's rounded border cut in half, big gaps before a card that
    // didn't fit, etc).
    const contentHeight = await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight));
    const pdf = await page.pdf({
      width: "794px",
      height: `${contentHeight}px`,
      printBackground: true,
      margin: { top: "0", bottom: "0", left: "0", right: "0" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
