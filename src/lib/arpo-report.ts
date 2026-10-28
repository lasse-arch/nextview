import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { ReportInterval, ReportLanguage } from "@prisma/client";
import { prisma } from "@/lib/db";
import { tourStats } from "@/lib/tour-stats";
import { shareOf } from "@/lib/tour-share";
import { mergeShare, mergeStats } from "@/lib/merge-stats";
import { fetchModelInfo } from "@/lib/matterport-graph";
import { dealName } from "@/lib/labels";
import { getAppBaseUrl } from "@/lib/email-oauth";
import { renderCustomerReportPdf } from "@/lib/customer-report-pdf";
import { buildArpoReportHtml, buildArpoReportMailCard } from "@/lib/arpo-report-template";
import type { TourConfig } from "@/app/arpo/tour-lab/tours/types";

/*
 * The statistics report for customers whose tours are in Arpo: their
 * published tours' own numbers (TourEvent) for the period the report covers -
 * a month, two or three, as they've chosen - rendered to the PDF that is
 * mailed. Customers whose tours are still only on explore (MPSkins) get the
 * old report (customer-report-service.ts decides which).
 */

/** Days a report covers, by how often it's sent. */
export const REPORT_DAYS: Record<ReportInterval, number> = { MONTHLY: 30, BIMONTHLY: 60, QUARTERLY: 90 };

/** The published Arpo tours of these deals - none means the old (explore) report. */
export async function arpoReportTours(dealIds: string[]) {
  const tours = await prisma.tour.findMany({
    where: { dealId: { in: dealIds }, published: true },
    orderBy: { createdAt: "asc" },
    select: { slug: true, name: true, config: true, share: true, dealId: true, deal: { select: { companyName: true, displayName: true } } },
  });
  return tours;
}

const MONTHS = {
  DA: ["jan.", "feb.", "mar.", "apr.", "maj", "jun.", "jul.", "aug.", "sep.", "okt.", "nov.", "dec."],
  EN: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};

/** "1. aug. - 28. okt. 2026" / "1 Aug - 28 Oct 2026" (Danish time). */
export function periodLabel(days: number, language: ReportLanguage, now = new Date()): string {
  const dk = (d: Date) => {
    const [y, m, day] = d.toLocaleDateString("en-CA", { timeZone: "Europe/Copenhagen" }).split("-").map(Number);
    return { y, m: m - 1, day };
  };
  const a = dk(new Date(now.getTime() - (days - 1) * 86_400_000));
  const b = dk(now);
  const one = (x: { y: number; m: number; day: number }, year: boolean) =>
    language === "EN" ? `${x.day} ${MONTHS.EN[x.m]}${year ? ` ${x.y}` : ""}` : `${x.day}. ${MONTHS.DA[x.m]}${year ? ` ${x.y}` : ""}`;
  return `${one(a, a.y !== b.y)} - ${one(b, true)}`;
}

/** All the time spent in the tours in the period, in seconds - a visit counts at most 30 minutes (a tab left open isn't a 3-hour visit), as in tourStats. */
async function secondsSpent(slugs: string[], days: number): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<{ secs: number | null }[]>(
    `SELECT sum(secs) AS secs FROM (SELECT LEAST(EXTRACT(EPOCH FROM max("createdAt") - min("createdAt")), 1800) AS secs
       FROM "TourEvent" WHERE "tourSlug" = ANY($1) AND "createdAt" >= $2 GROUP BY "tourSlug", session) s`,
    slugs,
    new Date(Date.now() - days * 86_400_000)
  );
  return Math.round(Number(rows[0]?.secs ?? 0));
}

/** Visits in the `days` before the period - to say how it went compared with then. */
async function visitsBefore(slugs: string[], days: number): Promise<number> {
  const end = new Date(Date.now() - days * 86_400_000);
  const start = new Date(end.getTime() - days * 86_400_000);
  const rows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT count(DISTINCT session) AS n FROM "TourEvent" WHERE "tourSlug" = ANY($1) AND "createdAt" >= $2 AND "createdAt" < $3`,
    slugs,
    start,
    end
  );
  return Number(rows[0]?.n ?? 0);
}

/** A picture of the place, 1280 x 720 - the tour's own cover or place photo, else its Matterport model's. */
async function coverOf(config: TourConfig): Promise<Buffer | null> {
  const candidates = [config.cover?.image, config.places?.[0]?.image, config.intro?.poster, config.map?.image].filter((x): x is string => Boolean(x));
  for (const src of candidates) {
    const img = await loadImage(src).catch(() => null);
    if (img) return img;
  }
  const modelImage = config.modelId ? (await fetchModelInfo(config.modelId))?.image : null;
  if (modelImage && /^https:\/\/([a-z0-9-]+\.)*matterport\.com\//i.test(modelImage)) return loadImage(modelImage).catch(() => null);
  return null;
}

/** A picture's address in a tour can come from a customer's website - only fetched from the open internet (not localhost, a bare IP or an internal name). */
function onTheInternet(src: string): boolean {
  try {
    const u = new URL(src);
    const h = u.hostname.toLowerCase();
    if (u.protocol !== "https:" && !(u.protocol === "http:" && src.startsWith(getAppBaseUrl()))) return false;
    if (src.startsWith(getAppBaseUrl())) return true;
    return !(h === "localhost" || !h.includes(".") || /^[\d.]+$/.test(h) || h.includes(":") || /\.(local|internal|lan|home|corp)$/.test(h));
  } catch {
    return false;
  }
}

async function loadImage(src: string): Promise<Buffer | null> {
  let raw: Buffer | null = null;
  if (src.startsWith("/") && !src.startsWith("//")) {
    // One of our own files - from the build if it's there, else from the site itself.
    const file = path.join(process.cwd(), "public", path.normalize(src).replace(/^(\.\.[/\\])+/, ""));
    if (file.startsWith(path.join(process.cwd(), "public") + path.sep)) raw = await fs.readFile(file).catch(() => null);
    src = `${getAppBaseUrl()}${src}`;
  }
  if (!raw) {
    if (!onTheInternet(src)) return null;
    const res = await fetch(src, { signal: AbortSignal.timeout(15_000), cache: "no-store", redirect: "error" });
    if (!res.ok || !/^image\//.test(res.headers.get("content-type") ?? "")) return null;
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > 25_000_000) return null;
    raw = Buffer.from(await res.arrayBuffer());
  }
  return sharp(raw, { limitInputPixels: 120_000_000 }).resize({ width: 1280, height: 720, fit: "cover" }).jpeg({ quality: 80 }).toBuffer();
}

/**
 * The report for these deals' Arpo tours: the PDF and the headline card for
 * the e-mail - null when they have none (the caller then sends the old
 * report). `dealIds`: the deal, or a customer and its locations for one
 * combined report.
 */
export async function buildArpoReport(opts: {
  customerName: string;
  language: ReportLanguage;
  interval: ReportInterval | null;
  dealIds: string[];
}): Promise<{ pdf: Buffer; mail: { html: string; text: string } } | null> {
  const tours = await arpoReportTours(opts.dealIds);
  if (!tours.length) return null;
  const days = opts.interval ? REPORT_DAYS[opts.interval] : 30;
  const several = new Set(tours.map((x) => x.dealId)).size > 1;
  const items = await Promise.all(
    tours.map(async (x) => {
      const config = x.config as unknown as TourConfig;
      const title = config.title || x.name;
      return {
        // The location too when there are more - unless the tour's name already says it.
        name: several && x.deal && !title.toLowerCase().includes(dealName(x.deal).toLowerCase()) ? `${dealName(x.deal)} - ${title}` : title,
        stats: await tourStats(x.slug, days),
        share: shareOf(x.share),
        config,
      };
    })
  );
  const total = mergeStats(items.map((x) => x.stats))!;
  const share = mergeShare(items.map((x) => x.share))!;
  const slugs = tours.map((x) => x.slug);
  const [previousVisits, totalSeconds, cover] = await Promise.all([visitsBefore(slugs, days), secondsSpent(slugs, days), coverOf(items[0].config).catch(() => null)]);
  const logo = `data:image/png;base64,${(await fs.readFile(path.join(process.cwd(), "public", "logo.png"))).toString("base64")}`;
  const data = {
    customerName: opts.customerName,
    language: opts.language,
    periodLabel: periodLabel(days, opts.language),
    days,
    cover,
    logo,
    total,
    share,
    previousVisits: previousVisits || null,
    totalSeconds,
    tours: items.map(({ name, stats, share }) => ({ name, stats, share })),
    portalUrl: `${getAppBaseUrl()}/kunde`,
  };
  return { pdf: await renderCustomerReportPdf(buildArpoReportHtml(data)), mail: buildArpoReportMailCard(data) };
}
