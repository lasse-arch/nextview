/*
 * Builds the website (Astro, in website/) as part of Arpo's own build: the pages go to site-web/ (Arpo sends them
 * itself - for now only to the team, at /web/, see lib/beta-site.ts), everything else (pictures, video, CSS, JS,
 * fonts) to public/web/. Both folders are made here on every build - website/ is the only source.
 */
import { execSync } from "node:child_process";
import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const site = path.join(root, "website");
const run = (cmd, env = {}) => execSync(cmd, { cwd: site, stdio: "inherit", env: { ...process.env, ...env } });

if (!existsSync(path.join(site, "node_modules/astro"))) run("npm ci --no-audit --no-fund");
run("npx astro build", { SITE_BASE: "/web/", SITE_INDEXABLE: "" });

const dist = path.join(site, "dist");
const pages = path.join(root, "site-web");
const assets = path.join(root, "public/web");
await rm(pages, { recursive: true, force: true });
await rm(assets, { recursive: true, force: true });
await mkdir(pages, { recursive: true });
await mkdir(assets, { recursive: true });
let n = 0;
for (const f of await readdir(dist)) {
  if (f.endsWith(".html")) {
    await cp(path.join(dist, f), path.join(pages, f));
    n++;
  } else await cp(path.join(dist, f), path.join(assets, f), { recursive: true });
}
console.log(`Hjemmesiden: ${n} sider i site-web/, resten i public/web/`);
