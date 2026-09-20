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

/**
 * Retries an evaluate-style call if the page navigated away mid-call - a
 * frequent failure on this site ("Execution context was destroyed, most
 * likely because of a navigation"), seemingly from client-side redirects
 * that can fire with no action on our part. A destroyed context is a
 * transient race, not a real failure, so it's worth a few quick retries
 * before giving up.
 */
async function retryOnDestroyedContext<T>(fn: () => Promise<T>, tries = 5): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (!(err instanceof Error) || !/execution context was destroyed/i.test(err.message)) throw err;
      lastError = err;
      await sleep(1000);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Ukendt fejl.");
}

async function clickButtonWithText(page: Page, text: string): Promise<boolean> {
  return retryOnDestroyedContext(() =>
    page.evaluate((label: string) => {
      const btn = Array.from(document.querySelectorAll("button, a")).find(
        (el) => el.textContent?.trim() === label
      ) as HTMLElement | undefined;
      if (!btn) return false;
      btn.click();
      return true;
    }, text)
  );
}

/**
 * Ensures the page is on a screen with the search box - logging in (or
 * re-logging in) as needed. Session state on this site is unpredictable:
 * a search box found a moment ago can be gone by the very next check with no
 * navigation in between (client-side redirect, dropped session, or similar),
 * so this is called again at the start of every search rather than trusting
 * a login done once at the top to still hold.
 */
async function ensureOnSearchPage(page: Page): Promise<void> {
  const { username, password } = credentials();

  for (let attempt = 0; attempt < 5; attempt++) {
    if ((await page.$$('input[name="p[search]"]')).length > 0) return;

    await gotoRetry(page, `${BASE_URL}/en/login`);
    await sleep(1500);

    const usernameField = await page.$('input[placeholder="Username"]');
    if (usernameField) {
      await page.locator('input[placeholder="Username"]').fill(username);
      await page.locator('input[placeholder="Password"]').fill(password);
      await clickButtonWithText(page, "Login");
      await sleep(4000);
    }

    if ((await page.$$('input[name="p[search]"]')).length > 0) return;
    await sleep(1500);
  }
  throw new Error("Kunne ikke logge ind på explore.nextview360.dk efter flere forsøg.");
}

/** Searches by MP-Space ID and returns the href of that tour's editor link. */
async function findEditorHref(page: Page, mpSkinId: string): Promise<string> {
  await ensureOnSearchPage(page);
  const searchBoxes = await page.$$('input[name="p[search]"]');
  if (searchBoxes.length === 0) throw new Error("Søgefeltet blev ikke fundet (ikke logget ind?).");

  // There are several same-named search inputs on this page (only one visible);
  // the site's search only actually runs off real keystroke events, so setting
  // `.value` and dispatching a synthetic "input" event does nothing - the
  // request that fires on Enter goes out with an empty/stale search term and
  // the "results" are just whatever was already on screen. Confirmed via
  // network inspection: only real simulated typing produces the filtered
  // request (`...&p[search]=<id>...`) that actually narrows the list.
  let searchBox = searchBoxes[0];
  for (const box of searchBoxes) {
    const visible = await box.evaluate((el) => !!(el as HTMLElement).offsetWidth || !!(el as HTMLElement).offsetHeight);
    if (visible) {
      searchBox = box;
      break;
    }
  }
  await searchBox.click({ count: 3 });
  await searchBox.type(mpSkinId, { delay: 50 });
  await page.keyboard.press("Enter");

  // Before the results list actually re-renders to the filtered match, the
  // page still shows whatever was there before (the Home page's own default
  // "last updated skins" list) - grabbing the first "a.cnt.force-top" too
  // early silently returns a link to a completely different, unrelated
  // tour instead of failing loudly. Wait until the page's own text actually
  // mentions this MP-Space ID before trusting that link.
  let sawMpSkinId = false;
  for (let poll = 0; poll < 10; poll++) {
    const text = await retryOnDestroyedContext(() => page.evaluate(() => document.body.innerText)).catch(() => "");
    if (text.includes(mpSkinId)) {
      sawMpSkinId = true;
      break;
    }
    await sleep(500);
  }
  if (!sawMpSkinId) throw new Error(`Søgeresultatet viste aldrig MP-Skin nummer "${mpSkinId}" - prøver igen.`);

  const href = await retryOnDestroyedContext(() =>
    page.evaluate((expectedId: string) => {
      const links = Array.from(document.querySelectorAll("a.cnt.force-top")) as HTMLAnchorElement[];
      // Prefer a result row whose own text actually names this MP-Space ID,
      // rather than blindly trusting the first result in the list.
      const container = (el: HTMLElement) => el.closest("tr, .list-item, li") ?? el;
      const match = links.find((l) => container(l).textContent?.includes(expectedId));
      return (match ?? links[0])?.href ?? null;
    }, mpSkinId)
  );
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
  const base64 = await retryOnDestroyedContext(() =>
    page.evaluate(async (imgUrl: string) => {
      const res = await fetch(imgUrl);
      const buf = await res.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      return btoa(binary);
    }, url)
  );
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
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        // Every link on this site - including the one we already grabbed -
        // is wrapped in a single-use `/en/login?x=<token>` redirect, so
        // reusing the same href on a retry just lands back on a dead/expired
        // link. Re-searching gets a fresh, still-valid one each time.
        const href = attempt === 0 ? editorHref : await findEditorHref(page, mpSkinId);
        await gotoRetry(page, href);
        await sleep(3000);
        const clicked = await clickButtonWithText(page, "Stats");
        if (!clicked) throw new Error('Fanen "Stats" blev ikke fundet.');

        // The "Enable cookies for stats" Yes/No toggle and its explanation
        // text render immediately either way (on or off) - it's not a signal
        // of anything. The actual period cards (LAST 7 DAYS etc.) load a
        // little after that, apparently slow enough in practice to still be
        // missing after a single fixed pause, so poll for them instead of
        // trusting one fixed sleep.
        statsText = "";
        for (let poll = 0; poll < 12; poll++) {
          try {
            statsText = await page.evaluate(() => document.body.innerText);
          } catch (err) {
            // A destroyed context mid-poll just means "not ready yet, and the
            // page moved" - keep polling rather than aborting the attempt.
            if (!(err instanceof Error) || !/execution context was destroyed/i.test(err.message)) throw err;
          }
          if (/LAST 7 DAYS/i.test(statsText)) break;
          await sleep(1000);
        }
        if (!/LAST 7 DAYS/i.test(statsText)) {
          const snippet = statsText.replace(/\s+/g, " ").trim().slice(0, 300);
          throw new Error(`Statistik-siden indeholdt ikke de forventede tal (uddrag: "${snippet}").`);
        }

        const heatmapEl = await page.$(".heatmap, [class*='heatmap']");
        if (heatmapEl) {
          heatmapImage = (await heatmapEl.screenshot({ type: "png" })) as Buffer;
        }
        lastError = undefined;
        break;
      } catch (err) {
        lastError = err;
        await sleep(1500);
      }
    }
    if (lastError) throw lastError;

    const stats = parseStatsText(statsText);
    return { stats, coverImage, heatmapImage };
  } finally {
    await browser.close();
  }
}
