"use server";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSettingValue } from "@/lib/integration-settings";
import { claudeCostUsd } from "@/lib/claude-cost";
import { ACTION, tourStats } from "@/lib/tour-stats";
import type { TourConfig } from "@/app/arpo/tour-lab/tours/types";

/*
 * "Forslag ud fra tallene" in Resultater: nextviewAI reads what visitors do
 * in the tour - which places lead on to booking, what they pick first, where
 * they stop - next to the tour's setup, and suggests a few concrete changes.
 * Each suggestion is a request nextviewAI can carry out in the editor (the
 * user looks at it in the preview and saves), so the tour gets more of what
 * works.
 */

const MIN_VISITS = 20;

const Suggestions = z.object({
  summary: z.string(),
  suggestions: z.array(z.object({ title: z.string(), why: z.string(), ask: z.string() })),
});

export type Insight = { title: string; why: string; ask: string };
export type InsightResult = { ok: true; summary: string; suggestions: Insight[]; visits: number } | { ok: false; error: string };

type Row = { label: string | null; sessions: bigint; acted: bigint };

/** Per place (and per first choice, per button …): visits that saw it, and how many of those went on to act. */
async function byLabel(slug: string, since: Date, where: string) {
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `WITH s AS (SELECT session, bool_or(${ACTION}) AS acted FROM "TourEvent" WHERE "tourSlug" = $1 AND "createdAt" >= $2 GROUP BY session)
     SELECT e.label, count(DISTINCT e.session) AS sessions, count(DISTINCT e.session) FILTER (WHERE s.acted) AS acted
     FROM "TourEvent" e JOIN s USING (session)
     WHERE e."tourSlug" = $1 AND e."createdAt" >= $2 AND ${where}
     GROUP BY e.label ORDER BY sessions DESC LIMIT 25`,
    slug,
    since
  );
  return rows.map((r) => ({ label: r.label ?? "(uden navn)", visits: Number(r.sessions), wentOnToAct: Number(r.acted) }));
}

export async function suggestFromStats(slug: string, config: TourConfig): Promise<InsightResult> {
  const user = await requireUser();
  if (user.role !== "ADMIN") return { ok: false, error: "Kun admin kan redigere tours." };
  const key = process.env.ANTHROPIC_API_KEY || (await getSettingValue("ANTHROPIC_API_KEY"));
  if (!key) return { ok: false, error: "nextviewAI er ikke sat op endnu - indsæt en nøgle under fanen nextviewAI." };

  const days = 60;
  const since = new Date(Date.now() - days * 86_400_000);
  const stats = await tourStats(slug, days);
  if (stats.visits < MIN_VISITS) return { ok: false, error: `For få besøg endnu (${stats.visits} de seneste ${days} dage). Kom tilbage, når touren har haft mindst ${MIN_VISITS} besøg - så er tallene til at stole på.` };

  const [places, rooms, firstChoices, buttons, guide, cards, bounced] = await Promise.all([
    byLabel(slug, since, `e.name IN ('menu_click','place_click')`),
    byLabel(slug, since, `e.name = 'room_view'`),
    byLabel(slug, since, `e.name = 'welcome_choice'`),
    byLabel(slug, since, ACTION.replaceAll("name", "e.name").replaceAll("label", "e.label")),
    byLabel(slug, since, `e.name IN ('guide_start','guide_step','guide_end')`),
    byLabel(slug, since, `e.name = 'place_card_view'`),
    prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM (SELECT session FROM "TourEvent" WHERE "tourSlug" = $1 AND "createdAt" >= $2 GROUP BY session
         HAVING bool_and(name IN ('tour_open','tour_ready','welcome_view','drone_view'))) x`,
      slug,
      since
    ),
  ]);
  const numbers = {
    days,
    visits: stats.visits,
    wentExploring: stats.engaged,
    wentOnToBookCallOrWrite: stats.leads,
    leftWithoutDoingAnything: Number(bounced[0]?.n ?? 0),
    typicalVisitSeconds: stats.medianSeconds,
    mobileShare: Math.round(stats.mobileShare * 100) + " %",
    openedFrom: stats.sources,
    placesChosen: places,
    roomsSeen: rooms,
    firstChoiceInWelcome: firstChoices,
    buttonsUsed: buttons,
    showMeAround: guide,
    placeCardsSeen: cards,
    liveData: stats.live,
  };
  // What the suggestions can work with - the parts of the setup a visitor meets.
  const tour = {
    title: config.title,
    design: config.design,
    welcome: config.welcome ?? config.cover ?? null,
    menu: config.menu,
    cta: config.cta,
    guide: config.guide ? { stops: config.guide.stops.map((s) => ("title" in s ? s.title : s.point)) } : null,
    placeCards: config.placeCards?.map((c) => c.title),
    dock: config.dock,
    languages: config.languages ?? [],
  };

  const client = new Anthropic({ apiKey: key });
  let r;
  try {
    r = await client.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 8000,
      system:
        "Du er nextviewAI og hjælper Nextview360 med at gøre virksomheders virtuelle tours bedre til at sælge. Du får tourens tal fra de seneste uger og tourens opbygning. " +
        "Find det, der virker (steder, der ofte fører til booking, opkald eller mail; det folk vælger først), og det, der ikke gør (steder mange ser, men hvorfra få går videre; hvor folk stopper; knapper ingen bruger). " +
        "Foreslå 3-5 konkrete ændringer, der giver mere af det, der virker: ryk det populære frem i menu eller velkomst, sæt en knap til booking dér hvor folk beslutter sig, gør fortællingen kortere hvor folk falder fra, osv. " +
        "Hvert forslag: en kort titel, hvorfor (med tallene - fx '41 % af dem, der så selskabslokalet, bookede, mod 9 % i alt'), og 'ask': præcis hvad nextviewAI skal ændre i touren, skrevet som en besked til nextviewAI i editoren. " +
        "Foreslå kun ting, tallene bærer, og kun ændringer i touren (ikke i kundens hjemmeside eller drift). Hvis tallene er for tynde til et forslag, så sig det. Skriv på dansk, kort og konkret. " +
        "'summary' er 1-2 sætninger om, hvordan touren klarer sig.",
      messages: [{ role: "user", content: `Tallene:\n${JSON.stringify(numbers, null, 1)}\n\nTouren:\n${JSON.stringify(tour, null, 1)}` }],
      output_config: { effort: "medium", format: zodOutputFormat(Suggestions) },
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return { ok: false, error: "nextviewAI-nøglen virker ikke længere." };
    return { ok: false, error: `Kunne ikke få fat i nextviewAI (${err instanceof Error ? err.message : err}).` };
  }
  const u = r.usage;
  await prisma.tourAiUsage
    .create({ data: { tourSlug: slug, userName: user.name, kind: "forslag ud fra tallene", inputTokens: u.input_tokens, outputTokens: u.output_tokens, cacheReadTokens: u.cache_read_input_tokens ?? 0, cacheWriteTokens: u.cache_creation_input_tokens ?? 0, costUsd: claudeCostUsd(u) } })
    .catch(() => {});
  const out = r.parsed_output;
  if (!out) return { ok: false, error: "nextviewAI svarede ikke som forventet - prøv igen." };
  return { ok: true, summary: out.summary, suggestions: out.suggestions.slice(0, 5), visits: stats.visits };
}
