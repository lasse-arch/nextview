import puppeteer, { type Browser, type Page } from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import type { ExploreTourData, ExploreTourStats, ExplorePeriodStats } from "./explore-nextview360";

/**
 * Pulls visitor stats straight from Matterport's own dashboard
 * (my.matterport.com) instead of explore.nextview360.dk - same output shape
 * (ExploreTourData) as explore-nextview360.ts, so customer-report-service.ts
 * only needed its import swapped, nothing else in the report pipeline
 * changed.
 *
 * IMPORTANT - UNVERIFIED AGAINST THE REAL SITE: this was written without
 * ever being able to actually see my.matterport.com rendered. The sandbox
 * this was built in runs outbound HTTPS through a TLS-inspecting proxy that
 * headless Chromium doesn't trust, and importing the proxy's CA to fix that
 * was blocked by the environment's own safety policy (reasonably so - it's
 * a real trust-store change). Plain HTTP requests only get an empty SPA
 * shell (my.matterport.com needs JS to render anything), so there was no
 * way to confirm the login form's real field selectors, the analytics
 * page's real URL, or its real text layout. Every selector/URL/label below
 * is a best-effort guess from general knowledge of Matterport's dashboard,
 * NOT confirmed. It should work fine from Vercel's production runtime
 * (no proxy there), but the first real run will likely need adjusting
 * based on the actual error message it throws - every failure path below
 * is written to include a snippet of the real page text/HTML it saw, for
 * exactly that reason.
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

  const emailField = await firstMatch(page, [
    'input[type="email"]',
    'input[name="email"]',
    'input[name="username"]',
    "#email",
  ]);
  if (!emailField) {
    const text = await page.evaluate(() => document.body.innerText).catch(() => "");
    throw new Error(`Kunne ikke finde e-mail-feltet på Matterports login-side (uddrag: "${pageSnippet(text)}").`);
  }
  await emailField.type(email, { delay: 30 });

  let passwordField = await firstMatch(page, ['input[type="password"]']);
  if (!passwordField) {
    // Two-step flow: email submitted first, password field appears after.
    const continueBtn = await firstMatch(page, ['button[type="submit"]', "button"]);
    if (continueBtn) await continueBtn.click();
    await sleep(2000);
    passwordField = await firstMatch(page, ['input[type="password"]']);
  }
  if (!passwordField) {
    const text = await page.evaluate(() => document.body.innerText).catch(() => "");
    throw new Error(`Kunne ikke finde password-feltet på Matterports login-side (uddrag: "${pageSnippet(text)}").`);
  }
  await passwordField.type(password, { delay: 30 });

  const submitBtn = await firstMatch(page, ['button[type="submit"]', "button"]);
  if (submitBtn) await submitBtn.click();
  await sleep(4000);

  if (/\/login/i.test(page.url())) {
    const text = await page.evaluate(() => document.body.innerText).catch(() => "");
    throw new Error(`Login på Matterport lykkedes tilsyneladende ikke - stadig på login-siden (uddrag: "${pageSnippet(text)}").`);
  }
}

function parseNumber(raw: string): number {
  return Number(raw.replace(/[.,](?=\d{3}\b)/g, "").replace(",", ".")) || 0;
}

/** Best-effort label match for one metric, trying several plausible labels
 * Matterport might use, in order - returns null (not 0) when nothing
 * matches, so callers can tell "found zero visits" from "couldn't find it". */
function findMetric(text: string, labels: string[]): number | null {
  for (const label of labels) {
    const re = new RegExp(`${label}[^\\d]{0,25}([\\d.,]+)`, "i");
    const match = text.match(re);
    if (match) return parseNumber(match[1]);
  }
  return null;
}

function findAvgTime(text: string): string {
  const match = text.match(/average\s*(?:time|duration)[^\dhm]{0,20}([\dhm: ]+(?:sec|s)?)/i);
  return match ? match[1].trim() : "–";
}

/** All 4 periods the report template expects. Matterport's own dashboard
 * may only expose one all-time total rather than the 7/30/90-day split
 * explore.nextview360.dk has - if no period-specific numbers are found,
 * the one overall total found is used for `sinceStats` only (not backfilled
 * into the shorter periods, which would misleadingly overstate recent
 * activity) and the shorter periods are left at zero. */
function parseMatterportStats(text: string): ExploreTourStats {
  const zero: ExplorePeriodStats = { visits: 0, sessions: 0, users: 0, avgTime: "–" };

  const overallViews = findMetric(text, ["Total [Vv]iews", "[Vv]iews"]);
  const overallVisitors = findMetric(text, ["Unique [Vv]isitors", "[Vv]isitors"]);
  const avgTime = findAvgTime(text);

  const overall: ExplorePeriodStats = {
    visits: overallViews ?? 0,
    sessions: overallViews ?? 0,
    users: overallVisitors ?? overallViews ?? 0,
    avgTime,
  };

  const last7 = findMetric(text, ["7[- ]days?"]);
  const last30 = findMetric(text, ["30[- ]days?"]);
  const last90 = findMetric(text, ["90[- ]days?"]);

  return {
    last7Days: last7 !== null ? { visits: last7, sessions: last7, users: last7, avgTime } : zero,
    last30Days: last30 !== null ? { visits: last30, sessions: last30, users: last30, avgTime } : zero,
    last90Days: last90 !== null ? { visits: last90, sessions: last90, users: last90, avgTime } : zero,
    sinceLabel: "",
    sinceStats: overall,
  };
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

async function fetchOneModelStats(page: Page, sid: string): Promise<ExploreTourStats> {
  // Best-effort guess at the analytics page's URL - unconfirmed, see file doc comment.
  const candidateUrls = [
    `https://my.matterport.com/models/analytics/${sid}/`,
    `https://my.matterport.com/workshop/insights/${sid}/`,
  ];

  let lastText = "";
  for (const url of candidateUrls) {
    await gotoRetry(page, url);
    await sleep(3000);
    lastText = await page.evaluate(() => document.body.innerText).catch(() => "");
    if (/views|visits|visitors/i.test(lastText)) {
      return parseMatterportStats(lastText);
    }
  }

  throw new Error(
    `Statistik-siden for model "${sid}" indeholdt ikke de forventede tal (uddrag: "${pageSnippet(lastText)}").`
  );
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
