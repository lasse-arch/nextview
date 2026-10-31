"use server";

import { readFile } from "node:fs/promises";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSettingValue } from "@/lib/integration-settings";
import { siteResearch } from "@/lib/site-digest";
import { claudeCostUsd } from "@/lib/claude-cost";
import { plainWords } from "@/app/arpo/tour-lab/tours/i18n";
import type { PlaceCard, TourConfig } from "@/app/arpo/tour-lab/tours/types";

/*
 * Stedkort written by nextviewAI: for the place the preview stands in (with a
 * picture of it) or for every place in the menu at once - from what the
 * customer's own website says about it, in the customer's voice. Nothing is
 * saved here: the cards go into the editor's draft, and the user saves.
 */

const Card = z.object({
  ss: z.number().int().describe("Scanpunktet, kortet hører til (som givet)"),
  title: z.string().describe("Kort overskrift, 2-5 ord"),
  text: z.string().describe("1-3 korte sætninger om stedet"),
  moreLabel: z.string().describe('Knaptekst til en "Læs mere"-side, eller tom'),
  moreText: z.string().describe('Den længere tekst til "Læs mere" (3-6 sætninger), eller tom'),
  bookButton: z.boolean().describe("Skal kortet have tourens hovedhandling som knap (fx Book en rundvisning)? Kun på de steder, hvor lysten opstår."),
});
const Cards = z.object({ cards: z.array(Card) });

export type CardDraft = Pick<PlaceCard, "ss" | "title" | "text" | "more" | "buttons">;
export type CardsResult = { ok: true; cards: CardDraft[] } | { ok: false; error: string };

/** Where the customer's website is: the tour's own setting, else the deal's. */
async function websiteOf(slug: string, config: TourConfig): Promise<string | null> {
  if (config.embeds?.site) return config.embeds.site;
  const tour = await prisma.tour.findUnique({ where: { slug }, select: { deal: { select: { websiteUrl: true } } } });
  return tour?.deal?.websiteUrl ?? null;
}

/**
 * Writes stedkort. `places`: the places to write for (scan point + its name in
 * the menu, and a picture of the view when the editor could take one).
 */
export async function writePlaceCards(slug: string, config: TourConfig, places: { ss: number; name: string | null; image?: string }[]): Promise<CardsResult> {
  const user = await requireUser();
  if (user.role !== "ADMIN") return { ok: false, error: "Kun admin kan redigere tours." };
  const key = process.env.ANTHROPIC_API_KEY || (await getSettingValue("ANTHROPIC_API_KEY"));
  if (!key) return { ok: false, error: "nextviewAI er ikke sat op endnu - indsæt en nøgle under fanen nextviewAI." };
  if (!places.length) return { ok: false, error: "Ingen steder at skrive kort til." };

  const site = await websiteOf(slug, config);
  const research = site ? await siteResearch(site).catch(() => null) : null;
  const playbook = await readFile(path.join(process.cwd(), "src/app/arpo/tour-lab/tours/PLAYBOOK.md"), "utf8").catch(() => "");
  const memory = await prisma.tourAiMemory.findMany({ where: { scope: { in: ["all", slug] } }, orderBy: { createdAt: "asc" }, take: 200, select: { text: true } });
  const primary = config.cta.find((c) => c.primary) ?? config.cta[0];

  const content: Anthropic.ContentBlockParam[] = [];
  for (const p of places.slice(0, 30)) {
    content.push({ type: "text", text: `Sted: scanpunkt ${p.ss}${p.name ? `, "${p.name}" i menuen` : " (uden navn i menuen)"}${p.image ? " - sådan ser det ud:" : ""}` });
    const m = p.image && /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(p.image);
    if (m) content.push({ type: "image", source: { type: "base64", media_type: m[1] as "image/jpeg" | "image/png" | "image/webp", data: m[2] } });
  }
  content.push({
    type: "text",
    text: `Touren: ${config.title} (${config.brand}). Hovedhandling: ${primary ? `"${primary.label}"` : "ingen"}.
Menuen: ${config.menu.map((m) => ("items" in m ? `${m.title}: ${m.items.map((i) => i[0]).join(", ")}` : m.title)).join(" / ")}
Stedkort, der allerede findes (gentag ikke det samme): ${(config.placeCards ?? []).map((c) => `"${c.title}"`).join(", ") || "ingen"}

${research ? `Kundens hjemmeside (${site}):\n${research.text.slice(0, 60_000)}` : "Kundens hjemmeside kendes ikke - skriv ud fra stedets navn og billedet, og opfind ingen fakta."}

Skriv ét stedkort til hvert sted ovenfor.`,
  });

  const client = new Anthropic({ apiKey: key });
  let r;
  try {
    r = await client.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 12000,
      system: `Du er nextviewAI og skriver stedkort til en virtuel 360°-tour: et lille kort, der kommer frem, når den besøgende lander et bestemt sted.
- Skriv i kundens stemme til målgruppen, varmt og konkret - som kundens bedste sælger ville sige det, mens man står der. Ram hjemmesidens tone: samme ordvalg, samme tiltale (du/I/De), samme stemning og deres egne navne for stederne, så kortet lyder, som om de selv har skrevet det.
- Overskriften er 2-5 ord. Teksten 1-3 korte sætninger: hvad stedet er, og hvorfor det er godt for den besøgende. Brug kundens egne fakta fra hjemmesiden om netop dette sted. Opfind aldrig priser, antal, tider eller navne.
- Kun en "Læs mere"-side, hvis hjemmesiden har mere at fortælle om stedet. Hovedhandlingen som knap kun dér, hvor lysten opstår (fx værelset, restaurantens sal, et ledigt rum).
- Skriv som et menneske: aldrig "·", "—", "–" eller "|" mellem ord.
<drejebog>
${playbook}
</drejebog>
${memory.length ? `<hukommelse>\n${memory.map((m) => `- ${m.text}`).join("\n")}\n</hukommelse>` : ""}`,
      messages: [{ role: "user", content }],
      output_config: { effort: "medium", format: zodOutputFormat(Cards) },
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return { ok: false, error: "nextviewAI-nøglen virker ikke længere." };
    if (err instanceof Anthropic.RateLimitError) return { ok: false, error: "nextviewAI har travlt - prøv igen om lidt." };
    return { ok: false, error: `Kunne ikke få fat i nextviewAI (${err instanceof Error ? err.message : err}).` };
  }
  const u = r.usage;
  await prisma.tourAiUsage
    .create({ data: { tourSlug: slug, userName: user.name, kind: "stedkort", inputTokens: u.input_tokens, outputTokens: u.output_tokens, cacheReadTokens: u.cache_read_input_tokens ?? 0, cacheWriteTokens: u.cache_creation_input_tokens ?? 0, costUsd: claudeCostUsd(u) } })
    .catch(() => {});
  const out = r.parsed_output;
  if (!out) return { ok: false, error: "nextviewAI svarede ikke som forventet - prøv igen." };
  const wanted = new Set(places.map((p) => p.ss));
  const cards = out.cards
    .filter((c) => wanted.has(c.ss) && c.title.trim())
    .map((c): CardDraft => ({
      ss: [c.ss],
      title: plainWords(c.title.trim()),
      text: plainWords(c.text.trim()),
      ...(c.moreLabel.trim() && c.moreText.trim() ? { more: { label: plainWords(c.moreLabel.trim()), text: plainWords(c.moreText.trim()) } } : {}),
      ...(c.bookButton && primary ? { buttons: [{ label: primary.label, href: primary.href }] } : {}),
    }));
  if (!cards.length) return { ok: false, error: "nextviewAI skrev ingen kort - prøv igen." };
  return { ok: true, cards };
}
