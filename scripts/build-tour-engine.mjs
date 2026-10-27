/*
 * Builds the tour engine for published tours (Cloudflare): one JavaScript and
 * one CSS file for the browser, named by their content, so every version
 * stays where it is and a tour published with it keeps running it.
 *
 *   node scripts/build-tour-engine.mjs   → public/tour-engine/<hash>/tour.js, tour.css, + manifest.json
 *
 * Arpo's server code is swapped out for stubs (src/tour-static/stubs.ts), and
 * the build fails if anything server-side still slips in.
 */
import { build } from "esbuild";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
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
const hash = createHash("sha256").update(files["tour.js"]).update(files["tour.css"] ?? "").digest("hex").slice(0, 12);
const out = path.join(root, "public/tour-engine", hash);
await rm(path.join(root, "public/tour-engine"), { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const [name, data] of Object.entries(files)) await writeFile(path.join(out, name), data);
await writeFile(path.join(root, "public/tour-engine/manifest.json"), JSON.stringify({ version: hash, files: Object.keys(files) }, null, 2));
const kb = (n) => `${Math.round(n / 1024)} kB`;
console.log(`Tour-motor ${hash}: ${Object.entries(files).map(([n, d]) => `${n} ${kb(d.length)}`).join(", ")}`);
