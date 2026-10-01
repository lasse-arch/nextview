import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";

/**
 * Recognizes a pasted Pocket (heypocket.com) share link, confirmed live
 * against a real share URL - CONFIRMED structure: a tabbed page (Summary /
 * To-Dos / Mind Map / Transcript / Call Notes) whose tab panes are swapped
 * client-side (real clicks needed, not just reading the initial HTML/text).
 * Only matches when the pasted text IS the link (nothing else around it) -
 * a link pasted alongside other manually-typed text is left alone, since
 * then the user is clearly writing their own note, not just dropping a link
 * to auto-expand.
 */
export function isPocketShareUrl(text: string): string | null {
  const trimmed = text.trim();
  const match = /^https:\/\/app\.heypocket\.com\/app\/share\/[A-Za-z0-9]+\/?$/.exec(trimmed);
  return match ? trimmed : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function launchBrowser() {
  return puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  });
}

/**
 * Scrapes a Pocket share page for the AI-generated meeting summary and the
 * full verbatim transcript, returning both - a plain copy-paste from the
 * page would only ever capture whichever one tab happens to be open, so
 * this clicks into each tab itself to get everything in one go.
 */
export async function fetchPocketTranscript(url: string): Promise<{ title: string; body: string }> {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 1000 });
    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
    await sleep(2500);

    const title = await page
      .evaluate(() => {
        // The page's own heading sits right above the Summary/To-Dos/... tab
        // bar - confirmed from a real share link ("Salgsmøde om
        // 360-graders virtuel tour").
        const tabBarEl = Array.from(document.querySelectorAll("*")).find(
          (el) => el.textContent?.trim() === "Summary" && el.children.length === 0
        );
        const heading = tabBarEl?.closest("div")?.previousElementSibling;
        return heading?.textContent?.trim() || document.title || "Pocket-mødereferat";
      })
      .catch(() => "Pocket-mødereferat");

    // Summary tab is the default view - no click needed, but click anyway in
    // case a previous run on the same page (unlikely, fresh browser each
    // time) left it elsewhere.
    await clickTab(page, "Summary");
    await sleep(1000);
    const summary = await extractMainText(page);

    let todos = "";
    if (await clickTab(page, "To-Dos")) {
      await sleep(1000);
      todos = await extractMainText(page);
    }

    let transcript = "";
    if (await clickTab(page, "Transcript")) {
      await sleep(1500);
      transcript = await extractMainText(page);
    }

    const sections = [`Pocket-mødereferat: ${title}`, "", summary];
    if (todos && todos !== summary) sections.push("", "--- To-Dos ---", "", todos);
    if (transcript) sections.push("", "--- Fuld transskription ---", "", transcript);
    sections.push("", `Kilde: ${url}`);

    return { title, body: sections.join("\n") };
  } finally {
    await browser.close();
  }
}

async function clickTab(page: import("puppeteer-core").Page, label: string): Promise<boolean> {
  return page.evaluate((text: string) => {
    const el = Array.from(document.querySelectorAll("button, a, div, span")).find(
      (e) => e.textContent?.trim() === text && e.children.length === 0
    ) as HTMLElement | undefined;
    if (!el) return false;
    el.click();
    return true;
  }, label);
}

/** Grabs the page's visible text, trimmed of the fixed share-page chrome
 * (the "shared via Pocket" header/footer and the "Get your Pocket" promo
 * that surrounds every tab's actual content) so only the tab's own content
 * ends up in the note. */
async function extractMainText(page: import("puppeteer-core").Page): Promise<string> {
  const text = await page.evaluate(() => document.body.innerText);
  return text
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      if (!t) return false;
      if (/^(shared via Pocket|Get your Pocket|Pocket)$/.test(t)) return false;
      if (/^(Summary|To-Dos|Mind Map|Transcript|Call Notes)$/.test(t)) return false;
      if (/Your Personal AI Assistant|Instant AI summaries|Reflect\. Recall\./.test(t)) return false;
      if (/^(Copy Summary|Copy All|More Detail|Shorter|Rewrite|Thinking|Load Audio|Load audio when you are ready to listen\.|AUDIO)$/.test(t))
        return false;
      if (/^\d+ SEGMENTS$/.test(t)) return false;
      return true;
    })
    .join("\n")
    .trim();
}
