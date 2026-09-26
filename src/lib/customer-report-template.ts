import fs from "node:fs";
import path from "node:path";
import type { ExploreTourStats } from "@/lib/explore-nextview360";
import type { ReportLanguage } from "@prisma/client";

const DANISH_MONTHS = [
  "januar", "februar", "marts", "april", "maj", "juni",
  "juli", "august", "september", "oktober", "november", "december",
];

const ENGLISH_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function toDataUri(buffer: Buffer, mime: string): string {
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

function logoDataUri(): string {
  const filePath = path.join(process.cwd(), "public", "logo.png");
  return toDataUri(fs.readFileSync(filePath), "image/png");
}

function fmtInt(n: number, language: ReportLanguage): string {
  return new Intl.NumberFormat(language === "EN" ? "en-US" : "da-DK").format(n);
}

const TEXT: Record<ReportLanguage, {
  eyebrow: string;
  viewsHeading: string;
  last7: string;
  last30: string;
  last90: string;
  since: (label: string) => string;
  sessions: string;
  users: string;
  avgTime: string;
  footnote: string;
  tipsHeading: string;
  tips: { title: string; body: string }[];
}> = {
  DA: {
    eyebrow: "Besøgsrapport for jeres virtuelle tour",
    viewsHeading: "Visninger",
    last7: "Seneste 7 dage",
    last30: "Seneste 30 dage",
    last90: "Seneste 90 dage",
    since: (label) => `Siden ${label}`,
    sessions: "sessions",
    users: "brugere",
    avgTime: "gns. tid",
    footnote:
      "Tallene er udelukkende baseret på visninger via explore.nextview360.dk og bør derfor afspejle reelle visninger fra interesserede kunder.",
    tipsHeading: "5 gode råd til flere besøgende",
    tips: [
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
    ],
  },
  EN: {
    eyebrow: "Visitor report for your virtual tour",
    viewsHeading: "Views",
    last7: "Last 7 days",
    last30: "Last 30 days",
    last90: "Last 90 days",
    since: (label) => `Since ${label}`,
    sessions: "sessions",
    users: "users",
    avgTime: "avg. time",
    footnote:
      "These figures are based solely on views via explore.nextview360.dk and should therefore reflect genuine views from interested customers.",
    tipsHeading: "5 tips to get more visitors",
    tips: [
      {
        title: "Add QR codes to your physical materials",
        body: "Put a QR code on signs, brochures, business cards and at the location itself — so people can jump straight into the tour from the real world.",
      },
      {
        title: "Feature the tour in a newsletter",
        body: "Include the virtual tour in your next newsletter so your subscribers see it directly.",
      },
      {
        title: "Show the tour on a screen on-site",
        body: "Put the tour on a screen in reception or by the entrance, so visitors also experience it while they're physically there.",
      },
      {
        title: "Share the tour in customer conversations",
        body: "Send the link directly whenever you're in touch - so people can explore the place at their own pace from home.",
      },
      {
        title: "Make the link easy to find",
        body: "Put the link to the tour prominently on your website's front page and on your social profiles - every visit comes in through that one link.",
      },
    ],
  },
};

function periodCard(label: string, stats: ExploreTourStats["last7Days"], language: ReportLanguage, highlight = false): string {
  const t = TEXT[language];
  return `
    <div class="period-card${highlight ? " highlight" : ""}">
      <div class="period-label">${label}</div>
      <div class="visits">${fmtInt(stats.visits, language)}</div>
      <div class="submetrics">
        <div><span>${fmtInt(stats.sessions, language)}</span> ${t.sessions}</div>
        <div><span>${fmtInt(stats.users, language)}</span> ${t.users}</div>
        <div><span>${stats.avgTime}</span> ${t.avgTime}</div>
      </div>
    </div>`;
}

export type CustomerReportData = {
  customerName: string;
  monthLabel: string;
  coverImage: Buffer;
  stats: ExploreTourStats;
  language: ReportLanguage;
};

/** "september 2026" / "September 2026" for the current date, matching each language's month-name convention. */
export function currentMonthLabel(language: ReportLanguage, date: Date = new Date()): string {
  const months = language === "EN" ? ENGLISH_MONTHS : DANISH_MONTHS;
  return `${months[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * Builds the visitor-stats report as a 3-page HTML deck (rendered to PDF by
 * customer-report-pdf.ts): cover with the tour's real cover photo, a stats
 * page with the 4 period cards, and a fixed "5 gode råd" tips page. Landscape
 * 1280x720 - a screen-sized report, not a printed document.
 */
export function buildCustomerReportHtml(data: CustomerReportData): string {
  const logo = logoDataUri();
  const cover = toDataUri(data.coverImage, "image/png");
  const t = TEXT[data.language];
  const htmlLang = data.language === "EN" ? "en" : "da";

  return `<!DOCTYPE html>
<html lang="${htmlLang}">
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
      <p class="eyebrow">${t.eyebrow}</p>
      <h1>${escapeHtml(data.customerName)}</h1>
      <p class="subtitle">${escapeHtml(data.monthLabel)}</p>
    </div>
  </div>

  <div class="page content-page">
    <div class="top-row"><div></div><div class="brand">${escapeHtml(data.customerName)}</div></div>
    <h2>${t.viewsHeading}</h2>
    <div class="period-grid">
      ${periodCard(t.last7, data.stats.last7Days, data.language)}
      ${periodCard(t.last30, data.stats.last30Days, data.language)}
      ${periodCard(t.last90, data.stats.last90Days, data.language)}
      ${periodCard(t.since(data.stats.sinceLabel), data.stats.sinceStats, data.language, true)}
    </div>
    <p class="footnote">${t.footnote}</p>
    <div class="page-footer"><img src="${logo}"></div>
  </div>

  <div class="page content-page">
    <h2>${t.tipsHeading}</h2>
    <div class="tips">
      ${t.tips
        .map(
          (tip, i) => `
      <div class="tip">
        <div class="num">${i + 1}</div>
        <div class="txt"><h3>${escapeHtml(tip.title)}</h3><p>${escapeHtml(tip.body)}</p></div>
      </div>`
        )
        .join("")}
    </div>
    <div class="page-footer"><img src="${logo}"></div>
  </div>

</body>
</html>`;
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
