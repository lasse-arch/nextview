import "server-only";
import { prisma } from "@/lib/db";
import { backups } from "@/lib/backup";
import { isDineroConfigured, pingDinero } from "@/lib/dinero";
import { isDocuSealConfigured } from "@/lib/docuseal";
import { getSettingValue, isDineroTestMode } from "@/lib/integration-settings";
import { getValidAccessToken } from "@/lib/google-calendar";
import { WELCOME_MAIL_SENDER } from "@/lib/welcome-mail";
import { cloudflareReady, PAGES_PROJECT } from "@/lib/tour-publish";

/*
 * Health (Arpo → Virksomheden → Health): is everything Arpo depends on
 * working right now - a short, read-only check of each, with a time limit,
 * so one slow system can't hold the page up. Never shows a key or a
 * password, only whether it works.
 */

export type Status = "ok" | "warn" | "down" | "off";
export type Check = { name: string; status: Status; detail: string; ms?: number };
export type CheckGroup = { title: string; checks: Check[] };

const LIMIT_MS = 6000;

async function timed(name: string, run: () => Promise<Omit<Check, "name" | "ms">>): Promise<Check> {
  const started = Date.now();
  try {
    const r = await Promise.race([run(), new Promise<never>((_, no) => setTimeout(() => no(new Error("svarede ikke inden for 6 sek.")), LIMIT_MS))]);
    return { name, ms: Date.now() - started, ...r };
  } catch (err) {
    // Only the error's own short text - never anything that could hold a key.
    return { name, status: "down", detail: (err instanceof Error ? err.message : String(err)).slice(0, 160), ms: Date.now() - started };
  }
}

async function reach(url: string): Promise<Omit<Check, "name" | "ms">> {
  const res = await fetch(url, { method: "GET", redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(LIMIT_MS) });
  return res.status < 400 ? { status: "ok", detail: `Svarer (${res.status})` } : { status: "down", detail: `Svarer med fejl ${res.status}` };
}

const ago = (d: Date) => {
  const h = (Date.now() - d.getTime()) / 3600_000;
  return h < 1 ? `${Math.max(1, Math.round(h * 60))} min. siden` : h < 48 ? `${Math.round(h)} timer siden` : `${Math.round(h / 24)} dage siden`;
};

export async function healthChecks(): Promise<CheckGroup[]> {
  const site = (process.env.APP_BASE_URL || "https://nextview360.dk").replace(/\/+$/, "");
  const [db, web, tours, explore, gmail, resend, dinero, docuseal, bs, backup, matterport, ai, gemini] = await Promise.all([
    timed("Database", async () => {
      const t = Date.now();
      await prisma.$queryRawUnsafe("SELECT 1");
      const ms = Date.now() - t;
      return { status: ms < 100 ? "ok" : "warn", detail: `Svarer på ${ms} ms${process.env.VERCEL_REGION ? ` fra ${process.env.VERCEL_REGION}` : ""}` };
    }),
    timed("Hjemmesiden (nextview360.dk)", () => reach(`${site}/`)),
    timed("Tours på Cloudflare", async () => {
      if (!cloudflareReady()) return { status: "off", detail: "Ikke sat op endnu" };
      const live = await prisma.tour.count({ where: { liveVersion: { not: null } } });
      const r = await reach(`https://${PAGES_PROJECT}.pages.dev/`);
      return r.status === "ok" ? { status: "ok", detail: `${live} tours udgivet` } : r;
    }),
    timed("explore.nextview360.dk (MPSkins)", () => reach("https://explore.nextview360.dk/")),
    timed(`Gmail og kalender (${WELCOME_MAIL_SENDER})`, async () => {
      const account = await prisma.emailAccount.findFirst({ where: { provider: "GOOGLE", email: WELCOME_MAIL_SENDER } });
      if (!account) return { status: "down", detail: "Ikke forbundet - mails til kunder kan ikke sendes" };
      await getValidAccessToken(account);
      return { status: "ok", detail: "Forbundet" };
    }),
    timed("Resend (Arpos egne mails)", async () => {
      // Login links, the review mail, reports … - without it they go through Gmail.
      const key = process.env.RESEND_API_KEY;
      if (!key) return { status: "off", detail: "Ikke sat op - Arpos egne mails sendes via Gmail" };
      const res = await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${key}` }, cache: "no-store", signal: AbortSignal.timeout(LIMIT_MS) }).catch(() => null);
      if (!res) return { status: "warn", detail: "Kunne ikke nå Resend lige nu - mails sendes via Gmail imens" };
      const body = (await res.json().catch(() => null)) as { data?: { name: string; status: string }[]; name?: string } | null;
      // A key with only "Sending access" may not list domains - then it's set, and sending tells the rest.
      if (res.status === 401 && body?.name === "restricted_api_key") return { status: "ok", detail: "Nøgle sat (kun afsendelse)" };
      if (!res.ok) return { status: "down", detail: `Resend afviser nøglen (${res.status}) - mails sendes via Gmail` };
      const domain = body?.data?.find((d) => d.name === "nextview360.dk");
      if (!domain) return { status: "down", detail: "nextview360.dk er ikke tilføjet i Resend - mails sendes via Gmail" };
      return domain.status === "verified" ? { status: "ok", detail: "nextview360.dk godkendt - mails sendes via Resend" } : { status: "warn", detail: `nextview360.dk er ikke godkendt endnu (${domain.status}) - tjek DNS-posterne` };
    }),
    timed("ElevenLabs (stemme i Vis mig rundt)", async () => {
      const key = process.env.ELEVENLABS_API_KEY;
      if (!key) return { status: "off", detail: "Ikke sat op - lyd kan stadig uploades som fil" };
      const res = await fetch("https://api.elevenlabs.io/v1/voices", { headers: { "xi-api-key": key }, cache: "no-store", signal: AbortSignal.timeout(LIMIT_MS) }).catch(() => null);
      if (!res) return { status: "warn", detail: "Kunne ikke nå ElevenLabs lige nu" };
      if (res.status === 401 || res.status === 403) return { status: "down", detail: `ElevenLabs afviser nøglen (${res.status}) - den skal have Voices: Read og Text to Speech` };
      return res.ok ? { status: "ok", detail: "Forbundet" } : { status: "warn", detail: `ElevenLabs svarede ${res.status}` };
    }),
    timed("Dinero (fakturaer)", async () => {
      if (!(await isDineroConfigured())) return { status: "off", detail: "Slået fra" };
      await pingDinero();
      return (await isDineroTestMode()) ? { status: "warn", detail: "Forbundet - men i testtilstand" } : { status: "ok", detail: "Forbundet" };
    }),
    timed("DocuSeal (kontrakter)", async () => ((await isDocuSealConfigured()) ? { status: "ok", detail: "Sat op" } : { status: "off", detail: "Slået fra" })),
    timed("Betalingsservice", async () => {
      const last = await prisma.bsDelivery.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true, sftpError: true } });
      if (!last) return { status: "ok", detail: "Ingen leverancer endnu" };
      return last.sftpError ? { status: "down", detail: `Seneste levering fejlede: ${last.sftpError.slice(0, 100)}` } : { status: "ok", detail: `Seneste levering ${ago(last.createdAt)}` };
    }),
    timed("Natlig backup", async () => {
      const [newest] = await backups();
      if (!newest) return { status: "down", detail: "Ingen backup fundet" };
      const hours = (Date.now() - newest.uploadedAt.getTime()) / 3600_000;
      return { status: hours < 30 ? "ok" : "down", detail: `Seneste ${ago(newest.uploadedAt)} (${Math.round(newest.size / 1024 / 1024)} MB)` };
    }),
    timed("Matterport", async () => ((await getSettingValue("MATTERPORT_SDK_KEY")) ? { status: "ok", detail: "SDK-nøgle sat" } : { status: "warn", detail: "Ingen SDK-nøgle - tourene bruger Matterports almindelige visning" })),
    timed("nextviewAI", async () => ((process.env.ANTHROPIC_API_KEY || (await getSettingValue("ANTHROPIC_API_KEY"))) ? { status: "ok", detail: "Nøgle sat" } : { status: "off", detail: "Ingen nøgle" })),
    timed("AI-billeder (Gemini)", async () => {
      // The key in Vercel (GEMINI_API_KEY) first, like "Ret med AI" itself - else one saved in Arpo. And whether Google takes it.
      const fromEnv = Boolean(process.env.GEMINI_API_KEY);
      const key = process.env.GEMINI_API_KEY || (await getSettingValue("GEMINI_API_KEY"));
      if (!key) return { status: "off", detail: "Ingen nøgle" };
      const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", { headers: { "x-goog-api-key": key }, signal: AbortSignal.timeout(8000) }).catch(() => null);
      if (!res) return { status: "warn", detail: "Kunne ikke nå Google lige nu" };
      return res.ok ? { status: "ok", detail: fromEnv ? "Nøgle i Vercel virker" : "Nøgle virker" } : { status: "down", detail: `Google afviser nøglen (${res.status})` };
    }),
  ]);
  return [
    { title: "Drift", checks: [db, web, tours, explore, backup] },
    { title: "Integrationer", checks: [gmail, resend, dinero, docuseal, bs, matterport, ai, gemini] },
  ];
}

export type TourSpeed = { slug: string; name: string; device: string; visits: number; median: number; slow: number };

/**
 * How fast the tours are for real visitors (the last 7 days): the time until
 * the tour is ready (event tour_ready, kept in tenths of a second) - the
 * typical visit (median) and the slowest tenth (90 %), per tour and device.
 */
export async function tourSpeed(): Promise<{ all: { device: string; visits: number; median: number; slow: number }[]; tours: TourSpeed[] }> {
  const since = new Date(Date.now() - 7 * 86400_000);
  const rows = await prisma.$queryRaw<{ slug: string; device: string | null; visits: bigint; median: number; slow: number }[]>`
    SELECT "tourSlug" AS slug, device, count(*) AS visits,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY value) / 10.0 AS median,
      percentile_cont(0.9) WITHIN GROUP (ORDER BY value) / 10.0 AS slow
    FROM "TourEvent" WHERE name = 'tour_ready' AND value IS NOT NULL AND "createdAt" > ${since}
    GROUP BY "tourSlug", device`;
  const all = await prisma.$queryRaw<{ device: string | null; visits: bigint; median: number; slow: number }[]>`
    SELECT device, count(*) AS visits,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY value) / 10.0 AS median,
      percentile_cont(0.9) WITHIN GROUP (ORDER BY value) / 10.0 AS slow
    FROM "TourEvent" WHERE name = 'tour_ready' AND value IS NOT NULL AND "createdAt" > ${since}
    GROUP BY device`;
  const names = new Map((await prisma.tour.findMany({ where: { slug: { in: [...new Set(rows.map((r) => r.slug))] } }, select: { slug: true, name: true } })).map((t) => [t.slug, t.name]));
  const r1 = (n: number) => Math.round(Number(n) * 10) / 10;
  return {
    all: all.map((a) => ({ device: a.device ?? "ukendt", visits: Number(a.visits), median: r1(a.median), slow: r1(a.slow) })),
    tours: rows
      .map((r) => ({ slug: r.slug, name: names.get(r.slug) ?? r.slug, device: r.device ?? "ukendt", visits: Number(r.visits), median: r1(r.median), slow: r1(r.slow) }))
      .sort((a, b) => b.slow - a.slow),
  };
}

export type TourVisits = { slug: string; name: string; now: number; day: number; week: number; month: number };

/** Visitors on the tours that are out there: right now (last 5 min.), the last day, 7 and 30 days - one visit = one browser tab. */
export async function tourVisits(): Promise<{ total: Omit<TourVisits, "slug" | "name">; tours: TourVisits[] }> {
  const tours = await prisma.tour.findMany({ where: { published: true }, select: { slug: true, name: true }, orderBy: { name: "asc" } });
  const slugs = tours.map((t) => t.slug);
  if (!slugs.length) return { total: { now: 0, day: 0, week: 0, month: 0 }, tours: [] };
  const since = (ms: number) => new Date(Date.now() - ms);
  const rows = await prisma.$queryRaw<{ slug: string; now: bigint; day: bigint; week: bigint; month: bigint }[]>`
    SELECT "tourSlug" AS slug,
      count(DISTINCT session) FILTER (WHERE "createdAt" > ${since(5 * 60_000)}) AS now,
      count(DISTINCT session) FILTER (WHERE "createdAt" > ${since(86400_000)}) AS day,
      count(DISTINCT session) FILTER (WHERE "createdAt" > ${since(7 * 86400_000)}) AS week,
      count(DISTINCT session) AS month
    FROM "TourEvent"
    WHERE "createdAt" > ${since(30 * 86400_000)} AND "tourSlug" = ANY(${slugs})
    GROUP BY "tourSlug"`;
  const [all] = await prisma.$queryRaw<{ now: bigint; day: bigint; week: bigint; month: bigint }[]>`
    SELECT count(DISTINCT session) FILTER (WHERE "createdAt" > ${since(5 * 60_000)}) AS now,
      count(DISTINCT session) FILTER (WHERE "createdAt" > ${since(86400_000)}) AS day,
      count(DISTINCT session) FILTER (WHERE "createdAt" > ${since(7 * 86400_000)}) AS week,
      count(DISTINCT session) AS month
    FROM "TourEvent" WHERE "createdAt" > ${since(30 * 86400_000)} AND "tourSlug" = ANY(${slugs})`;
  const by = new Map(rows.map((r) => [r.slug, r]));
  const n = (v: bigint | undefined) => Number(v ?? 0);
  return {
    total: { now: n(all?.now), day: n(all?.day), week: n(all?.week), month: n(all?.month) },
    tours: tours
      .map((t) => {
        const r = by.get(t.slug);
        return { slug: t.slug, name: t.name, now: n(r?.now), day: n(r?.day), week: n(r?.week), month: n(r?.month) };
      })
      .sort((a, b) => b.now - a.now || b.day - a.day || b.month - a.month),
  };
}
