/*
 * Puts serverless Chromium's files (from @sparticuz/chromium, a build-only package) in
 * public/_chromium/<version>/ - served as static files of the deployment, so no function
 * carries the ~67 MB (it made every deploy take ~10 minutes). Functions fetch them on first
 * use and check each against src/lib/chromium-pack.json (see headless-chromium.ts).
 *
 * Fails the build if the package's files aren't exactly the ones in chromium-pack.json -
 * after upgrading @sparticuz/chromium(-min), put the new version and sha256 sums there.
 */
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const pack = JSON.parse(await readFile(path.join(root, "src/lib/chromium-pack.json"), "utf8"));
const bin = path.join(root, "node_modules/@sparticuz/chromium/bin");
const own = JSON.parse(await readFile(path.join(root, "node_modules/@sparticuz/chromium/package.json"), "utf8")).version;
if (own !== pack.version) throw new Error(`@sparticuz/chromium is ${own}, chromium-pack.json says ${pack.version}`);

const out = path.join(root, "public/_chromium");
await rm(out, { recursive: true, force: true });
await mkdir(path.join(out, pack.version), { recursive: true });
for (const [name, sum] of Object.entries(pack.files)) {
  const data = await readFile(path.join(bin, name));
  const got = createHash("sha256").update(data).digest("hex");
  if (got !== sum) throw new Error(`${name}: sha256 ${got}, chromium-pack.json says ${sum}`);
  await copyFile(path.join(bin, name), path.join(out, pack.version, name));
}
console.log(`Chromium ${pack.version}: ${Object.keys(pack.files).length} filer i public/_chromium`);
