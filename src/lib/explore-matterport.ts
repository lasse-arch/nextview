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
 * AUTH APPROACH: rather than visiting a separate hardcoded /login page
 * first and then separately judging whether that succeeded (which is what
 * this used to do, and which kept breaking in new ways - see git history:
 * an organization-scoped post-login URL still containing the literal text
 * "login", a cookie banner that was actually irrelevant noise by that
 * point, ...), every call now navigates straight to the real page it
 * wants (a model's stats page). If already authenticated, that page loads
 * directly. If not, Matterport's own auth wall redirects to a login form
 * and - after a successful submit - redirects back to that exact
 * originally-requested page, so success is judged by the real target
 * content actually showing up (see ensureAuthenticatedOn), not by a
 * generic "looks logged in" signal that has proven to vary.
 *
 * Still UNVERIFIED: the cover-image fetch, since no screenshot of it has
 * been seen yet.
 */

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
 * Forcibly removes whatever element is showing the cookie-consent boilerplate
 * from the DOM, rather than trying to click a specific "accept"-labelled
 * button - the confirmed production text ("utilizes technologies such as
 * cookies...") doesn't match any well-known consent platform's default
 * button id/text closely enough to guess reliably (OneTrust's own id didn't
 * match, and a follow-up run showed the text-based "accept"-label click
 * didn't work either, immediately after a DIFFERENT run where the exact
 * same approach succeeded - i.e. flaky/unreliable, not consistently wrong in
 * the same way). Removing the element outright sidesteps needing to guess
 * its real button's exact wording at all: finds the smallest element whose
 * own text contains the banner's boilerplate phrase (walking down from
 * `document.body` to the most specific containing element, not just any
 * ancestor) and deletes it, which also means findActionButton's own button
 * search can no longer land on anything that used to be inside it.
 */
async function removeCookieBanner(page: Page): Promise<boolean> {
  return page
    .evaluate(() => {
      const marker = /cookie policy|manage preferences|utilizes technologies such as cookies/i;
      let el: Element | null = document.body;
      // Descend into the most specific single child that still contains the
      // marker text, so we remove just the banner - not `<body>` itself.
      while (el) {
        const child: Element | undefined = Array.from(el.children).find((c) => marker.test(c.textContent ?? ""));
        if (!child) break;
        el = child;
      }
      if (el && el !== document.body) {
        el.remove();
        return true;
      }
      return false;
    })
    .catch(() => false);
}

/**
 * Dismisses a cookie-consent banner if one is showing - see jsClick's doc
 * comment for why a banner ended up a suspect at all. Tries a real click
 * first (OneTrust's well-known button id, then an accept-labelled button by
 * text), then - since which of those actually works has proven inconsistent
 * across real runs - forcibly removes the banner element outright as a
 * fallback that doesn't depend on guessing its exact button correctly.
 * Returns whether the banner's own text is confirmed gone afterwards, not
 * just whether a click/removal was attempted.
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

  await removeCookieBanner(page);
  return !(await cookieBannerVisible(page));
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

/**
 * Fills and submits Matterport's login form on the CURRENT page - assumes
 * the caller already navigated somewhere showing a login form (see
 * ensureAuthenticatedOn, which drives this by hitting a protected page
 * directly rather than a separate hardcoded /login page). Only checks that
 * it could interact with the form at all; whether the login actually
 * succeeded is judged by the caller re-checking its real target page, not
 * by anything checked in here.
 */
async function login(page: Page): Promise<void> {
  const { email, password } = credentials();
  await dismissCookieBanner(page);

  const emailField = await firstMatch(page, [
    'input[type="email"]',
    'input[name="email"]',
    'input[name="username"]',
    "#email",
  ]);
  if (!emailField) {
    const text = await page.evaluate(() => document.body.innerText).catch(() => "");
    throw new Error(
      `Kunne ikke finde e-mail-feltet på Matterports login-side (url: ${page.url()}, uddrag: "${pageSnippet(text)}").`
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
  await dismissCookieBanner(page);

  const submitBtn = await findActionButton(page);
  if (submitBtn) await jsClick(page, submitBtn);

  // Give the submit's redirect a moment to start before handing control
  // back - the real success check happens in ensureAuthenticatedOn against
  // the actual target page, not a generic "looks logged in" signal here.
  for (let i = 0; i < 10; i++) {
    if (!(await page.$('input[type="password"]'))) break;
    await sleep(500);
  }
}

/**
 * Navigates straight to a protected page (the real target - e.g. a model's
 * stats page) instead of a separate hardcoded /login page first. If not
 * authenticated, Matterport's own auth wall redirects to a login form and,
 * after a successful submit, should redirect back to that exact originally-
 * requested page - success is judged purely by whether `expectedMarker`
 * (the target page's own confirmed content) shows up, sidestepping ever
 * having to independently judge "does this look like a logged-in session"
 * (which is what kept breaking in new ways - see file-level doc comment).
 */
async function ensureAuthenticatedOn(page: Page, targetUrl: string, expectedMarker: RegExp): Promise<void> {
  await gotoRetry(page, targetUrl);
  await sleep(1500);
  await dismissCookieBanner(page);

  let text = await page.evaluate(() => document.body.innerText).catch(() => "");
  if (expectedMarker.test(text)) return;

  const looksLikeLoginForm =
    (await page.$('input[type="password"]')) !== null ||
    (await page.$('input[type="email"], input[name="email"], input[name="username"], #email')) !== null;
  if (!looksLikeLoginForm) {
    throw new Error(
      `Landede hverken på login-formularen eller den ønskede side (url: ${page.url()}, uddrag: "${pageSnippet(text)}").`
    );
  }

  await login(page);

  // Matterport should redirect back to targetUrl on its own after a
  // successful submit - re-navigating explicitly too is cheap insurance
  // against it landing somewhere generic instead.
  await gotoRetry(page, targetUrl);
  await sleep(1500);
  text = await page.evaluate(() => document.body.innerText).catch(() => "");
  if (!expectedMarker.test(text)) {
    const bannerStillUp = await cookieBannerVisible(page);
    throw new Error(
      `Stadig ikke logget ind efter forsøg (url: ${page.url()}, cookie-banner stadig synligt: ${bannerStillUp ? "ja" : "nej"}, uddrag: "${pageSnippet(text)}").`
    );
  }
}

function parseNumber(raw: string): number {
  return Number(raw.replace(/[.,](?=\d{3}\b)/g, "").replace(",", ".")) || 0;
}

/** Every one of the confirmed card descriptions ("Times your 3D tour was
 * opened and viewed.", "People who viewed your 3D tour.", "Times your 3D
 * tour was shown on a page.") says "3D" - a real digit character. Stripped
 * out before any number extraction runs, confirmed necessary from two real
 * production reports that both came back with every single metric/period
 * reading exactly "3": findMetric's old, looser regex was grabbing that "3"
 * (from "3D") as if it were the metric's actual value, since it's the first
 * digit reachable after the card's heading - real numbers like "2,004"
 * further down were never even reached. */
function stripKnownNoise(text: string): string {
  return text.replace(/\b3D\b/gi, "");
}

/** Matches a confirmed card label ("Total Views", "Visitors") followed by
 * its one-line description text and then the real number. The captured
 * group must START with an actual digit (`\d[\d.,]*`, not `[\d.,]+`) -
 * without that, a second real bug (also confirmed from production) had it
 * grabbing the sentence-ending period in "...opened and viewed." as a
 * one-character "number" before ever reaching the real one on the next
 * line, since a lone "." satisfies `[\d.,]+` just fine. Returns null (not
 * 0) when the label isn't found at all, so callers can tell "found zero"
 * from "page layout changed / didn't load". */
function findMetric(text: string, label: string): number | null {
  const re = new RegExp(`${label}[^\\d]{0,150}?(\\d[\\d.,]*)`, "i");
  const match = text.match(re);
  return match ? parseNumber(match[1]) : null;
}

/** Reads whichever period is currently selected on the Analytics tab
 * (confirmed layout: "Total Views" and "Visitors" cards near the top). */
function parseVisibleMetrics(text: string): ExplorePeriodStats | null {
  const clean = stripKnownNoise(text);
  const views = findMetric(clean, "Total Views");
  const visitors = findMetric(clean, "Visitors");
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
 * back its Total Views / Visitors numbers. Polls for up to ~4s for the
 * numbers to actually change from what was showing before the click,
 * rather than trusting one fixed sleep - the period switch likely re-fetches
 * its data asynchronously, so a too-short fixed wait risks reading the
 * PREVIOUS period's still-displayed numbers (harmless if two periods
 * genuinely have identical traffic - this just polls the full timeout
 * without finding a change in that case). */
async function fetchPeriodMetrics(page: Page, buttonLabel: string): Promise<ExplorePeriodStats> {
  const beforeText = await page.evaluate(() => document.body.innerText).catch(() => "");
  const before = parseVisibleMetrics(beforeText);

  const clicked = await clickPeriodButton(page, buttonLabel);
  if (!clicked) return before ?? zeroPeriod;

  let after = before;
  for (let i = 0; i < 10; i++) {
    await sleep(400);
    const text = await page.evaluate(() => document.body.innerText).catch(() => "");
    after = parseVisibleMetrics(text);
    if (!before || !after || after.visits !== before.visits || after.users !== before.users) break;
  }
  return after ?? zeroPeriod;
}

/**
 * Grabs the model's own cover photo from its Media tab
 * (`my.matterport.com/models/<sid>?section=media`, already authenticated -
 * see ensureAuthenticatedOn), where the model's actual photos are expected
 * to live as plain `<img>` thumbnails. NOT the default Space tab (tried
 * first, confirmed wrong from a real report showing a decorative Matterport
 * marketing/brand graphic instead of the tour's own photo) - the Space
 * tab's real content is the interactive 3D viewer itself, almost certainly
 * rendered as a canvas/iframe rather than a plain image, so scanning that
 * page for "the biggest `<img>`" was finding some unrelated page chrome
 * instead. Also excludes anything whose src/alt suggests it's Matterport's
 * own branding rather than tour content. Throws instead of silently
 * returning null on failure - unlike stats, this has no confirmed structure
 * to fall back on yet, so it's worth knowing exactly which step failed (no
 * suitable image found vs. the image request itself failing) rather than a
 * single generic "didn't work" once this bubbles up to
 * fetchMatterportTourData.
 */
async function fetchCoverImageOrThrow(page: Page, sid: string): Promise<Buffer> {
  await gotoRetry(page, `https://my.matterport.com/models/${sid}?section=media`);
  await sleep(2000);
  await dismissCookieBanner(page);

  const imgUrl = await page.evaluate(() => {
    const isBrandAsset = (img: HTMLImageElement) => /logo|brand|matterport-icon/i.test(img.currentSrc + " " + (img.alt ?? ""));
    const images = Array.from(document.querySelectorAll("img")).filter(
      (img) => img.currentSrc && img.naturalWidth >= 200 && img.naturalHeight >= 120 && !isBrandAsset(img)
    );
    const largest = images.sort((a, b) => b.naturalWidth * b.naturalHeight - a.naturalWidth * a.naturalHeight)[0];
    return largest?.currentSrc ?? null;
  });
  if (!imgUrl) {
    const text = await page.evaluate(() => document.body.innerText).catch(() => "");
    throw new Error(`Fandt intet billede stort nok til at være et cover-foto for model "${sid}" (url: ${page.url()}, uddrag: "${pageSnippet(text)}").`);
  }

  const base64 = await page.evaluate(async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) return { ok: false as const, status: res.status };
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return { ok: true as const, data: btoa(binary) };
  }, imgUrl);
  if (!base64.ok) {
    throw new Error(`Kunne ikke hente billedet "${imgUrl}" for model "${sid}" (status ${base64.status}).`);
  }
  return Buffer.from(base64.data, "base64");
}

/** Confirmed URL for a model's Analytics tab (from a real screenshot). */
function statsUrl(sid: string): string {
  return `https://my.matterport.com/models/${sid}?section=statistics`;
}

async function fetchOneModelStats(page: Page, sid: string): Promise<ExploreTourStats> {
  await ensureAuthenticatedOn(page, statsUrl(sid), /Total Views/i);

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

    let coverImage: Buffer | null = null;
    let coverImageError: unknown;
    const allStats: ExploreTourStats[] = [];
    for (const sid of ids) {
      // fetchOneModelStats always runs first - it's what actually
      // establishes the authenticated session (see ensureAuthenticatedOn) -
      // so fetchCoverImageOrThrow can assume the page is already logged in.
      allStats.push(await fetchOneModelStats(page, sid));
      if (!coverImage) {
        try {
          coverImage = await fetchCoverImageOrThrow(page, sid);
        } catch (err) {
          coverImageError = err;
        }
      }
    }

    if (!coverImage) {
      const detail = coverImageError instanceof Error ? coverImageError.message : "ukendt fejl";
      throw new Error(`Kunne ikke hente et cover-billede fra Matterport: ${detail}`);
    }

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
