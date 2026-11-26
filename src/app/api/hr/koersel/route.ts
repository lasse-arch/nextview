import { NextResponse } from "next/server";
import { getTeamUser } from "@/lib/auth";
import { teamCan } from "@/lib/team-roles";
import { prisma } from "@/lib/db";
import { reachOf } from "@/lib/hr-access";
import { launchHeadlessChromium } from "@/lib/headless-chromium";
import { mileageAccount } from "@/lib/hr-mileage";

/** The kørselsregnskab for a month as a PDF - for the employee themselves or an admin. */
export const dynamic = "force-dynamic";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const n = (v: number, d = 2) => v.toLocaleString("da-DK", { minimumFractionDigits: d, maximumFractionDigits: d });
const MONTHS = ["januar", "februar", "marts", "april", "maj", "juni", "juli", "august", "september", "oktober", "november", "december"];

export async function GET(request: Request) {
  const user = await getTeamUser();
  if (!user || !teamCan(user, "self")) return NextResponse.json({ error: "Log ind." }, { status: 403 });
  const url = new URL(request.url);
  const id = url.searchParams.get("medarbejder") ?? "";
  const ym = url.searchParams.get("maaned") ?? "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ym)) return NextResponse.json({ error: "Vælg en måned." }, { status: 400 });
  const e = await prisma.employee.findUnique({ where: { id }, select: { id: true, userId: true, managerId: true } });
  const reach = e ? reachOf(user, e) : null;
  // Only the employee and an admin (a leader approves trips, but the account with the home address isn't theirs).
  if (!e || !reach || reach === "leader") return NextResponse.json({ error: "Ikke adgang." }, { status: 403 });
  const a = await mileageAccount(e.id, ym);
  const rows = a.trips
    .map((t) => `<tr><td>${esc(t.date.split("-").reverse().join("."))}</td><td>${esc(t.kind)}<br><span>${esc(t.purpose)}</span></td><td>${esc(t.from)}<br><span>til ${esc(t.to)}</span></td><td>${esc(t.plate)}</td><td class="n">${n(t.km, 1)}</td><td class="n">${n(t.kr)}</td></tr>`)
    .join("");
  const html = `<!doctype html><html lang="da"><head><meta charset="utf-8"><style>
  body{font-family:Helvetica,Arial,sans-serif;color:#111;margin:36px;font-size:11px}h1{font-size:20px;margin:0}
  .meta{margin:10px 0 18px;line-height:1.6}table{width:100%;border-collapse:collapse}th{text-align:left;font-size:9px;text-transform:uppercase;color:#555;border-bottom:1px solid #bbb;padding:6px}
  td{border-bottom:1px solid #eee;padding:7px 6px;vertical-align:top}td.n,th.n{text-align:right;white-space:nowrap}span{color:#666}tfoot td{font-weight:bold;border-top:1px solid #bbb}
  p.small{color:#555;margin-top:16px;line-height:1.5}</style></head><body>
  <h1>Kørselsregnskab, ${esc(MONTHS[Number(ym.slice(5)) - 1])} ${ym.slice(0, 4)}</h1>
  <div class="meta">Medarbejder: <b>${esc(a.name)}</b>${a.payrollNumber ? ` (nr. ${esc(a.payrollNumber)})` : ""}<br>Adresse: ${esc(a.address || "ikke oplyst")}<br>Arbejdsgiver: Nextview360 ApS, CVR 46452445, Danmarksgade 23, st., 9000 Aalborg<br>
  Satser ${ym.slice(0, 4)}: ${n(a.rate.upTo20000)} kr. pr. km op til 20.000 km om året, ${n(a.rate.above)} kr. derover. Kørt tidligere i året: ${n(a.kmBefore, 1)} km.</div>
  <table><thead><tr><th>Dato</th><th>Formål</th><th>Rute</th><th>Bil</th><th class="n">Km</th><th class="n">Kr.</th></tr></thead><tbody>${rows || `<tr><td colspan="6">Ingen godkendte ture i måneden.</td></tr>`}</tbody>
  <tfoot><tr><td colspan="4">I alt</td><td class="n">${n(a.km, 1)}</td><td class="n">${n(a.kr)}</td></tr></tfoot></table>
  <p class="small">Skattefri kørselsgodtgørelse for kørsel i egen bil i arbejdets interesse. CPR-nummer fremgår af lønsystemet. Godkendt af Nextview360.</p></body></html>`;
  const browser = await launchHeadlessChromium();
  try {
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({ format: "A4", printBackground: true, margin: { top: "12mm", bottom: "12mm", left: "10mm", right: "10mm" } });
    return new NextResponse(Buffer.from(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="koerselsregnskab-${ym}.pdf"`, "Cache-Control": "private, no-store" } });
  } finally {
    await browser.close();
  }
}
