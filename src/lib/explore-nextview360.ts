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

/**
 * Searches by MP-Space ID and returns the editor hrefs of every matching
 * result row - normally just one, but the same MP-Space ID can legitimately
 * have 2-4 separate "Skin" entries under it (e.g. one for the whole tour and
 * others scoped to specific rooms), each with its own independently tracked
 * visitor stats that all belong to the same customer/deal.
 */
async function findEditorHrefs(page: Page, mpSkinId: string): Promise<string[]> {
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

  const hrefs = await retryOnDestroyedContext(() =>
    page.evaluate((expectedId: string) => {
      const links = Array.from(document.querySelectorAll("a.cnt.force-top")) as HTMLAnchorElement[];
      // Every result row whose own text actually names this MP-Space ID -
      // there's normally exactly one, but a handful of tours have several
      // "Skin" entries sharing the same MP-Space ID (see the function doc).
      const container = (el: HTMLElement) => el.closest("tr, .list-item, li") ?? el;
      const matches = links.filter((l) => container(l).textContent?.includes(expectedId));
      return (matches.length > 0 ? matches : links.slice(0, 1)).map((l) => l.href);
    }, mpSkinId)
  );
  if (hrefs.length === 0) throw new Error(`Ingen tour fundet for MP-Skin nummer "${mpSkinId}".`);
  return hrefs;
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

/** "01min 47 sec" (or similar, with an optional leading "Xh") -> total seconds. */
function parseAvgTimeToSeconds(avgTime: string): number {
  const hours = /(\d+)\s*h/i.exec(avgTime);
  const minutes = /(\d+)\s*min/i.exec(avgTime);
  const seconds = /(\d+)\s*sec/i.exec(avgTime);
  return (hours ? Number(hours[1]) * 3600 : 0) + (minutes ? Number(minutes[1]) * 60 : 0) + (seconds ? Number(seconds[1]) : 0);
}

function formatSecondsAsAvgTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.round(totalSeconds % 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0 ? `${hours}h ${pad(minutes)}min ${pad(seconds)} sec` : `${pad(minutes)}min ${pad(seconds)} sec`;
}

/** "08.11.2025" -> a comparable Date, for picking the earliest of several tours' go-live dates. */
function parseDanishDate(label: string): Date | null {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(label.trim());
  if (!match) return null;
  return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
}

/** Sums visits/sessions/users across tours, and averages avgTime weighted by each tour's session count. */
function sumPeriodStats(all: ExplorePeriodStats[]): ExplorePeriodStats {
  const visits = all.reduce((sum, s) => sum + s.visits, 0);
  const sessions = all.reduce((sum, s) => sum + s.sessions, 0);
  const users = all.reduce((sum, s) => sum + s.users, 0);
  const weightedSeconds = all.reduce((sum, s) => sum + s.sessions * parseAvgTimeToSeconds(s.avgTime), 0);
  const avgTime = sessions > 0 ? formatSecondsAsAvgTime(weightedSeconds / sessions) : all[0]?.avgTime ?? "–";
  return { visits, sessions, users, avgTime };
}

/**
 * Combines several tours' stats into one - either because a customer has
 * more than one MP-Skin nummer entered (multiple locations under one deal),
 * or because a single searched MP-Space ID turned up several separate
 * result rows (see findEditorHrefs). Every number is summed, except "since"
 * which keeps the earliest go-live date of the bunch (the customer's
 * overall presence started then, not later).
 */
function aggregateTourStats(all: ExploreTourStats[]): ExploreTourStats {
  if (all.length === 1) return all[0];

  const earliest = all.reduce((best, s) => {
    const bestDate = parseDanishDate(best.sinceLabel);
    const date = parseDanishDate(s.sinceLabel);
    if (!date) return best;
    if (!bestDate || date < bestDate) return s;
    return best;
  });

  return {
    last7Days: sumPeriodStats(all.map((s) => s.last7Days)),
    last30Days: sumPeriodStats(all.map((s) => s.last30Days)),
    last90Days: sumPeriodStats(all.map((s) => s.last90Days)),
    sinceLabel: earliest.sinceLabel,
    sinceStats: sumPeriodStats(all.map((s) => s.sinceStats)),
  };
}

/**
 * Opens one specific result row's editor (by its position among the search's
 * matches for mpSkinId) and reads back its Stats tab's 4 period cards,
 * retrying the whole flow on failure.
 */
async function fetchOneTourStats(page: Page, mpSkinId: string, resultIndex: number, editorHref: string): Promise<ExploreTourStats> {
  let statsText = "";
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      // Every link on this site - including the one we already grabbed - is
      // wrapped in a single-use `/en/login?x=<token>` redirect, so reusing
      // the same href on a retry just lands back on a dead/expired link.
      // Re-searching gets a fresh, still-valid one each time - same result
      // position as before, since the site returns matches in a stable order
      // for the same search term.
      const href = attempt === 0 ? editorHref : (await findEditorHrefs(page, mpSkinId))[resultIndex] ?? editorHref;
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

      return parseStatsText(statsText);
    } catch (err) {
      lastError = err;
      await sleep(1500);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Ukendt fejl.");
}

/**
 * Logs into explore.nextview360.dk, finds the given tour(s) by MP-Space ID,
 * and pulls their visitor stats and cover photo. Almost always a single ID
 * resolving to a single result - but a handful of customers have more than
 * one tour under the same deal, and/or a single searched ID can itself
 * resolve to 2-4 separate result rows (distinct "Skin" entries sharing one
 * MP-Space ID, e.g. one for the whole tour plus others scoped to specific
 * rooms). Every case sums into one set of numbers; the first tour's cover
 * photo is used as the report's hero image.
 */
export async function fetchExploreTourData(mpSkinIds: string | string[]): Promise<ExploreTourData> {
  const ids = Array.isArray(mpSkinIds) ? mpSkinIds : [mpSkinIds];
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 1000 });

    let coverImage: Buffer | null = null;
    const allStats: ExploreTourStats[] = [];
    for (const mpSkinId of ids) {
      // A single searched MP-Space ID can turn up more than one result row
      // (2-4 seen in practice - e.g. one Skin for the whole tour and others
      // scoped to specific rooms), each tracked independently - so every
      // matching row's stats are fetched and summed in, not just the first.
      const editorHrefs = await findEditorHrefs(page, mpSkinId);
      if (!coverImage) {
        // Cover image lives at a predictable authenticated URL per MP-Space
        // ID - far more reliable than the JS-rendered "Cover/Title" tab,
        // which never exposes the URL in the server-rendered HTML.
        coverImage = await fetchImageAsBuffer(page, `${BASE_URL}/cache/tour-cache-mpApi-${mpSkinId}-cover-.png`);
      }
      for (let i = 0; i < editorHrefs.length; i++) {
        allStats.push(await fetchOneTourStats(page, mpSkinId, i, editorHrefs[i]));
      }
    }

    return { stats: aggregateTourStats(allStats), coverImage: coverImage! };
  } finally {
    await browser.close();
  }
}
