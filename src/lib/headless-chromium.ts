import puppeteer, { type Browser } from "puppeteer-core";
import chromium from "@sparticuz/chromium";

function isTextFileBusy(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  return e?.code === "ETXTBSY" || Boolean(e?.message?.includes("ETXTBSY"));
}

/**
 * Launches the serverless Chromium every scraper/PDF renderer here uses.
 * @sparticuz/chromium unpacks its binary into /tmp on first use - when two
 * launches overlap in the same warm instance (e.g. two visitor reports at
 * once), one can try to execute it while the other is still writing it and
 * fail with "spawn ETXTBSY". That's transient, so it's retried after a short
 * pause instead of failing the whole report.
 */
export async function launchHeadlessChromium(): Promise<Browser> {
  const attempts = 4;
  for (let attempt = 1; ; attempt++) {
    try {
      // CHROMIUM_PATH: a Chromium of one's own when developing locally (the serverless one is for Vercel).
      const own = process.env.NODE_ENV !== "production" ? process.env.CHROMIUM_PATH : undefined;
      return await puppeteer.launch({
        args: own ? [] : chromium.args,
        executablePath: own || (await chromium.executablePath()),
        headless: true,
      });
    } catch (err) {
      if (!isTextFileBusy(err) || attempt >= attempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    }
  }
}
