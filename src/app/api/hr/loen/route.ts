import { NextResponse } from "next/server";
import { getTeamUser } from "@/lib/auth";
import { isHrAdmin } from "@/lib/hr-access";
import { launchHeadlessChromium } from "@/lib/headless-chromium";
import { ABSENCE_NAMES } from "@/lib/hr";
import { monthBounds, payrollCsv, payrollMonth, type PayrollRow } from "@/lib/hr-payroll";

/** Lønsedler-grundlag for a month as CSV or PDF - only an admin (it holds everybody's pay). */
export const dynamic = "force-dynamic";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const kr = (n: number | null) => (n == null ? "" : n.toLocaleString("da-DK", { maximumFractionDigits: 2 }));
const MONTHS = ["januar", "februar", "marts", "april", "maj", "juni", "juli", "august", "september", "oktober", "november", "december"];

function html(ym: string, rows: PayrollRow[]) {
  const label = `${MONTHS[Number(ym.slice(5)) - 1]} ${ym.slice(0, 4)}`;
  const kinds = Object.keys(ABSENCE_NAMES) as (keyof typeof ABSENCE_NAMES)[];
  const body = rows
    .map((r) => {
      const absence = kinds.filter((k) => r.absence[k]).map((k) => `${ABSENCE_NAMES[k]} ${kr(r.absence[k])} d`).join(", ") || "-";
      return `<tr><td><b>${esc(r.name)}</b><br><span>${esc(r.kind)}${r.payrollNumber ? `, nr. ${esc(r.payrollNumber)}` : ""}</span></td><td>${esc(r.model)}${r.monthlyKr != null ? `<br>${kr(r.monthlyKr)} kr./md.` : ""}${r.hourlyKr != null ? `<br>${kr(r.hourlyKr)} kr./t` : ""}${r.pension ? `<br><span>Pension ${esc(r.pension)}</span>` : ""}</td><td class="n">${r.workedHours == null ? "-" : kr(r.workedHours)}<br><span>norm ${kr(r.normHours)}</span></td><td>${esc(absence)}</td><td class="n">${r.commissionKr ? `${kr(r.commissionKr)} kr.<br><span>via ${esc(r.commissionHow)}</span>` : "-"}</td><td class="n">${r.tripKr ? `${kr(r.tripKr)} kr.<br><span>${kr(r.tripKm)} km</span>` : "-"}</td><td>${esc(r.note)}</td></tr>`;
    })
    .join("");
  return `<!doctype html><html lang="da"><head><meta charset="utf-8"><style>
  body{font-family:Helvetica,Arial,sans-serif;color:#111;margin:32px;font-size:11px}
  h1{font-size:20px;margin:0}p.sub{color:#555;margin:4px 0 18px}
  table{width:100%;border-collapse:collapse}th{text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.04em;color:#555;border-bottom:1px solid #ccc;padding:6px}
  td{border-bottom:1px solid #eee;padding:7px 6px;vertical-align:top}td.n{text-align:right;white-space:nowrap}span{color:#666}
  </style></head><body><h1>Lønsedler-grundlag, ${esc(label)}</h1><p class="sub">Nextview360 ApS. Fra Arpo HR ${new Date().toLocaleDateString("da-DK")}. Skat, AM-bidrag, ATP og feriepenge beregnes i lønsystemet.</p>
  <table><thead><tr><th>Medarbejder</th><th>Løn</th><th style="text-align:right">Timer</th><th>Fravær</th><th style="text-align:right">Provision</th><th style="text-align:right">Kørepenge</th><th>Bemærkning</th></tr></thead><tbody>${body}</tbody></table></body></html>`;
}

export async function GET(request: Request) {
  const user = await getTeamUser();
  if (!user || !isHrAdmin(user)) return NextResponse.json({ error: "Kun admin." }, { status: 403 });
  const url = new URL(request.url);
  const ym = url.searchParams.get("maaned") ?? "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ym)) return NextResponse.json({ error: "Vælg en måned." }, { status: 400 });
  monthBounds(ym);
  const rows = await payrollMonth(ym);
  const headers = { "Cache-Control": "private, no-store" };
  if (url.searchParams.get("format") === "pdf") {
    const browser = await launchHeadlessChromium();
    try {
      const page = await browser.newPage();
      await page.setJavaScriptEnabled(false);
      await page.setContent(html(ym, rows), { waitUntil: "load" });
      const pdf = await page.pdf({ format: "A4", landscape: true, printBackground: true, margin: { top: "12mm", bottom: "12mm", left: "10mm", right: "10mm" } });
      return new NextResponse(Buffer.from(pdf), { headers: { ...headers, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="loensedler-grundlag-${ym}.pdf"` } });
    } finally {
      await browser.close();
    }
  }
  return new NextResponse(payrollCsv(rows), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="loensedler-grundlag-${ym}.csv"` } });
}
