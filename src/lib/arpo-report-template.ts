import type { ReportLanguage } from "@prisma/client";
import type { TourStats } from "@/lib/tour-stats";
import { shown, type ReportShare } from "@/lib/tour-share";
import { escapeHtml } from "@/lib/customer-report-template";

/*
 * The statistics report from Arpo's own numbers - the same numbers as on the
 * customer's page (/kunde → Statistik), for the period the report covers (one,
 * two or three months). Written to show plainly what the tour does for them:
 * the headline first (how many came, how much time they spent with the place,
 * how many went on to book or get in touch, and how that compares with the
 * period before), then what they were most interested in, the tours side by
 * side when there are more, and what to do next. A landscape deck rendered to
 * PDF - and the same headline as a card in the e-mail itself, so the value is
 * seen without opening anything. Only what the tour shares with the customer.
 */

export type ArpoReportTour = { name: string; stats: TourStats; share: ReportShare };

export type ArpoReportData = {
  customerName: string;
  language: ReportLanguage;
  /** "1. aug. - 28. okt. 2026" */
  periodLabel: string;
  days: number;
  cover: Buffer | null;
  logo: string;
  total: TourStats;
  share: ReportShare;
  /** Visits in the period just before - null when there were none to compare with. */
  previousVisits: number | null;
  /** All the time visitors spent in the tours, in seconds (a tab left open counts at most 30 minutes). */
  totalSeconds: number;
  tours: ArpoReportTour[];
  /** The customer's page, where the numbers are always up to date ("https://nextview360.dk/kunde"). */
  portalUrl: string;
};

const TEXT = {
  DA: {
    eyebrow: "Jeres virtuelle tour",
    coverLine: (n: string) => `${n} besøg`,
    coverLeads: (n: string) => `${n} gik videre til booking eller kontakt`,
    headline: "Det har touren gjort for jer",
    visitsBig: "besøg i jeres tour",
    perDay: (n: string) => `ca. ${n} om dagen`,
    hours: "timer brugte de besøgende tilsammen i jeres tour",
    hoursSub: "tid med jeres sted - uden at nogen skulle vise rundt",
    minutes: "minutter brugte de besøgende tilsammen i jeres tour",
    leads: "gik videre til booking eller kontakt direkte fra touren",
    ofVisits: (p: string) => `${p} af besøgene`,
    engaged: "gik selv på opdagelse i touren",
    typical: "varer et typisk besøg",
    mobile: "så touren på mobilen",
    up: (p: string) => `${p} flere besøg end perioden før`,
    down: (p: string) => `${p} færre besøg end perioden før`,
    same: "lige så mange besøg som perioden før",
    perDayTitle: "Besøg pr. dag",
    perWeekTitle: "Besøg pr. uge",
    interest: "Det, de var mest interesserede i",
    topRoom: "Mest besøgte sted",
    topLong: "Her blev de længst",
    rooms: "Hvor de gik rundt",
    roomTime: "Hvor de blev længst",
    places: "Det, de valgte i menuen",
    opened: "Det, de åbnede i touren",
    went: "Det, de gik videre til",
    sources: "Hvor besøgene kom fra",
    free: "Ledige i touren",
    openedFree: "åbnede listen over ledige",
    bookedFree: "gik videre til booking af en bestemt",
    visitsWord: "besøg",
    tours: "Jeres tours side om side",
    tour: "Tour",
    colVisits: "Besøg",
    colEngaged: "Gik på opdagelse",
    colTypical: "Typisk besøg",
    colLeads: "Booking/kontakt",
    phone: "Ringede",
    email: "Skrev en mail",
    direct: "Direkte (link/QR)",
    sec: "sek",
    none: "Der har ikke været besøg i perioden endnu. Del linket til touren - forslagene på sidste side er et godt sted at starte.",
    nextTitle: "Sådan får I endnu mere ud af touren",
    tips: [
      ["Sæt touren på hjemmesiden", "Under \"På hjemmesiden\" på jeres side ligger koden til hele touren og til hvert sted i den."],
      ["Link direkte til et sted", "Hvert sted har sit eget link - send det, når nogen spørger til netop det."],
      ["QR-koder i den virkelige verden", "Skilte, foldere og visitkort - folk går direkte ind i touren."],
      ["Del den i nyhedsbrev og på sociale medier", "Gerne med et billede fra touren."],
    ],
    always: "Tallene opdateres hele tiden",
    alwaysSub: "Se dem når som helst på jeres egen side - og vælg selv, hvor tit I får rapporten.",
    footer: "Nextview360 · Besøgsrapport",
    mailIntro: "Kort fortalt:",
    mailCta: "Se alle tal",
  },
  EN: {
    eyebrow: "Your virtual tour",
    coverLine: (n: string) => `${n} visits`,
    coverLeads: (n: string) => `${n} went on to booking or contact`,
    headline: "What the tour did for you",
    visitsBig: "visits to your tour",
    perDay: (n: string) => `about ${n} a day`,
    hours: "hours visitors spent in your tour in all",
    hoursSub: "time with your place - without anyone showing them around",
    minutes: "minutes visitors spent in your tour in all",
    leads: "went on to booking or contact right from the tour",
    ofVisits: (p: string) => `${p} of the visits`,
    engaged: "explored the tour on their own",
    typical: "is a typical visit",
    mobile: "saw the tour on a phone",
    up: (p: string) => `${p} more visits than the period before`,
    down: (p: string) => `${p} fewer visits than the period before`,
    same: "as many visits as the period before",
    perDayTitle: "Visits per day",
    perWeekTitle: "Visits per week",
    interest: "What they were most interested in",
    topRoom: "Most visited",
    topLong: "Where they stayed longest",
    rooms: "Where they went",
    roomTime: "Where they stayed longest",
    places: "What they picked in the menu",
    opened: "What they opened in the tour",
    went: "What they went on to",
    sources: "Where the visits came from",
    free: "Available in the tour",
    openedFree: "opened the list of available units",
    bookedFree: "went on to book a particular one",
    visitsWord: "visits",
    tours: "Your tours side by side",
    tour: "Tour",
    colVisits: "Visits",
    colEngaged: "Explored",
    colTypical: "Typical visit",
    colLeads: "Booking/contact",
    phone: "Called",
    email: "Sent an e-mail",
    direct: "Direct (link/QR)",
    sec: "sec",
    none: "There have been no visits in the period yet. Share the link to the tour - the ideas on the last page are a good place to start.",
    nextTitle: "How to get even more out of the tour",
    tips: [
      ["Put the tour on your website", "Under \"On your website\" on your page you'll find the code for the whole tour and each place in it."],
      ["Link straight to a place", "Every place has its own link - send it when someone asks about just that."],
      ["QR codes in the real world", "Signs, brochures and business cards - people go straight into the tour."],
      ["Share it in newsletters and on social media", "Ideally with a picture from the tour."],
    ],
    always: "The numbers are always up to date",
    alwaysSub: "See them any time on your own page - and choose how often you get this report.",
    footer: "Nextview360 · Visitor report",
    mailIntro: "In short:",
    mailCta: "See all the numbers",
  },
} as const;

type Words = (typeof TEXT)[ReportLanguage];

const INK = "#14213d";
const ACCENT = "#2f5fd6";

const STYLE = `
  @page { margin: 0; size: 1280px 720px; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; width: 1280px; font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Arial, sans-serif; color: ${INK}; }
  .page { width: 1280px; height: 720px; position: relative; overflow: hidden; page-break-after: always; background: #faf8f5; }
  .page:last-child { page-break-after: auto; }
  .num { font-variant-numeric: tabular-nums; }

  .cover { display: flex; background: ${INK}; }
  .cover .pic { position: absolute; inset: 0; }
  .cover .pic img { width: 100%; height: 100%; object-fit: cover; }
  .cover .pic::after { content: ""; position: absolute; inset: 0; background: linear-gradient(90deg, rgba(10,18,36,.92) 0%, rgba(10,18,36,.72) 42%, rgba(10,18,36,.05) 75%); }
  .cover .nopic { position: absolute; inset: 0; background: radial-gradient(circle at 85% 20%, #3c6cf0 0%, ${INK} 60%); }
  .cover .txt { position: relative; z-index: 1; padding: 64px 72px; display: flex; flex-direction: column; height: 100%; color: #fff; width: 680px; }
  .cover .logo { height: 30px; width: auto; align-self: flex-start; background: #fff; padding: 8px 12px; border-radius: 10px; box-sizing: content-box; }
  .cover .eyebrow { margin-top: auto; font-size: 16px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; opacity: .75; }
  .cover h1 { font-size: 56px; line-height: 1.05; letter-spacing: -.02em; margin: 10px 0 8px; }
  .cover .period { font-size: 19px; opacity: .8; }
  .cover .big { margin-top: 36px; display: flex; gap: 14px; flex-direction: column; }
  .cover .pill { align-self: flex-start; background: rgba(255,255,255,.14); border: 1px solid rgba(255,255,255,.22); border-radius: 999px; padding: 10px 20px; font-size: 19px; font-weight: 600; }

  .cp { padding: 50px 72px 0; }
  .cp .head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 26px; }
  .cp h2 { font-size: 36px; letter-spacing: -.015em; margin: 0; }
  .cp .meta { font-size: 14px; color: #7a7f8c; font-weight: 600; }
  .foot { position: absolute; left: 72px; right: 72px; bottom: 30px; display: flex; justify-content: space-between; align-items: center; font-size: 12.5px; color: #9a9ea8; }
  .foot img { height: 22px; }

  .hero { display: grid; grid-template-columns: 1.15fr 1fr; gap: 22px; }
  .card { background: #fff; border-radius: 24px; padding: 26px 28px; border: 1px solid #ece8e1; }
  .card.ink { background: ${INK}; color: #fff; border: 0; display: flex; flex-direction: column; overflow: hidden; }
  .card.ink .trend { align-self: flex-start; }
  .card .v { font-size: 76px; font-weight: 800; letter-spacing: -.035em; line-height: .95; }
  .card .l { font-size: 18px; margin-top: 10px; line-height: 1.35; font-weight: 600; }
  .card .s { font-size: 14px; margin-top: 6px; opacity: .7; }
  .trend { display: inline-flex; align-items: center; gap: 8px; margin-top: 18px; padding: 7px 14px; border-radius: 999px; font-size: 14px; font-weight: 700; }
  .trend.up { background: #e3f5e8; color: #17703a; }
  .trend.down { background: #f2f0ec; color: #6b6f78; }
  .card.ink .trend.up { background: rgba(80,200,120,.18); color: #8fe3a8; }
  .card.ink .trend.down { background: rgba(255,255,255,.12); color: #d6d9e0; }
  .stack { display: flex; flex-direction: column; gap: 22px; }
  .stack .card .v { font-size: 52px; }
  .facts { display: flex; gap: 22px; margin-top: 22px; }
  .fact { flex: 1; background: #fff; border-radius: 20px; padding: 18px 22px; border: 1px solid #ece8e1; }
  .fact .v { font-size: 32px; font-weight: 800; letter-spacing: -.02em; }
  .fact .l { font-size: 14px; color: #5b606b; margin-top: 4px; }

  .chart { background: #fff; border-radius: 24px; padding: 22px 28px 14px; border: 1px solid #ece8e1; }
  .chart .t { font-size: 15px; font-weight: 700; margin-bottom: 8px; }

  .top { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; margin-bottom: 22px; }
  .top .card .k { font-size: 13px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: ${ACCENT}; }
  .top .card.ink .k { color: #9db7ff; }
  .top .card .name { font-size: 34px; font-weight: 800; letter-spacing: -.02em; margin-top: 8px; line-height: 1.1; }
  .top .card .s { font-size: 16px; opacity: .75; margin-top: 6px; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 22px; }
  .blk { background: #fff; border-radius: 22px; padding: 20px 24px 14px; border: 1px solid #ece8e1; }
  .blk .t { font-size: 15px; font-weight: 700; margin-bottom: 12px; }
  .row { margin-bottom: 10px; }
  .row .n { display: flex; justify-content: space-between; gap: 12px; font-size: 14px; }
  .row .n span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .row .n span:last-child { color: #6b6f78; flex-shrink: 0; }
  .row .bar { height: 8px; border-radius: 4px; background: #f0ede7; margin-top: 5px; }
  .row .bar i { display: block; height: 100%; border-radius: 4px; background: ${ACCENT}; }
  .blk p { margin: 0 0 12px; font-size: 14.5px; line-height: 1.45; }

  table { width: 100%; border-collapse: separate; border-spacing: 0; background: #fff; border-radius: 22px; border: 1px solid #ece8e1; overflow: hidden; font-size: 16px; }
  th { text-align: left; font-size: 12px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; color: #8a8f99; padding: 16px 20px 12px; }
  td { padding: 15px 20px; border-top: 1px solid #f0ede7; }
  th.r, td.r { text-align: right; }
  td.name { font-weight: 700; max-width: 500px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  td.best { color: ${ACCENT}; font-weight: 800; }

  .next { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
  .tip { background: #fff; border-radius: 20px; padding: 20px 24px; border: 1px solid #ece8e1; display: flex; gap: 16px; }
  .tip .no { flex-shrink: 0; width: 34px; height: 34px; border-radius: 50%; background: ${ACCENT}; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; }
  .tip h3 { margin: 2px 0 4px; font-size: 17px; }
  .tip p { margin: 0; font-size: 14.5px; color: #5b606b; line-height: 1.45; }
  .always { margin-top: 22px; background: ${INK}; color: #fff; border-radius: 24px; padding: 26px 32px; display: flex; align-items: center; justify-content: space-between; gap: 24px; }
  .always h3 { margin: 0 0 4px; font-size: 24px; }
  .always p { margin: 0; font-size: 15px; opacity: .8; }
  .always .url { background: #fff; color: ${INK}; border-radius: 999px; padding: 12px 22px; font-weight: 800; font-size: 17px; white-space: nowrap; }
  .empty { background: #fff; border-radius: 24px; padding: 40px; border: 1px solid #ece8e1; font-size: 22px; line-height: 1.45; max-width: 900px; }
`;

const nf = (lang: ReportLanguage) => new Intl.NumberFormat(lang === "EN" ? "en-GB" : "da-DK");
const pct = (n: number) => `${Math.round(n * 100)} %`;
const duration = (s: number, t: Words) => (s < 60 ? `${s} ${t.sec}` : `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} ${t.sec}` : ""}`);
const labelOf = (l: string, t: Words) => (l === "phone" ? t.phone : l === "email" ? t.email : l === "direkte" ? t.direct : l);
const shownPortal = (url: string) => url.replace(/^https?:\/\/(www\.)?/, "");

/** The headline numbers - the same in the PDF and in the e-mail. */
export function headline(d: Pick<ArpoReportData, "total" | "share" | "previousVisits" | "totalSeconds" | "days">) {
  const s = d.total;
  const change = d.previousVisits && d.share.visits ? Math.round(((s.visits - d.previousVisits) / d.previousVisits) * 100) : null;
  return {
    visits: d.share.visits ? s.visits : null,
    perDay: d.share.visits && s.visits >= d.days ? Math.round(s.visits / d.days) : null,
    change,
    // In hours when there are enough of them to say it that way.
    hours: d.share.duration && d.totalSeconds >= 2 * 3600 ? Math.round(d.totalSeconds / 3600) : null,
    minutes: d.share.duration && d.totalSeconds >= 120 && d.totalSeconds < 2 * 3600 ? Math.round(d.totalSeconds / 60) : null,
    leads: shown(d.share.leads, s.leads) ? s.leads : null,
    engaged: d.share.engaged && s.engaged > 0 && s.visits ? s.engaged / s.visits : null,
    typical: d.share.duration && s.medianSeconds >= 5 ? s.medianSeconds : null,
    mobile: s.mobileShare > 0 ? s.mobileShare : null,
  };
}

function page(inner: string, d: ArpoReportData, t: Words, heading: string): string {
  return `
  <div class="page cp">
    <div class="head"><h2>${escapeHtml(heading)}</h2><div class="meta">${escapeHtml(d.customerName)} · ${escapeHtml(d.periodLabel)}</div></div>
    ${inner}
    <div class="foot"><img src="${d.logo}"><span>${escapeHtml(t.footer)} · ${escapeHtml(shownPortal(d.portalUrl))}</span></div>
  </div>`;
}

function trend(change: number | null, t: Words): string {
  if (change === null) return "";
  if (change === 0) return `<div class="trend down">= ${escapeHtml(t.same)}</div>`;
  return change > 0 ? `<div class="trend up">▲ ${escapeHtml(t.up(`${change} %`))}</div>` : `<div class="trend down">▼ ${escapeHtml(t.down(`${-change} %`))}</div>`;
}

/** Visits per day - per week when the period is longer than a month, so the bars stay readable. */
function chart(stats: TourStats, t: Words, lang: ReportLanguage, height: number): string {
  const days = stats.perDay;
  const weekly = days.length > 35;
  const buckets: { from: string; visits: number }[] = [];
  if (weekly) {
    // Whole weeks counted back from the last day, so the newest bar is a full week too.
    for (let end = days.length; end > 0; end -= 7) {
      const part = days.slice(Math.max(0, end - 7), end);
      buckets.unshift({ from: part[0].day, visits: part.reduce((n, x) => n + x.visits, 0) });
    }
  } else buckets.push(...days.map((x) => ({ from: x.day, visits: x.visits })));
  const W = 1136 - 56;
  const H = height;
  const top = Math.max(1, ...buckets.map((b) => b.visits));
  const slot = W / buckets.length;
  const bw = Math.max(4, Math.min(weekly ? 48 : 24, slot - 3));
  const date = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString(lang === "EN" ? "en-GB" : "da-DK", { day: "numeric", month: "short" });
  const hOf = (v: number) => (v ? Math.max(4, (v / top) * (H - 22)) : 0);
  const bars = buckets
    .map((b, i) => {
      const h = hOf(b.visits);
      const x = i * slot + (slot - bw) / 2;
      const y = H - h;
      // Rounded at the top, flat on the baseline.
      return h ? `<path d="M${x},${H} V${y + 4} Q${x},${y} ${x + 4},${y} H${x + bw - 4} Q${x + bw},${y} ${x + bw},${y + 4} V${H} Z" fill="${ACCENT}"/>` : "";
    })
    .join("");
  const peak = buckets.reduce((a, b, i) => (b.visits > buckets[a].visits ? i : a), 0);
  const ticks = [0, Math.floor((buckets.length - 1) / 2), buckets.length - 1]
    .filter((v, i, a) => a.indexOf(v) === i)
    .map((i, k, a) => `<text x="${i * slot + slot / 2}" y="${H + 19}" font-size="12" fill="#8a8f99" text-anchor="${a.length > 1 && k === 0 ? "start" : a.length > 1 && k === a.length - 1 ? "end" : "middle"}">${date(buckets[i].from)}</text>`)
    .join("");
  return `
  <div class="chart">
    <svg width="${W}" height="${H + 24}" viewBox="0 0 ${W} ${H + 24}">
      <line x1="0" y1="${H}" x2="${W}" y2="${H}" stroke="#e2ded6" stroke-width="1"/>
      ${bars}
      ${buckets[peak].visits ? `<text x="${peak * slot + slot / 2}" y="${H - hOf(buckets[peak].visits) - 7}" font-size="12.5" font-weight="700" fill="${INK}" text-anchor="middle">${nf(lang).format(buckets[peak].visits)}</text>` : ""}
      ${ticks}
    </svg>
  </div>`;
}

function ranked(title: string, rows: { label: string; count: number }[], t: Words, show: (n: number) => string, intro = "", max = 5): string {
  const top = Math.max(1, ...rows.map((r) => r.count));
  return `
  <div class="blk">
    <div class="t">${escapeHtml(title)}</div>
    ${intro}
    ${rows
      .slice(0, max)
      .map(
        (r) => `
    <div class="row"><div class="n"><span>${escapeHtml(labelOf(r.label, t))}</span><span class="num">${escapeHtml(show(r.count))}</span></div><div class="bar"><i style="width:${((r.count / top) * 100).toFixed(1)}%"></i></div></div>`
      )
      .join("")}
  </div>`;
}

function cover(d: ArpoReportData, t: Words): string {
  const h = headline(d);
  const n = nf(d.language);
  const pic = d.cover ? `<div class="pic"><img src="data:image/jpeg;base64,${d.cover.toString("base64")}"></div>` : `<div class="nopic"></div>`;
  const pills = [
    h.visits !== null && h.visits > 0 && `<div class="pill">${escapeHtml(t.coverLine(n.format(h.visits)))}</div>`,
    h.leads !== null && h.leads > 0 && `<div class="pill">${escapeHtml(t.coverLeads(n.format(h.leads)))}</div>`,
  ].filter(Boolean);
  return `
  <div class="page cover">
    ${pic}
    <div class="txt">
      <img class="logo" src="${d.logo}">
      <div class="eyebrow">${t.eyebrow}</div>
      <h1>${escapeHtml(d.customerName)}</h1>
      <div class="period">${escapeHtml(d.periodLabel)}</div>
      ${pills.length ? `<div class="big">${pills.join("")}</div>` : ""}
    </div>
  </div>`;
}

/** The visits over the period as a soft line - in the big card, under the number. */
function spark(stats: TourStats): string {
  const v = stats.perDay.map((x) => x.visits);
  // Smoothed over a few days, so it reads as a trend rather than noise.
  const k = v.length > 35 ? 7 : 3;
  const sm = v.map((_, i) => {
    const part = v.slice(Math.max(0, i - k + 1), i + 1);
    return part.reduce((a, b) => a + b, 0) / part.length;
  });
  const W = 540;
  const H = 90;
  const top = Math.max(1, ...sm);
  const pts = sm.map((y, i) => [(i / Math.max(1, sm.length - 1)) * W, H - 4 - (y / top) * (H - 10)]);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;margin-top:auto"><path d="${line} L${W},${H} L0,${H} Z" fill="rgba(157,183,255,.16)"/><path d="${line}" fill="none" stroke="#9db7ff" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

/** The headline: the visits big, beside them the time spent and the leads, then the small facts. */
function overview(d: ArpoReportData, t: Words): string {
  const h = headline(d);
  const n = nf(d.language);
  if (!d.total.visits) return page(`<div class="empty">${escapeHtml(t.none)}</div>`, d, t, t.headline);
  const side = [
    h.hours !== null && `<div class="card"><div class="v num">${n.format(h.hours)}</div><div class="l">${t.hours}</div><div class="s">${t.hoursSub}</div></div>`,
    h.minutes !== null && `<div class="card"><div class="v num">${n.format(h.minutes)}</div><div class="l">${t.minutes}</div><div class="s">${t.hoursSub}</div></div>`,
    h.leads !== null && `<div class="card"><div class="v num">${n.format(h.leads)}</div><div class="l">${t.leads}</div>${d.total.visits ? `<div class="s">${t.ofVisits(pct(h.leads / d.total.visits))}</div>` : ""}</div>`,
  ].filter(Boolean) as string[];
  const big =
    h.visits !== null
      ? `<div class="card ink"><div class="v num">${n.format(h.visits)}</div><div class="l">${t.visitsBig}</div>${h.perDay ? `<div class="s">${escapeHtml(t.perDay(n.format(h.perDay)))}</div>` : ""}${trend(h.change, t)}${side.length && d.share.perDay ? spark(d.total) : ""}</div>`
      : "";
  const facts = [
    h.engaged !== null && `<div class="fact"><div class="v">${pct(h.engaged)}</div><div class="l">${t.engaged}</div></div>`,
    h.typical !== null && `<div class="fact"><div class="v">${duration(h.typical, t)}</div><div class="l">${t.typical}</div></div>`,
    h.mobile !== null && `<div class="fact"><div class="v">${pct(h.mobile)}</div><div class="l">${t.mobile}</div></div>`,
  ].filter(Boolean) as string[];
  const heroHtml = side.length ? `<div class="hero">${big}<div class="stack">${side.slice(0, 2).join("")}</div></div>` : big;
  return page(`${heroHtml}${facts.length ? `<div class="facts">${facts.join("")}</div>` : ""}`, d, t, t.headline);
}

/** The visits over time, on a page of its own. */
function overTime(d: ArpoReportData, t: Words): string[] {
  if (!d.share.perDay) return [];
  return [page(chart(d.total, t, d.language, 430), d, t, d.days > 35 ? t.perWeekTitle : t.perDayTitle)];
}

/** What they were most interested in: the winners big, then the lists. */
function interest(d: ArpoReportData, t: Words): string[] {
  const { total: s, share, language: lang } = d;
  const count = (x: number) => nf(lang).format(x);
  const tops = [
    share.rooms && s.rooms[0] && `<div class="card ink"><div class="k">${t.topRoom}</div><div class="name">${escapeHtml(labelOf(s.rooms[0].label, t))}</div><div class="s">${count(s.rooms[0].count)} ${t.visitsWord}</div></div>`,
    share.roomTime && s.roomTime[0] && `<div class="card"><div class="k">${t.topLong}</div><div class="name">${escapeHtml(s.roomTime[0].label)}</div><div class="s">${duration(s.roomTime[0].seconds, t)}</div></div>`,
    !(share.rooms && s.rooms[0]) && share.places && s.places[0] && `<div class="card ink"><div class="k">${t.places}</div><div class="name">${escapeHtml(labelOf(s.places[0].label, t))}</div><div class="s">${count(s.places[0].count)} ${t.visitsWord}</div></div>`,
  ].filter(Boolean) as string[];
  const blocks = [
    share.rooms && s.rooms.length > 1 && ranked(t.rooms, s.rooms, t, count),
    share.roomTime && s.roomTime.length > 1 && ranked(t.roomTime, s.roomTime.map((r) => ({ label: r.label, count: r.seconds })), t, (x) => duration(x, t)),
    share.places && s.places.length > 0 && ranked(t.places, s.places, t, count),
    share.opened && s.opened.length > 0 && ranked(t.opened, s.opened, t, count),
    shown(share.actions, s.leads) && s.actions.length > 0 && ranked(t.went, s.actions, t, count),
    share.live &&
      s.live.opened > 0 &&
      ranked(t.free, s.live.units, t, count, `<p><b>${count(s.live.opened)}</b> ${t.openedFree}${s.live.booked ? `, <b>${count(s.live.booked)}</b> ${t.bookedFree}` : ""}.</p>`, 3),
    share.sources && s.sources.length > 0 && ranked(t.sources, s.sources, t, count),
  ].filter(Boolean) as string[];
  if (!tops.length && !blocks.length) return [];
  const pages: string[] = [];
  // First page: the winners and a row of three lists; then two rows of three a page.
  const first = tops.length ? 3 : 6;
  pages.push(page(`${tops.length ? `<div class="top">${tops.slice(0, 2).join("")}</div>` : ""}${blocks.length ? `<div class="grid">${blocks.slice(0, first).join("")}</div>` : ""}`, d, t, t.interest));
  for (let i = first; i < blocks.length; i += 6) pages.push(page(`<div class="grid">${blocks.slice(i, i + 6).join("")}</div>`, d, t, t.interest));
  return pages;
}

/** More tours: one line each - only the columns every tour shares; the best in each column stands out. */
function sideBySide(d: ArpoReportData, t: Words): string[] {
  if (d.tours.length < 2) return [];
  const n = nf(d.language);
  const cols = [
    d.share.visits && { h: t.colVisits, num: (x: ArpoReportTour) => x.stats.visits, v: (x: ArpoReportTour) => n.format(x.stats.visits) },
    d.share.engaged && { h: t.colEngaged, num: (x: ArpoReportTour) => (x.stats.visits ? x.stats.engaged / x.stats.visits : 0), v: (x: ArpoReportTour) => (x.stats.visits ? pct(x.stats.engaged / x.stats.visits) : "-") },
    d.share.duration && { h: t.colTypical, num: (x: ArpoReportTour) => x.stats.medianSeconds, v: (x: ArpoReportTour) => (x.stats.medianSeconds >= 5 ? duration(x.stats.medianSeconds, t) : "-") },
    shown(d.share.leads, d.total.leads) && { h: t.colLeads, num: (x: ArpoReportTour) => x.stats.leads, v: (x: ArpoReportTour) => n.format(x.stats.leads) },
  ].filter(Boolean) as { h: string; num: (x: ArpoReportTour) => number; v: (x: ArpoReportTour) => string }[];
  const sorted = [...d.tours].sort((a, b) => b.stats.visits - a.stats.visits);
  const best = cols.map((c) => Math.max(...sorted.map(c.num)));
  const pages: string[] = [];
  for (let i = 0; i < sorted.length; i += 8) {
    const rows = sorted
      .slice(i, i + 8)
      .map((x) => `<tr><td class="name">${escapeHtml(x.name)}</td>${cols.map((c, ci) => `<td class="r num${best[ci] > 0 && c.num(x) === best[ci] ? " best" : ""}">${escapeHtml(c.v(x))}</td>`).join("")}</tr>`)
      .join("");
    pages.push(page(`<table><thead><tr><th>${t.tour}</th>${cols.map((c) => `<th class="r">${escapeHtml(c.h)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>`, d, t, t.tours));
  }
  return pages;
}

function next(d: ArpoReportData, t: Words): string {
  return page(
    `<div class="next">${t.tips.map(([h, p], i) => `<div class="tip"><div class="no">${i + 1}</div><div><h3>${escapeHtml(h)}</h3><p>${escapeHtml(p)}</p></div></div>`).join("")}</div>
    <div class="always"><div><h3>${t.always}</h3><p>${t.alwaysSub}</p></div><div class="url">${escapeHtml(shownPortal(d.portalUrl))}</div></div>`,
    d,
    t,
    t.nextTitle
  );
}

export function buildArpoReportHtml(d: ArpoReportData): string {
  const t = TEXT[d.language];
  const any = d.total.visits > 0;
  return `<!DOCTYPE html>
<html lang="${d.language === "EN" ? "en" : "da"}">
<head><meta charset="utf-8"><style>${STYLE}</style></head>
<body>
  ${cover(d, t)}
  ${overview(d, t)}
  ${any ? overTime(d, t).join("") : ""}
  ${any ? interest(d, t).join("") : ""}
  ${any ? sideBySide(d, t).join("") : ""}
  ${next(d, t)}
</body>
</html>`;
}

/**
 * The headline as a card for the e-mail itself (table layout and inline
 * styles - what mail programs understand), with a button to their page.
 */
export function buildArpoReportMailCard(d: ArpoReportData): { html: string; text: string } {
  const t = TEXT[d.language];
  const h = headline(d);
  const n = nf(d.language);
  const items = [
    h.visits !== null && [n.format(h.visits), t.visitsBig],
    h.hours !== null && [n.format(h.hours), t.hours],
    h.minutes !== null && [n.format(h.minutes), t.minutes],
    h.leads !== null && [n.format(h.leads), t.leads],
    h.leads === null && h.typical !== null && [duration(h.typical, t), t.typical],
  ].filter(Boolean) as [string, string][];
  if (!items.length || !d.total.visits) return { html: "", text: "" };
  const shownItems = items.slice(0, 3);
  const change = h.change === null ? "" : h.change === 0 ? t.same : h.change > 0 ? `▲ ${t.up(`${h.change} %`)}` : `▼ ${t.down(`${-h.change} %`)}`;
  const cells = shownItems
    .map(
      ([v, l]) =>
        `<td valign="top" style="padding:16px 18px;background:#ffffff;border-radius:14px;border:1px solid #ece8e1;width:${Math.floor(100 / shownItems.length)}%"><div style="font-size:30px;font-weight:800;color:${INK};line-height:1">${escapeHtml(v)}</div><div style="font-size:13px;color:#5b606b;margin-top:6px;line-height:1.35">${escapeHtml(l)}</div></td>`
    )
    .join('<td style="width:10px"></td>');
  const html = `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#faf8f5;border-radius:18px;padding:18px;margin:16px 0;font-family:Arial,sans-serif">
<tr><td style="padding:0 0 12px;font-size:13px;font-weight:700;color:#7a7f8c;letter-spacing:.06em;text-transform:uppercase">${escapeHtml(t.mailIntro)} ${escapeHtml(d.periodLabel)}</td></tr>
<tr><td><table role="presentation" cellpadding="0" cellspacing="0" style="width:100%"><tr>${cells}</tr></table></td></tr>
${change ? `<tr><td style="padding:12px 0 0;font-size:14px;font-weight:700;color:${h.change! > 0 ? "#17703a" : "#6b6f78"}">${escapeHtml(change)}</td></tr>` : ""}
<tr><td style="padding:16px 0 2px"><a href="${escapeHtml(d.portalUrl)}" style="display:inline-block;background:${INK};color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:11px 20px;border-radius:10px">${escapeHtml(t.mailCta)}</a></td></tr>
</table>`;
  const text = `${t.mailIntro} ${d.periodLabel}\n${shownItems.map(([v, l]) => `- ${v} ${l}`).join("\n")}${change ? `\n- ${change}` : ""}\n${t.mailCta}: ${d.portalUrl}\n\n`;
  return { html, text };
}
