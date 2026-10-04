import { launchHeadlessChromium } from "@/lib/headless-chromium";

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
  return launchHeadlessChromium();
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

    // Summary tab is the default view - no click needed, but click anyway in
    // case a previous run on the same page (unlikely, fresh browser each
    // time) left it elsewhere. Also: the summary's heading (and all its
    // content) only actually renders into the DOM once this tab is active -
    // confirmed the hard way, via @sparticuz/chromium specifically (not
    // Playwright's bundled chromium, which rendered it immediately) finding
    // zero h1/h2/h3 elements at all before this click. The container itself
    // (`.summary-reading-prose`) exists before its content does - Pocket
    // reveals the AI summary with a typing/streaming animation and marks
    // progress via `data-summary-animating` - so waiting for the selector
    // alone is still a race; wait for that flag to flip to "false" and for
    // actual child content to exist.
    await clickTab(page, "Summary");
    await page
      .waitForFunction(
        () => {
          const el = document.querySelector(".summary-reading-prose");
          return !!el && el.getAttribute("data-summary-animating") === "false" && el.children.length > 0;
        },
        { timeout: 15000 }
      )
      .catch(() => {});
    await sleep(500);

    const title = await page
      .evaluate(() => {
        // The first heading on the page is the AI-generated meeting title
        // (confirmed from a real share link: "Salgsmøde om 360-graders
        // virtuel tour") - document.title is useless, it's just "Pocket" for
        // every share link.
        const heading = document.querySelector("h1, h2, h3");
        return heading?.textContent?.trim() || "Pocket-mødereferat";
      })
      .catch(() => "Pocket-mødereferat");

    const summary = (await extractStructuredSummary(page)) || (await extractMainText(page));

    let todos = "";
    if (await clickTab(page, "To-Dos")) {
      await sleep(1000);
      todos = (await extractStructuredTodos(page)) || (await extractMainText(page));
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

/**
 * The Summary tab renders its AI-generated content as real semantic HTML
 * (`.summary-reading-prose`: an opening overview `<p>`, then `<h3>` section
 * headings each followed by a `<ul>`) - confirmed from a real share link,
 * alongside a trailing interactive chart widget that isn't part of the
 * summary itself. Walking that structure directly gives a properly
 * sectioned, labeled note instead of the flat wall of text innerText alone
 * would produce (and sidesteps the chart's own SVG/axis-label text, which
 * innerText would otherwise sweep in as noise). Returns "" if Pocket's
 * markup doesn't match (caller falls back to extractMainText).
 */
async function extractStructuredSummary(page: import("puppeteer-core").Page): Promise<string> {
  return page.evaluate(() => {
    const prose = document.querySelector(".summary-reading-prose");
    if (!prose) return "";

    const overview: string[] = [];
    const sections: { heading: string; lines: string[] }[] = [];
    let current: { heading: string; lines: string[] } | null = null;

    for (const child of Array.from(prose.children)) {
      const tag = child.tagName.toLowerCase();
      if (tag === "p") {
        const text = child.textContent?.trim();
        if (!text) continue;
        if (current) current.lines.push(text);
        else overview.push(text);
      } else if (/^h[1-6]$/.test(tag)) {
        current = { heading: child.textContent?.trim() || "", lines: [] };
        sections.push(current);
      } else if (tag === "ul" || tag === "ol") {
        const items = Array.from(child.children)
          .filter((li) => li.tagName.toLowerCase() === "li")
          .map((li) => `- ${li.textContent?.trim()}`);
        if (current) current.lines.push(...items);
        else overview.push(...items);
      }
      // Anything else (the "Ask Pocket" chart widget, etc.) is UI chrome,
      // not summary content - deliberately skipped.
    }

    if (sections.length === 0 && overview.length === 0) return "";

    const out: string[] = [];
    if (overview.length > 0) out.push(`Opsummering\n${overview.join("\n")}`);
    for (const s of sections) out.push(`${s.heading}\n${s.lines.join("\n")}`);
    return out.join("\n\n");
  });
}

/**
 * The To-Dos tab renders each item as a button whose accessible name is
 * "Open <task text>" (confirmed from a real share link) rather than as
 * plain visible text next to a checkbox - innerText alone misses it
 * entirely. "Open composer options" is the tab's own compose button, not a
 * task, and is filtered out. Returns "" if none found (caller falls back to
 * extractMainText).
 */
async function extractStructuredTodos(page: import("puppeteer-core").Page): Promise<string> {
  return page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('button[aria-label^="Open "]'))
      .map((b) => (b.getAttribute("aria-label") || "").replace(/^Open /, "").trim())
      .filter((t) => t.length > 0 && t.toLowerCase() !== "composer options");
    return items.map((t) => `- ${t}`).join("\n");
  });
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
