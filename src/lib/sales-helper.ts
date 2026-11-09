import "server-only";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { onlineTours } from "@/lib/online-tours";

/*
 * Generator → Spørg: what nextviewAI knows when a seller asks about the
 * system, the tour or how to meet an objection - our own words only: the new
 * site's pages (what we sell, prices, FAQ), the tour drejebog, every
 * /nyheder post (what Arpo and the tour can do), the seller handbook
 * (lib/sales-handbook.md: how a tour is made, Matterport, the customer
 * portal, the sale in Arpo), the customer portal's own words, the customers
 * who are online (examples by industry) and the team's own saved answers.
 */

export const SALES_KINDS = { spoergsmaal: "Spørgsmål", indvending: "Indvending" } as const;
export type SalesKind = keyof typeof SALES_KINDS;

/** The site's pages that say what we sell - the branch pages more briefly. */
const MAIN_PAGES = ["index", "virtuel-rundvisning", "priser", "droneoptagelser", "cases", "om-os", "case-stidsholt-efterskole"];
const MAIN_CHARS = 9000;
const BRANCH_CHARS = 3000;

/** A page's own text: what's in <main>, without scripts, styles and markup. */
function pageText(html: string): string {
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ?? html;
  return main
    .replace(/<(script|style|svg)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|li|h[1-6]|summary|details|div|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

async function sitePages(): Promise<string> {
  const dir = path.join(process.cwd(), "site-web");
  const files = (await readdir(dir).catch(() => [] as string[])).filter((f) => /^[a-z0-9-]+\.html$/.test(f) && !f.startsWith("ringet-op") && f !== "sitemap.html" && f !== "kontakt.html");
  const order = (f: string) => (MAIN_PAGES.includes(f.replace(/\.html$/, "")) ? MAIN_PAGES.indexOf(f.replace(/\.html$/, "")) : 100);
  const parts: string[] = [];
  for (const f of files.sort((a, b) => order(a) - order(b) || a.localeCompare(b))) {
    const html = await readFile(path.join(dir, f), "utf8").catch(() => "");
    const text = pageText(html).slice(0, order(f) < 100 ? MAIN_CHARS : BRANCH_CHARS);
    if (text) parts.push(`<side navn="${f}">\n${text}\n</side>`);
  }
  return parts.join("\n\n");
}

async function newsPosts(): Promise<string> {
  const posts = await prisma.newsPost.findMany({ orderBy: { createdAt: "desc" }, take: 120, select: { title: true, body: true, createdAt: true } });
  let out = "";
  for (const p of posts) {
    const one = `<nyhed dato="${p.createdAt.toISOString().slice(0, 10)}" titel="${p.title.replace(/"/g, "'")}">\n${p.body.slice(0, 1500)}\n</nyhed>\n`;
    if (out.length + one.length > 45_000) break;
    out += one;
  }
  return out;
}

async function customers(): Promise<string> {
  const tours = await onlineTours().catch(() => []);
  return tours.map((t) => `- ${t.customer} (${t.industry}${t.city ? `, ${t.city}` : ""}): ${t.url}`).join("\n");
}

/** The customer portal's Danish words (src/app/kunde/text.ts, the "da" part). */
async function portalWords(): Promise<string> {
  const src = await readFile(path.join(process.cwd(), "src/app/kunde/text.ts"), "utf8").catch(() => "");
  const da = src.match(/\n\s*da: \{([\s\S]*?)\n\s*en: \{/)?.[1] ?? "";
  return da.slice(0, 14_000);
}

let cache: { at: number; text: string } | null = null;

/** Everything nextviewAI may answer from (but the team's own answers) - put together at most every 10 minutes. */
export async function helperKnowledge(): Promise<string> {
  if (cache && Date.now() - cache.at < 10 * 60_000) return cache.text;
  const [handbook, portal, site, playbook, news, online] = await Promise.all([
    readFile(path.join(process.cwd(), "src/lib/sales-handbook.md"), "utf8").catch(() => ""),
    portalWords(),
    sitePages(),
    readFile(path.join(process.cwd(), "src/app/arpo/tour-lab/tours/PLAYBOOK.md"), "utf8").catch(() => ""),
    newsPosts(),
    customers(),
  ]);
  const text = [
    handbook && `<saelger-haandbog>\n${handbook.slice(0, 20_000)}\n</saelger-haandbog>`,
    portal && `<kundeportalens-tekster>\nDe ord, kunden ser i kundeportalen (/kunde), som de står i koden:\n${portal}\n</kundeportalens-tekster>`,
    `<hjemmesiden>\nDet nye nextview360.dk - hvad vi sælger, priser og svar på kundernes spørgsmål:\n${site}\n</hjemmesiden>`,
    playbook && `<tour-drejebog>\nSådan bygger vi en god tour:\n${playbook.slice(0, 20_000)}\n</tour-drejebog>`,
    news && `<nyheder>\nHvad der er bygget i Arpo og touren (nyeste først):\n${news}</nyheder>`,
    online && `<online-kunder>\nKunder, hvis tour er online (navn, branche, by, link) - brug dem som eksempler:\n${online}\n</online-kunder>`,
  ]
    .filter(Boolean)
    .join("\n\n");
  cache = { at: Date.now(), text };
  return text;
}

/** The team's saved answers, as nextviewAI gets them. */
export async function teamAnswers(): Promise<string> {
  const rows = await prisma.salesAnswer.findMany({ orderBy: { updatedAt: "desc" }, take: 200, select: { kind: true, question: true, answer: true } });
  let out = "";
  for (const r of rows) {
    const one = `<svar type="${SALES_KINDS[r.kind as SalesKind] ?? r.kind}">\nSpørgsmål: ${r.question.slice(0, 500)}\nSvar: ${r.answer.slice(0, 2500)}\n</svar>\n`;
    if (out.length + one.length > 30_000) break;
    out += one;
  }
  return out;
}
