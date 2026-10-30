"use server";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSettingValue } from "@/lib/integration-settings";
import { claudeCostUsd } from "@/lib/claude-cost";
import { langName, plainWords, translatableTexts } from "@/app/arpo/tour-lab/tours/i18n";
import type { TourConfig } from "@/app/arpo/tour-lab/tours/types";

/*
 * "Oversæt med nextviewAI" under Sprog: every text of the tour (and the
 * engine's own words) into each language, in one go per language. Nothing is
 * saved here - the translations go into the editor's draft, the preview shows
 * them, and the user saves as with any other change.
 */

const Translated = z.object({ items: z.array(z.object({ i: z.number().int(), text: z.string() })) });

export type TranslateResult = { ok: true; translations: Record<string, Record<string, string>>; count: number } | { ok: false; error: string };

export async function translateTour(slug: string, config: TourConfig, langs: string[], all = false): Promise<TranslateResult> {
  const user = await requireUser();
  if (user.role !== "ADMIN") return { ok: false, error: "Kun admin kan redigere tours." };
  const key = process.env.ANTHROPIC_API_KEY || (await getSettingValue("ANTHROPIC_API_KEY"));
  if (!key) return { ok: false, error: "nextviewAI er ikke sat op endnu - indsæt en nøgle under fanen nextviewAI." };
  const client = new Anthropic({ apiKey: key });
  const texts = translatableTexts(config);
  const translations: Record<string, Record<string, string>> = {};
  let count = 0;
  try {
    await Promise.all(
      langs.map(async (lang) => {
        const have = config.translations?.[lang] ?? {};
        const todo = all ? texts : texts.filter((t) => !have[t]?.trim());
        translations[lang] = {};
        // In parts, so a big tour fits in one answer each.
        for (let at = 0; at < todo.length; at += 120) await part(lang, todo.slice(at, at + 120));
      })
    );
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return { ok: false, error: "nextviewAI-nøglen virker ikke længere." };
    return { ok: false, error: `Kunne ikke få fat i nextviewAI (${err instanceof Error ? err.message : err}).` };
  }
  return { ok: true, translations, count };

  async function part(lang: string, todo: string[]) {
    const r = await client.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      system:
        `Du oversætter en virtuel rundvisning (en 360°-tour af en virksomhed) fra dansk til ${lang === "kl" ? "grønlandsk (kalaallisut, vestgrønlandsk - det officielle sprog i Grønland)" : langName(lang)}. ` +
        "Teksterne er overskrifter, menupunkter, knapper, korte fortællinger og faste ord i touren. Skriv dem, som en indfødt tekstforfatter ville skrive dem på en premium hjemmeside: naturligt, varmt og kort - knapper og menupunkter skal være lige så korte som på dansk. " +
        "Navne på virksomheder, steder og produkter (fx Jalsa, Halvorsminde, GastroFabrikken) oversættes ikke. Pladsholdere i krøllede parenteser som {sted} og {pris} skal stå uændret i oversættelsen. Bevar tal, priser, emojis og tegn som ▶ › ▴. " +
        "Ingen \"·\", \"—\" eller \"|\" mellem ord - brug komma eller bindestreg. Svar med én oversættelse pr. nummer.",
      messages: [
        {
          role: "user",
          content: `Touren: ${config.title} (${config.brand}).\n\nOversæt hver tekst (nummer: tekst):\n${todo.map((t, i) => `${i}: ${JSON.stringify(t)}`).join("\n")}`,
        },
      ],
      output_config: { effort: "low", format: zodOutputFormat(Translated) },
    });
    const u = r.usage;
    await prisma.tourAiUsage
      .create({ data: { tourSlug: slug, userName: user.name, kind: `oversæt ${lang}`, inputTokens: u.input_tokens, outputTokens: u.output_tokens, cacheReadTokens: u.cache_read_input_tokens ?? 0, cacheWriteTokens: u.cache_creation_input_tokens ?? 0, costUsd: claudeCostUsd(u) } })
      .catch(() => {});
    for (const { i, text } of r.parsed_output?.items ?? []) {
      if (todo[i] && text.trim()) {
        translations[lang][todo[i]] = plainWords(text.trim());
        count++;
      }
    }
  }
}
