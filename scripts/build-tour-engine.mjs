/*
 * Builds the tour engine for published tours (Cloudflare): one JavaScript and
 * one CSS file for the browser, named by their content, so every version
 * stays where it is and a tour published with it keeps running it.
 *
 *   node scripts/build-tour-engine.mjs   → public/tour-engine/<hash>/tour.js, tour.css, + manifest.json
 *
 * The manifest also lists the files every published tour shares - the engine
 * and Matterport's viewer (public/matterport) - with Cloudflare's own hash of
 * each (blake3 of the base64 content + extension, as wrangler does), so
 * publishing only ever uploads what Cloudflare doesn't have yet.
 *
 * Arpo's server code is swapped out for stubs (src/tour-static/stubs.ts), and
 * the build fails if anything server-side still slips in.
 */
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { hash as blake3 } from "blake3-wasm";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const stubs = path.join(root, "src/tour-static/stubs.ts");
const SERVER_ONLY = [/^@prisma\//, /^server-only$/, /^@\/lib\/db$/, /^@\/lib\/actions\//, /^node:/];

const result = await build({
  entryPoints: [path.join(root, "src/tour-static/main.tsx")],
  bundle: true,
  minify: true,
  format: "esm",
  target: ["es2020"],
  jsx: "automatic",
  outdir: path.join(root, ".tour-engine-tmp"),
  entryNames: "tour",
  write: false,
  metafile: true,
  define: { "process.env.NODE_ENV": '"production"' },
  loader: { ".png": "dataurl", ".svg": "dataurl", ".gif": "dataurl", ".woff2": "dataurl" },
  plugins: [
    {
      name: "arpo-stubs",
      setup(b) {
        b.onResolve({ filter: /^@\/lib\/actions\/tour-lab$|^next\/navigation$/ }, () => ({ path: stubs }));
      },
    },
    {
      // Anything server-side left is a hard stop, not a warning.
      name: "no-server-code",
      setup(b) {
        b.onResolve({ filter: /.*/ }, (a) => {
          if (SERVER_ONLY.some((r) => r.test(a.path))) return { errors: [{ text: `Serverkode må ikke med i en udgivet tour: ${a.path} (fra ${a.importer})` }] };
          return undefined;
        });
      },
    },
  ],
  resolveExtensions: [".tsx", ".ts", ".jsx", ".js", ".mjs", ".css", ".json"],
  logLevel: "warning",
});

const files = Object.fromEntries(result.outputFiles.map((f) => [path.basename(f.path), f.contents]));

// The few utility classes the engine uses (fixed, inset-0 …) come from Arpo's own stylesheet - the same
// Tailwind setup (src/app/globals.css), but only with the classes found in the tour engine's own files.
const globals = await readFile(path.join(root, "src/app/globals.css"), "utf8");
const twIn = globals.replace('@import "tailwindcss";', '@import "tailwindcss" source(none);\n@source "../app/arpo/tour-lab";');
const tw = await postcss([tailwind({ optimize: { minify: true } })]).process(twIn, { from: path.join(root, "src/tour-static/tour.css") });
files["tour.css"] = Buffer.concat([Buffer.from(tw.css), Buffer.from("\n"), Buffer.from(files["tour.css"] ?? "")]);
const hash = createHash("sha256").update(files["tour.js"]).update(files["tour.css"] ?? "").digest("hex").slice(0, 12);
const out = path.join(root, "public/tour-engine", hash);
await rm(path.join(root, "public/tour-engine"), { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const [name, data] of Object.entries(files)) await writeFile(path.join(out, name), data);
const TYPES = { js: "application/javascript", mjs: "application/javascript", css: "text/css", html: "text/html", json: "application/json", wasm: "application/wasm", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", svg: "image/svg+xml", ico: "image/x-icon", woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", mp3: "audio/mpeg", mp4: "video/mp4", txt: "text/plain", xml: "application/xml", map: "application/json" };
const entry = (published, data) => {
  const ext = path.extname(published).slice(1).toLowerCase();
  return { path: published, hash: blake3(Buffer.from(data).toString("base64") + ext).toString("hex").slice(0, 32), type: TYPES[ext] ?? "application/octet-stream", size: data.length };
};
async function walk(dir) {
  const out = [];
  for (const name of await readdir(dir)) {
    const full = path.join(dir, name);
    if ((await stat(full)).isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}
const engine = Object.entries(files).map(([name, data]) => entry(`/_engine/${hash}/${name}`, data));
const matterport = [];
for (const file of await walk(path.join(root, "public/matterport"))) matterport.push(entry("/" + path.relative(path.join(root, "public"), file).split(path.sep).join("/"), await readFile(file)));
// Pictures of Arpo's own that the engine shows by their address (e.g. "Præsenteret af Nextview360").
for (const own of [...new Set([...Buffer.from(files["tour.js"]).toString().matchAll(/"(\/[a-z0-9-]+\.(?:png|svg|ico|webp|jpg))"/g)].map((m) => m[1]))]) {
  matterport.push(entry(own, await readFile(path.join(root, "public", own))));
}
// The tours' own files in public/tours (drone tiles, 360 pictures, sound …): a published tour takes its folder along.
const tours = [];
for (const file of await walk(path.join(root, "public/tours"))) tours.push(entry("/" + path.relative(path.join(root, "public"), file).split(path.sep).join("/"), await readFile(file)));
await writeFile(path.join(root, "public/tour-engine/manifest.json"), JSON.stringify({ version: hash, engine, shared: matterport, tours }));
const kb = (n) => `${Math.round(n / 1024)} kB`;
console.log(`Tour-motor ${hash}: ${Object.entries(files).map(([n, d]) => `${n} ${kb(d.length)}`).join(", ")}; ${matterport.length} Matterport-filer; ${tours.length} tour-filer`);
