import fs from "node:fs";
import path from "node:path";
import type { ExploreTourStats } from "@/lib/explore-nextview360";

const DANISH_MONTHS = [
  "januar", "februar", "marts", "april", "maj", "juni",
  "juli", "august", "september", "oktober", "november", "december",
];

function toDataUri(buffer: Buffer, mime: string): string {
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

function logoDataUri(): string {
  const filePath = path.join(process.cwd(), "public", "logo.png");
  return toDataUri(fs.readFileSync(filePath), "image/png");
}

function fmtInt(n: number): string {
  return new Intl.NumberFormat("da-DK").format(n);
}

function periodCard(label: string, stats: ExploreTourStats["last7Days"], highlight = false): string {
  return `
    <div class="period-card${highlight ? " highlight" : ""}">
      <div class="period-label">${label}</div>
      <div class="visits">${fmtInt(stats.visits)}</div>
      <div class="submetrics">
        <div><span>${fmtInt(stats.sessions)}</span> sessions</div>
        <div><span>${fmtInt(stats.users)}</span> brugere</div>
        <div><span>${stats.avgTime}</span> gns. tid</div>
      </div>
    </div>`;
}

export type CustomerReportData = {
  customerName: string;
  monthLabel: string;
  coverImage: Buffer;
  heatmapImage: Buffer | null;
  stats: ExploreTourStats;
};

/** "september 2026" for the current date, matching Danish lowercase month convention. */
export function currentMonthLabel(date: Date = new Date()): string {
  return `${DANISH_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

const TIPS = [
  {
    title: "Sæt QR-koder på jeres fysiske materiale",
    body: "Læg en QR-kode på skilte, foldere, visitkort og på selve stedet — så går folk direkte ind i touren fra den virkelige verden.",
  },
  {
    title: "Lav et nyhedsbrev med touren",
    body: "Inkludér den virtuelle tour i jeres næste nyhedsbrev, så I når abonnenterne direkte.",
  },
  {
    title: "Vis touren på en skærm hos jer",
    body: "Sæt touren på en skærm i receptionen eller ved indgangen, så besøgende også oplever den, når de er hos jer fysisk.",
  },
  {
    title: "Del touren i jeres dialog med kunder",
    body: "Send linket direkte, når I er i kontakt — så kan folk i ro og mag opleve stedet hjemmefra.",
  },
  {
    title: "Gør linket nemt at finde",
    body: "Sæt linket til touren tydeligt på forsiden af jeres hjemmeside og på jeres sociale profiler — alle besøg kommer ind via det ene link.",
  },
];

/**
 * Builds the visitor-stats report as a 3-4 page HTML deck (rendered to PDF by
 * customer-report-pdf.ts): cover with the tour's real cover photo, a stats
 * page with the 4 period cards, an optional heatmap page, and a fixed "5 gode
 * råd" tips page. Landscape 1280x720 - a screen-sized report, not a printed
 * document.
 */
export function buildCustomerReportHtml(data: CustomerReportData): string {
  const logo = logoDataUri();
  const cover = toDataUri(data.coverImage, "image/png");
  const heatmap = data.heatmapImage ? toDataUri(data.heatmapImage, "image/png") : null;

  return `<!DOCTYPE html>
<html lang="da">
<head>
<meta charset="utf-8">
<style>
  @page { margin: 0; size: 1280px 720px; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0; width: 1280px;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Arial, sans-serif;
    color: #1d1d1f;
  }
  .page { width: 1280px; height: 720px; position: relative; overflow: hidden; page-break-after: always; background: #fff; }
  .page:last-child { page-break-after: auto; }

  .cover img.bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .cover .scrim { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.15) 45%, rgba(0,0,0,0.78) 100%); }
  .cover .content { position: absolute; left: 72px; right: 72px; bottom: 64px; color: #fff; }
  .cover .eyebrow { font-size: 17px; font-weight: 600; letter-spacing: 0.02em; opacity: 0.92; margin: 0 0 14px 0; }
  .cover h1 { font-size: 54px; font-weight: 700; letter-spacing: -0.02em; margin: 0 0 10px 0; line-height: 1.1; }
  .cover .subtitle { font-size: 20px; font-weight: 400; opacity: 0.88; margin: 0; }

  .content-page { padding: 56px 72px 48px 72px; }
  .content-page .top-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 36px; }
  .content-page .top-row .brand { font-size: 15px; font-weight: 600; color: #86868b; letter-spacing: 0.01em; }
  .content-page h2 { font-size: 34px; font-weight: 700; letter-spacing: -0.01em; margin: 0 0 22px 0; color: #1d1d1f; }

  .period-grid { display: flex; gap: 20px; margin-bottom: 40px; }
  .period-card { flex: 1; background: #f5f5f7; border-radius: 20px; padding: 26px 24px; }
  .period-card.highlight { background: linear-gradient(160deg, #eef4ff 0%, #e4edff 100%); }
  .period-card .period-label { font-size: 12px; font-weight: 700; letter-spacing: 0.08em; color: #86868b; text-transform: uppercase; }
  .period-card.highlight .period-label { color: #2f5fd6; }
  .period-card .visits { font-size: 46px; font-weight: 700; letter-spacing: -0.02em; color: #1d1d1f; margin: 10px 0 18px 0; }
  .period-card.highlight .visits { color: #1d3f9e; }
  .period-card .submetrics { border-top: 1px solid rgba(0,0,0,0.08); padding-top: 14px; font-size: 14px; color: #48484a; display: flex; flex-direction: column; gap: 7px; }
  .period-card .submetrics span { font-weight: 600; color: #1d1d1f; }

  .footnote { font-size: 13px; color: #86868b; font-style: italic; margin-top: 8px; }
  .page-footer { position: absolute; left: 72px; bottom: 40px; }
  .page-footer img { height: 26px; }

  .heatmap-wrap { display: flex; align-items: center; justify-content: center; height: 500px; background: #f5f5f7; border-radius: 20px; overflow: hidden; }
  .heatmap-wrap img { max-width: 100%; max-height: 100%; object-fit: contain; }

  .tips { display: flex; flex-direction: column; gap: 16px; }
  .tip { display: flex; align-items: flex-start; gap: 20px; background: #f5f5f7; border-radius: 18px; padding: 20px 26px; }
  .tip .num { flex-shrink: 0; width: 36px; height: 36px; border-radius: 50%; background: #1d3f9e; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 700; }
  .tip .txt h3 { margin: 0 0 4px 0; font-size: 17px; font-weight: 700; color: #1d1d1f; }
  .tip .txt p { margin: 0; font-size: 14.5px; color: #48484a; line-height: 1.5; }
</style>
</head>
<body>

  <div class="page cover">
    <img class="bg" src="${cover}">
    <div class="scrim"></div>
    <div class="content">
      <p class="eyebrow">Besøgsrapport for jeres virtuelle tour</p>
      <h1>${escapeHtml(data.customerName)}</h1>
      <p class="subtitle">${escapeHtml(data.monthLabel)}</p>
    </div>
  </div>

  <div class="page content-page">
    <div class="top-row"><div></div><div class="brand">${escapeHtml(data.customerName)}</div></div>
    <h2>Visninger</h2>
    <div class="period-grid">
      ${periodCard("Seneste 7 dage", data.stats.last7Days)}
      ${periodCard("Seneste 30 dage", data.stats.last30Days)}
      ${periodCard("Seneste 90 dage", data.stats.last90Days)}
      ${periodCard(`Siden ${data.stats.sinceLabel}`, data.stats.sinceStats, true)}
    </div>
    <p class="footnote">Tallene er udelukkende baseret på visninger via explore.nextview360.dk og bør derfor afspejle reelle visninger fra interesserede kunder.</p>
    <div class="page-footer"><img src="${logo}"></div>
  </div>

  ${
    heatmap
      ? `<div class="page content-page">
    <div class="top-row"><div></div><div class="brand">${escapeHtml(data.customerName)}</div></div>
    <h2>Hvor besøgende bruger mest tid</h2>
    <div class="heatmap-wrap"><img src="${heatmap}"></div>
    <div class="page-footer"><img src="${logo}"></div>
  </div>`
      : ""
  }

  <div class="page content-page">
    <h2>5 gode råd til flere besøgende</h2>
    <div class="tips">
      ${TIPS.map(
        (tip, i) => `
      <div class="tip">
        <div class="num">${i + 1}</div>
        <div class="txt"><h3>${escapeHtml(tip.title)}</h3><p>${escapeHtml(tip.body)}</p></div>
      </div>`
      ).join("")}
    </div>
    <div class="page-footer"><img src="${logo}"></div>
  </div>

</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
