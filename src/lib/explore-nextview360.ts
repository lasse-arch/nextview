import puppeteer, { type Browser, type Page } from "puppeteer-core";
import chromium from "@sparticuz/chromium";

const BASE_URL = "https://explore.nextview360.dk";

export type ExplorePeriodStats = {
  visits: number;
  sessions: number;
  users: number;
  avgTime: string;
};

export type ExploreTourStats = {
  last7Days: ExplorePeriodStats;
  last30Days: ExplorePeriodStats;
  last90Days: ExplorePeriodStats;
  /** "08.11.2025" - the date the tour went live, as shown by explore.nextview360.dk itself. */
  sinceLabel: string;
  sinceStats: ExplorePeriodStats;
};

export type ExploreTourData = {
  stats: ExploreTourStats;
  /** Full-resolution cover photo (PNG), used as the report's front-page hero image. */
  coverImage: Buffer;
  /** Screenshot of the visitor heatmap floor plan - best-effort, null if the tour has no floor plan or it couldn't be captured. */
  heatmapImage: Buffer | null;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function credentials(): { username: string; password: string } {
  const username = process.env.EXPLORE_NEXTVIEW_USERNAME;
  const password = process.env.EXPLORE_NEXTVIEW_PASSWORD;
  if (!username || !password) {
    throw new Error("EXPLORE_NEXTVIEW_USERNAME/EXPLORE_NEXTVIEW_PASSWORD er ikke sat.");
  }
  return { username, password };
}

async function launchBrowser(): Promise<Browser> {
  return puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  });
}

/**
 * explore.nextview360.dk routes almost every link through a `/en/login?x=<token>`
 * redirect wrapper that then 302s to the real destination - this makes full-page
 * navigations noticeably flaky (transient net::ERR_TOO_MANY_RETRIES), so every
 * goto is retried several times rather than treated as a hard failure.
 */
async function gotoRetry(page: Page, url: string, tries = 8): Promise<void> {
  let lastError: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      await page.goto(url, { waitUntil: "load", timeout: 20000 });
      return;
    } catch (err) {
      lastError = err;
      await sleep(1500);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Kunne ikke indlæse siden.");
}

async function clickButtonWithText(page: Page, text: string): Promise<boolean> {
  return page.evaluate((label: string) => {
    const btn = Array.from(document.querySelectorAll("button, a")).find(
      (el) => el.textContent?.trim() === label
    ) as HTMLElement | undefined;
    if (!btn) return false;
    btn.click();
    return true;
  }, text);
}

async function login(page: Page): Promise<void> {
  const { username, password } = credentials();

  for (let attempt = 0; attempt < 5; attempt++) {
    await gotoRetry(page, `${BASE_URL}/en/login`);
    await sleep(1500);

    const usernameField = await page.$('input[placeholder="Username"]');
    if (usernameField) {
      await page.locator('input[placeholder="Username"]').fill(username);
      await page.locator('input[placeholder="Password"]').fill(password);
      await clickButtonWithText(page, "Login");
      await sleep(4000);
    }

    const searchBoxes = await page.$$('input[name="p[search]"]');
    if (searchBoxes.length > 0) return;
  }
  throw new Error("Kunne ikke logge ind på explore.nextview360.dk efter flere forsøg.");
}

/** Searches by MP-Space ID and returns the href of that tour's editor link. */
async function findEditorHref(page: Page, mpSkinId: string): Promise<string> {
  const searchBoxes = await page.$$('input[name="p[search]"]');
  if (searchBoxes.length === 0) throw new Error("Søgefeltet blev ikke fundet (ikke logget ind?).");
  await searchBoxes[0].evaluate((el: Element, value: string) => {
    (el as HTMLInputElement).value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, mpSkinId);
  await page.keyboard.press("Enter");
  await sleep(2500);

  const href = await page.evaluate(() => {
    const link = document.querySelector("a.cnt.force-top") as HTMLAnchorElement | null;
    return link?.href ?? null;
  });
  if (!href) throw new Error(`Ingen tour fundet for MP-Skin nummer "${mpSkinId}".`);
  return href;
}

function parseDanishNumber(raw: string): number {
  return Number(raw.replace(/\./g, "").replace(",", ".")) || 0;
}

/**
 * Parses the "Stats" tab's plain text into the 4 period cards. Matched
 * against the tab's confirmed real layout (LAST 7/30/90 DAYS, then SINCE
 * <date>, each followed by a visit count, "VISITS", session/user counts and
 * an average time) - fragile by nature (text-based, no stable selectors
 * confirmed on this third-party page), so a layout change there will need
 * this regex updated.
 */
function parseStatsText(text: string): ExploreTourStats {
  const periodBlock = (label: string) => {
    const re = new RegExp(
      `${label}[\\s\\S]{0,20}?([\\d.,]+)[\\s\\S]{0,20}?VISITS[\\s\\S]{0,60}?([\\d.,]+)\\s*Sessions[\\s\\S]{0,40}?([\\d.,]+)\\s*Users[\\s\\S]{0,60}?([\\dhmins:]+(?:min)?\\s*\\d*\\s*sec)\\s*Average time`,
      "i"
    );
    const match = text.match(re);
    if (!match) return { visits: 0, sessions: 0, users: 0, avgTime: "–" };
    return {
      visits: parseDanishNumber(match[1]),
      sessions: parseDanishNumber(match[2]),
      users: parseDanishNumber(match[3]),
      avgTime: match[4].trim(),
    };
  };

  const sinceMatch = text.match(/SINCE\s+([\d.]+)/i);

  return {
    last7Days: periodBlock("LAST 7 DAYS"),
    last30Days: periodBlock("LAST 30 DAYS"),
    last90Days: periodBlock("LAST 90 DAYS"),
    sinceLabel: sinceMatch ? sinceMatch[1] : "",
    sinceStats: periodBlock(`SINCE\\s+[\\d.]+`),
  };
}

async function fetchImageAsBuffer(page: Page, url: string): Promise<Buffer> {
  const base64 = await page.evaluate(async (imgUrl: string) => {
    const res = await fetch(imgUrl);
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }, url);
  return Buffer.from(base64, "base64");
}

/**
 * Logs into explore.nextview360.dk, finds the given tour by MP-Space ID, and
 * pulls its visitor stats, cover photo and (best-effort) heatmap.
 */
export async function fetchExploreTourData(mpSkinId: string): Promise<ExploreTourData> {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 1000 });

    await login(page);
    const editorHref = await findEditorHref(page, mpSkinId);

    // Cover image lives at a predictable authenticated URL per MP-Space ID -
    // far more reliable than the JS-rendered "Cover/Title" tab, which never
    // exposes the URL in the server-rendered HTML.
    const coverImage = await fetchImageAsBuffer(
      page,
      `${BASE_URL}/cache/tour-cache-mpApi-${mpSkinId}-cover-.png`
    );

    let statsText = "";
    let heatmapImage: Buffer | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await gotoRetry(page, editorHref);
        await sleep(3000);
        const clicked = await clickButtonWithText(page, "Stats");
        if (!clicked) throw new Error('Fanen "Stats" blev ikke fundet.');
        await sleep(3000);
        statsText = await page.evaluate(() => document.body.innerText);
        if (!/LAST 7 DAYS/i.test(statsText)) throw new Error("Statistik-siden indeholdt ikke de forventede tal.");

        const heatmapEl = await page.$(".heatmap, [class*='heatmap']");
        if (heatmapEl) {
          heatmapImage = (await heatmapEl.screenshot({ type: "png" })) as Buffer;
        }
        break;
      } catch (err) {
        if (attempt === 4) throw err;
        await sleep(1500);
      }
    }

    const stats = parseStatsText(statsText);
    return { stats, coverImage, heatmapImage };
  } finally {
    await browser.close();
  }
}
