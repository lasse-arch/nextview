#!/usr/bin/env node
/*
 * Arpo's weekly security check (run by the weekly scheduled task, or by hand:
 * `node scripts/security-check.mjs`, `--update-baseline` to accept the
 * current state after reviewing it). It looks for the mistakes that matter
 * most in this codebase and reports only what is NEW since the reviewed
 * baseline (scripts/security-baseline.json) - so a known, accepted spot
 * doesn't cry wolf every week:
 *
 *  1. Server actions without a login check: every exported function in a
 *     "use server" file is a public endpoint - its body must call a guard.
 *  2. API routes without a check: a route.ts must check who is asking, be a
 *     cron (cronAuthorized) - or, if it is meant to be public, rate-limit.
 *  3. Outbound fetch() outside safeFetch (SSRF) in server code.
 *  4. Secrets in the code (API keys, private keys, tokens) - never printed.
 *  5. Known vulnerable packages (npm audit, high and critical).
 *  6. Raw SQL built with ${...} inside $queryRawUnsafe/$executeRawUnsafe.
 *
 * Exit code 1 when something new is found. Writes a Markdown report to
 * stdout (and to --out <file> if given). Reads only; changes nothing unless
 * --update-baseline is passed.
 */
import { execSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const BASELINE = join(ROOT, "scripts/security-baseline.json");
const args = process.argv.slice(2);
const UPDATE = args.includes("--update-baseline");
const OUT = args.includes("--out") ? args[args.indexOf("--out") + 1] : null;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mjs|js)$/.test(name)) out.push(p);
  }
  return out;
}
const rel = (p) => relative(ROOT, p);
const files = walk(join(ROOT, "src"));
const read = (p) => readFileSync(p, "utf8");

/** Calls that check who is asking (team, customer, cron, or a file's own admin helper). */
const GUARD = /\b(require[A-Z]\w*|requireAdmin|getCurrentUser|getCurrentCustomer|getTeamUser|teamSees\w*|adminPreview|cronAuthorized|canAccessBilling|admin|requireSales|assert\w*Access|ensure\w*|guard\w*|currentUser|viewer)\s*\(/;
/** Signs that a public route limits how often it can be called. */
const LIMIT = /\b(tooMany\w*|rateLimit\w*|loginFailure|limiter|overLimit|limited)\b/;

const findings = { actions: [], routes: [], fetches: [], secrets: [], sql: [], audit: [] };

// 1. Server actions. A body counts as checked when it calls a guard - or one of the file's own helpers that does
// (e.g. sentContractOf() calling requireUser()), followed a few levels deep.
/** The file's functions (exported or not) with their bodies, roughly: from one declaration to the next. */
function functionsOf(src) {
  const re = /^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(|^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\(/gm;
  const starts = [...src.matchAll(re)];
  return starts.map((m, i) => ({ name: m[1] ?? m[2], exported: /^export/.test(m[0]), body: src.slice(m.index, starts[i + 1]?.index ?? src.length) }));
}
function guardedNames(fns) {
  const ok = new Set();
  for (let round = 0; round < 4; round++)
    for (const f of fns) {
      if (ok.has(f.name)) continue;
      const own = f.body.replace(/^[^{]*\{/, "");
      if (GUARD.test(own) || [...ok].some((n) => new RegExp(`\\b${n}\\s*\\(`).test(own))) ok.add(f.name);
    }
  return ok;
}
/** Actions meant to be public (login, the customer's own language, link requests) - each must limit itself. */
const PUBLIC_ACTIONS = new Set(["src/lib/actions/auth.ts#login", "src/lib/actions/customer-login.ts#requestLoginLinkAction", "src/lib/actions/customer-login.ts#loginWithLinkAction", "src/lib/actions/customer-login.ts#acceptInviteAction", "src/lib/actions/portal-language.ts#setPortalLanguage"]);
for (const f of files) {
  const src = read(f);
  if (!/^\s*["']use server["'];?/m.test(src.split("\n").slice(0, 3).join("\n"))) continue;
  const fns = functionsOf(src);
  const ok = guardedNames(fns);
  for (const fn of fns) if (fn.exported && /^export\s+async/.test(fn.body) && !ok.has(fn.name) && !PUBLIC_ACTIONS.has(`${rel(f)}#${fn.name}`)) findings.actions.push(`${rel(f)}#${fn.name}`);
}

// 2. API routes.
for (const f of files.filter((p) => /src\/app\/api\/.*\/route\.ts$/.test(p))) {
  const src = read(f);
  if (!GUARD.test(src) && !LIMIT.test(src)) findings.routes.push(rel(f));
}

// 3. fetch() of outside addresses without safeFetch (server code only - not client components or the tour engine).
for (const f of files) {
  const src = read(f);
  if (/^\s*["']use client["']/m.test(src.split("\n").slice(0, 3).join("\n"))) continue;
  if (!/src\/(lib|app\/api)\//.test(f) || /safe-fetch\.ts$/.test(f)) continue;
  src.split("\n").forEach((line, i) => {
    if (/(^|[^\w.])fetch\(/.test(line) && !/safeFetch|\/\/\s*fetch/.test(line)) findings.fetches.push(`${rel(f)}:${i + 1}`);
  });
}

// 4. Secrets (the value is never printed - only where it is).
const SECRET = [
  ["Anthropic key", /sk-ant-[A-Za-z0-9_-]{20,}/],
  ["OpenAI-style key", /\bsk-[A-Za-z0-9]{32,}\b/],
  ["AWS key", /\bAKIA[0-9A-Z]{16}\b/],
  ["GitHub token", /\b(ghp|gho|ghs|github_pat)_[A-Za-z0-9_]{20,}/],
  ["Slack token", /\bxox[abpors]-[A-Za-z0-9-]{10,}/],
  ["Private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["Resend key", /\bre_[A-Za-z0-9]{20,}\b/],
  ["Webhook secret", /\bwhsec_[A-Za-z0-9]{20,}/],
  ["Password in a database address", /postgres(ql)?:\/\/[^:\s"'`]+:[^@\s"'`]{6,}@(?!localhost|127\.0\.0\.1|host\b)/],
];
const tracked = execSync("git ls-files", { cwd: ROOT, encoding: "utf8" })
  .split("\n")
  .filter((p) => p && !p.startsWith("public/matterport/") && !/\.(png|jpe?g|webp|gif|mp4|webm|pdf|woff2?|ico|glb|wasm|lock)$/.test(p) && p !== "package-lock.json");
for (const p of tracked) {
  let src;
  try {
    src = readFileSync(join(ROOT, p), "utf8");
  } catch {
    continue;
  }
  for (const [kind, re] of SECRET) {
    const lines = src.split("\n");
    lines.forEach((line, i) => re.test(line) && findings.secrets.push(`${p}:${i + 1} (${kind})`));
  }
}

// 6. Raw SQL with ${...} - fine when it's a constant from the code, a hole when it's user input. Listed for review.
for (const f of files) {
  const src = read(f);
  for (const m of src.matchAll(/\$(queryRawUnsafe|executeRawUnsafe)\s*(<[^>]*>)?\s*\(\s*`([^`]*)`/g)) {
    const vars = [...m[3].matchAll(/\$\{([^}]+)\}/g)].map((v) => v[1].trim());
    if (vars.length) findings.sql.push(`${rel(f)}:${src.slice(0, m.index).split("\n").length} [${[...new Set(vars)].join(", ")}]`);
  }
}

// 5. Packages.
try {
  const out = execSync("npm audit --omit=dev --json", { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  collectAudit(out);
} catch (err) {
  // npm audit exits 1 when it finds something - the report is still on stdout.
  if (err.stdout) collectAudit(err.stdout);
  else findings.audit.push("(npm audit kunne ikke køre)");
}
function collectAudit(out) {
  const j = JSON.parse(out);
  for (const [name, v] of Object.entries(j.vulnerabilities ?? {})) {
    if (v.severity !== "high" && v.severity !== "critical") continue;
    const fix = v.fixAvailable === true ? "npm audit fix" : v.fixAvailable ? `${v.fixAvailable.name}@${v.fixAvailable.version}${v.fixAvailable.isSemVerMajor ? " (major)" : ""}` : "ingen rettelse endnu";
    const why = (v.via ?? []).map((x) => (typeof x === "string" ? x : x.title)).filter(Boolean).slice(0, 2).join("; ");
    findings.audit.push(`${name} (${v.severity}): ${why} - ${fix}`);
  }
}

// Compare with the reviewed baseline.
const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : {};
const fresh = {};
for (const [k, list] of Object.entries(findings)) {
  const known = new Set(baseline[k] ?? []);
  // Line numbers move - compare fetch/secret/sql spots by file + kind, not by line.
  const key = (s) => (k === "fetches" ? s.replace(/:\d+$/, "") : k === "secrets" || k === "sql" ? s.replace(/:\d+/, "") : s);
  const knownKeys = new Set([...known].map(key));
  fresh[k] = k === "audit" || k === "secrets" ? list : list.filter((s) => !knownKeys.has(key(s)));
}

if (UPDATE) {
  const { audit, secrets, ...keep } = findings;
  writeFileSync(BASELINE, JSON.stringify(keep, null, 2) + "\n");
  console.log(`Baseline opdateret (${Object.values(keep).flat().length} kendte, gennemgåede steder). Hemmeligheder og pakker kommer aldrig i baseline.`);
  process.exit(0);
}

const TITLES = {
  secrets: "Hemmeligheder i koden",
  audit: "Sårbare pakker (high/critical)",
  actions: "Server actions uden login-tjek",
  routes: "API-routes uden login-tjek eller rate limit",
  fetches: "fetch() uden safeFetch (SSRF)",
  sql: "Rå SQL med ${...} (tjek at det ikke er brugerinput)",
};
const lines = [`# Ugentligt sikkerhedstjek, ${new Date().toISOString().slice(0, 10)}`, ""];
let total = 0;
for (const k of Object.keys(TITLES)) {
  const list = fresh[k];
  total += list.length;
  lines.push(`## ${TITLES[k]}: ${list.length ? `${list.length} nye` : "intet nyt"}`);
  for (const s of list) lines.push(`- ${s}`);
  lines.push("");
}
lines.push(total ? `**${total} ting skal ses på.**` : "**Intet nyt at se på.**");
const report = lines.join("\n");
console.log(report);
if (OUT) writeFileSync(OUT, report + "\n");
process.exit(total ? 1 : 0);
