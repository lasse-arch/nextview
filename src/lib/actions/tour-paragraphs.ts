"use server";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { requireTour } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { claudeCostUsd } from "@/lib/claude-cost";

/*
 * "Del teksterne i afsnit": nextviewAI puts paragraph breaks into long texts (stedkort, stops, points - in every
 * language) where the subject changes - and nothing else. A text comes back only if every word, number and mark is
 * exactly as before (whitespace aside); anything else is thrown away. Nothing is saved here: the editor puts the
 * texts in its draft, and the user saves.
 */

const Items = z.object({ items: z.array(z.object({ i: z.number().int(), text: z.string() })) });
const same = (a: string, b: string) => a.replace(/\s+/g, " ").trim() === b.replace(/\s+/g, " ").trim();

export async function paragraphTexts(slug: string, texts: string[]): Promise<{ ok: true; out: Record<string, string> } | { ok: false; error: string }> {
  const user = await requireTour(slug).catch(() => null);
  if (!user) return { ok: false, error: "Du har ikke adgang til tours." };
  const key = process.env.ANTHROPIC_API_KEY || null;
  if (!key) return { ok: false, error: "nextviewAI er ikke sat op endnu - indsæt en nøgle under fanen nextviewAI." };
  const list = [...new Set((Array.isArray(texts) ? texts : []).filter((t) => typeof t === "string" && t.trim().length >= 200 && t.length <= 6000).map((t) => t.trim()))].slice(0, 150);
  if (!list.length) return { ok: true, out: {} };
  const client = new Anthropic({ apiKey: key });
  let r;
  try {
    r = await client.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 32000,
      system: `Du deler tekster fra en virtuel 360°-tour i afsnit, så de er lette at læse på et kort.
- Sæt en tom linje (to linjeskift) mellem afsnit, der hvor emnet naturligt skifter. Typisk 2-4 sætninger pr. afsnit; første afsnit er gerne en kort indledning.
- Ret ALDRIG et ord, et tal, et tegn eller tegnsætningen. Tilføj, fjern eller flyt intet - indsæt kun afsnitsskift mellem sætninger.
- En tekst, der kun handler om én ting, må gerne blive ét afsnit.
- Teksterne kan være på dansk, engelsk, tysk, svensk eller norsk - del dem på samme måde.
- Svar med hver tekst under sit nummer.`,
      messages: [{ role: "user", content: list.map((t, i) => `<tekst nummer="${i}">\n${t}\n</tekst>`).join("\n") }],
      output_config: { effort: "low", format: zodOutputFormat(Items) },
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return { ok: false, error: "nextviewAI-nøglen virker ikke længere." };
    return { ok: false, error: `Kunne ikke få fat i nextviewAI (${err instanceof Error ? err.message : err}).` };
  }
  const u = r.usage;
  await prisma.tourAiUsage
    .create({ data: { tourSlug: slug, userName: user.name, kind: "afsnit", inputTokens: u.input_tokens, outputTokens: u.output_tokens, cacheReadTokens: u.cache_read_input_tokens ?? 0, cacheWriteTokens: u.cache_creation_input_tokens ?? 0, costUsd: claudeCostUsd(u) } })
    .catch(() => {});
  const out: Record<string, string> = {};
  for (const it of r.parsed_output?.items ?? []) {
    const before = list[it.i];
    if (!before) continue;
    // Tidy the breaks: paragraphs separated by exactly one blank line, no stray spaces.
    const after = it.text
      .replace(/\r/g, "")
      .split(/\n\s*\n/)
      .map((p) => p.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join("\n\n");
    if (after !== before && same(before, after)) out[before] = after;
  }
  return { ok: true, out };
}
