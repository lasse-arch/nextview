import puppeteer, { type Browser, type ElementHandle, type Page } from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import type { ExploreTourData, ExploreTourStats, ExplorePeriodStats } from "./explore-nextview360";

/**
 * Pulls visitor stats straight from Matterport's own dashboard
 * (my.matterport.com) instead of explore.nextview360.dk - same output shape
 * (ExploreTourData) as explore-nextview360.ts, so customer-report-service.ts
 * only needed its import swapped, nothing else in the report pipeline
 * changed.
 *
 * STATUS: the analytics page itself is now CONFIRMED against real
 * screenshots - a model's stats live at
 * `my.matterport.com/models/<MP-Skin nummer>?section=statistics`, with
 * "Total Views" and "Visitors" cards and a 7 days / 30 days / 90 days /
 * Lifetime period toggle (buttons with that exact text). That part of this
 * file is built directly off that confirmed layout, not a guess.
 *
 * Still UNVERIFIED: the login flow (login() below) and the cover-image
 * fetch, since no screenshot of either has been seen yet - the sandbox this
 * runs in can't reach my.matterport.com with a trusted TLS chain from
 * headless Chromium (see the CA-import note in git history), so those two
 * pieces are still a best-effort guess and may need adjusting from the
 * first real error message Vercel's production run throws.
 */

const LOGIN_URL = "https://my.matterport.com/login";

function credentials(): { email: string; password: string } {
  const email = process.env.MATTERPORT_EMAIL;
  const password = process.env.MATTERPORT_PASSWORD;
  if (!email || !password) {
    throw new Error("MATTERPORT_EMAIL/MATTERPORT_PASSWORD er ikke sat.");
  }
  return { email, password };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function launchBrowser(): Promise<Browser> {
  return puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  });
}

async function gotoRetry(page: Page, url: string, tries = 5): Promise<void> {
  let lastError: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
      return;
    } catch (err) {
      lastError = err;
      await sleep(1500);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Kunne ikke indlæse siden.");
}

/** First element on the page matching any of the given selectors, in order. */
async function firstMatch(page: Page, selectors: string[]) {
  for (const selector of selectors) {
    const el = await page.$(selector);
    if (el) return el;
  }
  return null;
}

function pageSnippet(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 300);
}

/** Clicks an element via the DOM directly (`el.click()` inside the page)
 * rather than Puppeteer's coordinate-based click, which hit-tests whatever
 * is visually on top at those coordinates - confirmed necessary: a real
 * production error showed the cookie-consent banner's own text back instead
 * of the login form failing normally, meaning the coordinate click on the
 * real submit button was landing on the banner overlaying it instead. */
async function jsClick(page: Page, el: ElementHandle<Element>): Promise<void> {
  await page.evaluate((node) => (node as HTMLElement).click(), el);
}

/** True if the page's cookie-consent boilerplate text is still visible -
 * used both to decide whether dismissCookieBanner actually worked and to
 * tell a genuinely still-on-login-page failure apart from one where the
 * banner (now irrelevant, since every click below is DOM-based - see
 * jsClick) just happens to still be sitting there unrelated to the real
 * problem. */
async function cookieBannerVisible(page: Page): Promise<boolean> {
  return page
    .evaluate(() => /cookie policy|manage preferences|utilizes technologies such as cookies/i.test(document.body.innerText))
    .catch(() => false);
}

/**
 * Dismisses a OneTrust-style cookie-consent banner if one is showing - see
 * jsClick's doc comment for why a banner ended up a suspect at all. Tries
 * OneTrust's own well-known button id first, then falls back to matching an
 * accept-style button by its text (deliberately excluding "Manage
 * Preferences", which opens a settings panel rather than dismissing it).
 * Returns whether the banner's own text is confirmed gone afterwards, not
 * just whether a click happened - a click that missed (wrong button,
 * nothing matched) should be visible as "still showing" rather than
 * silently assumed to have worked.
 */
async function dismissCookieBanner(page: Page): Promise<boolean> {
  if (!(await cookieBannerVisible(page))) return true;

  const el = await firstMatch(page, ["#onetrust-accept-btn-handler", "#onetrust-accept-btn"]);
  if (el) {
    await jsClick(page, el);
  } else {
    await page
      .evaluate(() => {
        const btn = Array.from(document.querySelectorAll("button")).find((b) => {
          const t = b.textContent?.trim().toLowerCase() ?? "";
          return /^(accept|accept all|accept all cookies|godkend alle|godkend|i accept|allow all)$/.test(t);
        }) as HTMLElement | undefined;
        btn?.click();
      })
      .catch(() => {});
  }

  for (let i = 0; i < 6; i++) {
    await sleep(500);
    if (!(await cookieBannerVisible(page))) return true;
  }
  return false;
}

/**
 * Finds the button most likely to be the real form-submit/continue button -
 * prefers `button[type="submit"]`, then any visible `<button>` whose own
 * text reads like a login/continue action, and as a last resort the first
 * `<button>` at all. Always excludes anything inside a cookie-consent
 * banner container (by id/class), so a banner dismissCookieBanner failed to
 * close can't get clicked by mistake instead of the real form - a generic
 * "just grab the first <button>" fallback would very plausibly hit the
 * banner's own button first, since consent banners are typically injected
 * early in the DOM.
 */
async function findActionButton(page: Page): Promise<ElementHandle<Element> | null> {
  const handle = await page.evaluateHandle(() => {
    const inConsentBanner = (el: Element) =>
      !!el.closest('[id*="onetrust" i], [id*="cookie" i], [class*="cookie" i], [class*="consent" i]');
    const candidates = Array.from(document.querySelectorAll("button")).filter((b) => !inConsentBanner(b));
    const submitTyped = candidates.find((b) => b.getAttribute("type") === "submit");
    if (submitTyped) return submitTyped;
    const labelMatch = candidates.find((b) => /log ?in|sign ?in|continue|log ind|fortsæt/i.test(b.textContent ?? ""));
    return labelMatch ?? candidates[0] ?? null;
  });
  const el = handle.asElement();
  return (el as ElementHandle<Element>) ?? null;
}

/** Polls page.url() for up to ~8s for it to move off /login, rather than a
 * single fixed sleep - a client-side redirect after a successful submit can
 * take a moment, and a fixed too-short wait would misreport a genuine
 * success-in-progress as a failure. */
async function waitForLoginToResolve(page: Page): Promise<void> {
  for (let i = 0; i < 16; i++) {
    if (!/\/login/i.test(page.url())) return;
    await sleep(500);
  }
}

/**
 * Logs into my.matterport.com - see the file-level doc comment: these
 * selectors are an educated guess, not confirmed against the real site.
 * Tries a two-step (email, then password appears) flow first since that's
 * the more common modern pattern, falling back to a single combined form.
 */
async function login(page: Page): Promise<void> {
  const { email, password } = credentials();
  await gotoRetry(page, LOGIN_URL);
  await sleep(2000);
  const bannerGoneInitially = await dismissCookieBanner(page);

  const emailField = await firstMatch(page, [
    'input[type="email"]',
    'input[name="email"]',
    'input[name="username"]',
    "#email",
  ]);
  if (!emailField) {
    const text = await page.evaluate(() => document.body.innerText).catch(() => "");
    throw new Error(
      `Kunne ikke finde e-mail-feltet på Matterports login-side (url: ${page.url()}, cookie-banner lukket: ${bannerGoneInitially ? "ja" : "nej"}, uddrag: "${pageSnippet(text)}").`
    );
  }
  await emailField.type(email, { delay: 30 });

  let passwordField = await firstMatch(page, ['input[type="password"]']);
  if (!passwordField) {
    // Two-step flow: email submitted first, password field appears after.
    const continueBtn = await findActionButton(page);
    if (continueBtn) await jsClick(page, continueBtn);
    await sleep(2000);
    await dismissCookieBanner(page);
    passwordField = await firstMatch(page, ['input[type="password"]']);
  }
  if (!passwordField) {
    const text = await page.evaluate(() => document.body.innerText).catch(() => "");
    throw new Error(
      `Kunne ikke finde password-feltet på Matterports login-side (url: ${page.url()}, uddrag: "${pageSnippet(text)}").`
    );
  }
  await passwordField.type(password, { delay: 30 });

  const submitBtn = await findActionButton(page);
  if (submitBtn) await jsClick(page, submitBtn);
  await waitForLoginToResolve(page);

  if (/\/login/i.test(page.url())) {
    const bannerStillUp = await cookieBannerVisible(page);
    const text = await page.evaluate(() => document.body.innerText).catch(() => "");
    throw new Error(
      `Login på Matterport lykkedes tilsyneladende ikke - stadig på login-siden (url: ${page.url()}, cookie-banner stadig synligt: ${bannerStillUp ? "ja" : "nej"}, uddrag: "${pageSnippet(text)}").`
    );
  }
}

function parseNumber(raw: string): number {
  return Number(raw.replace(/[.,](?=\d{3}\b)/g, "").replace(",", ".")) || 0;
}

/** Matches a confirmed card label ("Total Views", "Visitors") followed by
 * its one-line description text and then the number - the description
 * ("Times your 3D tour was opened and viewed.", etc.) runs up to ~45 chars,
 * hence the generous gap allowance. Returns null (not 0) when the label
 * isn't found at all, so callers can tell "found zero" from "page layout
 * changed / didn't load". */
function findMetric(text: string, label: string): number | null {
  const re = new RegExp(`${label}[^\\d]{0,150}?([\\d.,]+)`, "i");
  const match = text.match(re);
  return match ? parseNumber(match[1]) : null;
}

/** Reads whichever period is currently selected on the Analytics tab
 * (confirmed layout: "Total Views" and "Visitors" cards near the top). */
function parseVisibleMetrics(text: string): ExplorePeriodStats | null {
  const views = findMetric(text, "Total Views");
  const visitors = findMetric(text, "Visitors");
  if (views === null && visitors === null) return null;
  return { visits: views ?? 0, sessions: views ?? 0, users: visitors ?? 0, avgTime: "–" };
}

/** Clicks one of the confirmed period-toggle buttons ("7 days", "30 days",
 * "90 days", "Lifetime") above the stats cards. */
async function clickPeriodButton(page: Page, label: string): Promise<boolean> {
  return page.evaluate((lbl: string) => {
    const btn = Array.from(document.querySelectorAll("button")).find((el) => el.textContent?.trim() === lbl) as
      | HTMLElement
      | undefined;
    if (!btn) return false;
    btn.click();
    return true;
  }, label);
}

const zeroPeriod: ExplorePeriodStats = { visits: 0, sessions: 0, users: 0, avgTime: "–" };

/** Selects one period (clicking the matching button when present - the
 * period shown on first page load, "30 days", needs no click) and reads
 * back its Total Views / Visitors numbers. */
async function fetchPeriodMetrics(page: Page, buttonLabel: string): Promise<ExplorePeriodStats> {
  const clicked = await clickPeriodButton(page, buttonLabel);
  if (clicked) await sleep(1500);
  const text = await page.evaluate(() => document.body.innerText).catch(() => "");
  return parseVisibleMetrics(text) ?? zeroPeriod;
}

async function fetchCoverImage(page: Page, sid: string): Promise<Buffer | null> {
  try {
    const base64 = await page.evaluate(async (modelSid: string) => {
      const res = await fetch(`https://my.matterport.com/api/v1/models/${modelSid}/thumbnail`);
      if (!res.ok) return null;
      const buf = await res.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      return btoa(binary);
    }, sid);
    return base64 ? Buffer.from(base64, "base64") : null;
  } catch {
    return null;
  }
}

/** Confirmed URL for a model's Analytics tab (from a real screenshot). */
function statsUrl(sid: string): string {
  return `https://my.matterport.com/models/${sid}?section=statistics`;
}

async function fetchOneModelStats(page: Page, sid: string): Promise<ExploreTourStats> {
  await gotoRetry(page, statsUrl(sid));
  await sleep(2500);

  const initialText = await page.evaluate(() => document.body.innerText).catch(() => "");
  if (!/Total Views/i.test(initialText)) {
    throw new Error(
      `Statistik-siden for model "${sid}" indeholdt ikke "Total Views" (uddrag: "${pageSnippet(initialText)}") - er MP-Skin nummeret korrekt, og er kontoen logget ind?`
    );
  }

  return {
    last7Days: await fetchPeriodMetrics(page, "7 days"),
    last30Days: await fetchPeriodMetrics(page, "30 days"),
    last90Days: await fetchPeriodMetrics(page, "90 days"),
    sinceLabel: "",
    sinceStats: await fetchPeriodMetrics(page, "Lifetime"),
  };
}

export async function fetchMatterportTourData(mpSkinIds: string | string[]): Promise<ExploreTourData> {
  const ids = Array.isArray(mpSkinIds) ? mpSkinIds : [mpSkinIds];
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 1000 });

    await login(page);

    let coverImage: Buffer | null = null;
    const allStats: ExploreTourStats[] = [];
    for (const sid of ids) {
      if (!coverImage) coverImage = await fetchCoverImage(page, sid);
      allStats.push(await fetchOneModelStats(page, sid));
    }

    if (!coverImage) throw new Error("Kunne ikke hente et cover-billede fra Matterport.");

    const visits = allStats.reduce((sum, s) => sum + s.sinceStats.visits, 0);
    const sessions = allStats.reduce((sum, s) => sum + s.sinceStats.sessions, 0);
    const users = allStats.reduce((sum, s) => sum + s.sinceStats.users, 0);

    return {
      stats: {
        last7Days: sumAll(allStats.map((s) => s.last7Days)),
        last30Days: sumAll(allStats.map((s) => s.last30Days)),
        last90Days: sumAll(allStats.map((s) => s.last90Days)),
        sinceLabel: "",
        sinceStats: { visits, sessions, users, avgTime: allStats[0]?.sinceStats.avgTime ?? "–" },
      },
      coverImage,
    };
  } finally {
    await browser.close();
  }
}

function sumAll(periods: ExplorePeriodStats[]): ExplorePeriodStats {
  return {
    visits: periods.reduce((sum, p) => sum + p.visits, 0),
    sessions: periods.reduce((sum, p) => sum + p.sessions, 0),
    users: periods.reduce((sum, p) => sum + p.users, 0),
    avgTime: periods.find((p) => p.avgTime !== "–")?.avgTime ?? "–",
  };
}
