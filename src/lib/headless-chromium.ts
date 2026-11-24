import puppeteer, { type Browser } from "puppeteer-core";
import chromium from "@sparticuz/chromium-min";
import { createHash } from "node:crypto";
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import pack from "./chromium-pack.json";

function isTextFileBusy(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  return e?.code === "ETXTBSY" || Boolean(e?.message?.includes("ETXTBSY"));
}

/**
 * Chromium's files are not in the function (~67 MB in each one made every deploy take ~10 minutes):
 * the build puts them in the deployment's own static files (scripts/build-chromium-pack.mjs), and
 * the first launch in an instance fetches them into /tmp - from this deployment, else from production -
 * and checks each one's sha256 against chromium-pack.json before anything runs it. Fetched once per
 * instance (one fetch even when several launches start at once).
 */
let packDir: Promise<string> | null = null;
function chromiumPack(): Promise<string> {
  packDir ??= fetchPack().catch((err) => {
    packDir = null;
    throw err;
  });
  return packDir;
}

async function fetchPack(): Promise<string> {
  const dir = path.join(tmpdir(), `chromium-pack-${pack.version}`);
  const origins = [process.env.VERCEL_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL].filter(Boolean).map((h) => `https://${h}`);
  if (process.env.APP_BASE_URL) origins.push(process.env.APP_BASE_URL.replace(/\/+$/, ""));
  if (!origins.length) throw new Error("Chromium: ingen adresse at hente den fra (VERCEL_URL)");
  await mkdir(dir, { recursive: true });
  // A deployment behind Vercel's protection lets its own functions through with the bypass secret, when there is one.
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  for (const [name, sum] of Object.entries(pack.files)) {
    const file = path.join(dir, name);
    if (await stat(file).then((s) => s.size > 0, () => false)) continue;
    let last: unknown = null;
    let done = false;
    for (const origin of [...new Set(origins)]) {
      try {
        // Our own deployment's static file (a fixed address, not user input) - checked by its sha256 below.
        const res = await fetch(`${origin}/_chromium/${pack.version}/${name}`, { headers: bypass ? { "x-vercel-protection-bypass": bypass } : {}, redirect: "error", signal: AbortSignal.timeout(60_000) });
        if (!res.ok) throw new Error(`${name}: HTTP ${res.status} fra ${origin}`);
        const data = Buffer.from(await res.arrayBuffer());
        const got = createHash("sha256").update(data).digest("hex");
        if (got !== sum) throw new Error(`${name}: forkert sha256 fra ${origin}`);
        await writeFile(`${file}.part`, data);
        await rename(`${file}.part`, file);
        done = true;
        break;
      } catch (err) {
        last = err;
      }
    }
    if (!done) {
      await rm(dir, { recursive: true, force: true });
      throw last instanceof Error ? last : new Error(`Chromium: kunne ikke hente ${name}`);
    }
  }
  return dir;
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
        executablePath: own || (await chromium.executablePath(await chromiumPack())),
        headless: true,
      });
    } catch (err) {
      if (!isTextFileBusy(err) || attempt >= attempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    }
  }
}
