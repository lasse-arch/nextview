"use server";

import { readFile } from "node:fs/promises";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getSettingValue, setSettingValue } from "@/lib/integration-settings";
import type { TourConfig } from "@/app/(app)/tour-lab/tours/types";

/*
 * "Claude" in the tour editor: describe a change in plain Danish, Claude
 * answers with the edits to the tour's setup. Nothing is saved here - the
 * editor puts the edits in its draft, the preview shows them live, and the
 * user saves (or undoes) as with any other change.
 */

async function admin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Kun admin kan redigere tours.");
  return user;
}

async function apiKey() {
  return process.env.ANTHROPIC_API_KEY || (await getSettingValue("ANTHROPIC_API_KEY"));
}

export async function tourAiReady(): Promise<boolean> {
  await admin();
  return Boolean(await apiKey());
}

/** Saves the Claude API key in Arpo's settings (used when it isn't set as an environment variable). */
export async function saveAnthropicKey(key: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await admin();
  const value = key.trim();
  if (!value.startsWith("sk-ant-")) return { ok: false, error: "En Claude-nøgle starter med sk-ant-" };
  try {
    await new Anthropic({ apiKey: value }).models.list({ limit: 1 });
  } catch {
    return { ok: false, error: "Nøglen virker ikke - tjek at den er kopieret helt." };
  }
  await setSettingValue("ANTHROPIC_API_KEY", value);
  return { ok: true };
}

const Edits = z.object({
  reply: z.string().describe("Kort svar til brugeren på dansk: hvad du har ændret, eller et opklarende spørgsmål."),
  changes: z
    .array(
      z.object({
        op: z.enum(["set", "delete"]),
        path: z.string().describe('Sti i opsætningen med / imellem, fx "colors/main", "menu/2/items/0/0" eller "cta/-" (- = tilføj sidst i en liste).'),
        value_json: z.string().describe('Den nye værdi som JSON (fx "\\"#ff0000\\"" eller "{...}"). Tom ved delete.'),
      })
    )
    .describe("Ændringerne til opsætningen. Tom liste hvis du kun svarer eller spørger."),
});

export type ChatTurn = { role: "user" | "assistant"; text: string };
export type AiEditResult = { ok: true; reply: string; config: TourConfig; changed: number } | { ok: false; error: string };

/** Applies one change to a copy-in-progress of the setup. Paths are "/"-separated keys and list indexes. */
function apply(root: Record<string, unknown>, op: "set" | "delete", pathText: string, value: unknown) {
  const keys = pathText.split("/").filter(Boolean);
  if (!keys.length) throw new Error("Tom sti");
  if (keys[0] === "slug") throw new Error("Adressen (slug) kan ikke ændres her");
  let node: unknown = root;
  for (const k of keys.slice(0, -1)) {
    const next = (node as Record<string, unknown>)[k];
    if (next == null) (node as Record<string, unknown>)[k] = {};
    node = (node as Record<string, unknown>)[k];
    if (typeof node !== "object") throw new Error(`"${pathText}" findes ikke`);
  }
  const last = keys[keys.length - 1];
  if (Array.isArray(node)) {
    const i = last === "-" ? node.length : Number(last);
    if (!Number.isInteger(i) || i < 0 || i > node.length) throw new Error(`"${pathText}" findes ikke`);
    if (op === "delete") node.splice(i, 1);
    else node[i] = value;
  } else if (op === "delete") delete (node as Record<string, unknown>)[last];
  else (node as Record<string, unknown>)[last] = value;
}

let typesDoc: Promise<string> | null = null;
/** The setup's own documented types - the best description of what every field does. */
function setupDocs() {
  typesDoc ??= readFile(path.join(process.cwd(), "src/app/(app)/tour-lab/tours/types.ts"), "utf8").catch(() => "");
  return typesDoc;
}

export async function askClaudeForTour(config: TourConfig, history: ChatTurn[], request: string): Promise<AiEditResult> {
  await admin();
  const key = await apiKey();
  if (!key) return { ok: false, error: "Claude er ikke sat op endnu - indsæt en nøgle." };
  const docs = await setupDocs();

  const system = `Du hjælper Nextview360 med at sætte virtuelle 360°-tours op i deres CRM, Arpo. En tour er en Matterport-scanning med Nextview360's egen brugerflade ovenpå (velkomst, menu, knapper, kort osv.), styret af en JSON-opsætning (TourConfig).

Brugeren beskriver en ændring på dansk. Svar med de præcise ændringer til opsætningen (changes) og et kort, venligt svar (reply) på dansk - som en dygtig designer, der lige har lavet ændringen. Ingen teknisk snak om JSON eller stier i svaret.

Regler:
- Ændr kun det, der bliver bedt om. Bevar alt andet.
- Links til steder i touren er explore.nextview360.dk-links med ?ss=<scanpunkt> (evt. &rot=pitch,yaw). Opfind aldrig scanpunkter - genbrug dem, der allerede står i opsætningen, eller spørg.
- Links ud af touren (booking, hjemmeside) er almindelige https-links.
- Farver er hex (#rrggbb). Skrifter er navne på Google Fonts.
- Er ønsket uklart, så stil ét kort spørgsmål i reply og lad changes være tom.
- En menu (menu) er en liste af enten {title, href} eller grupper {title, items: [[navn, link], ...]}.

Opsætningens typer, med forklaring af hvert felt:
\`\`\`ts
${docs}
\`\`\``;

  const messages: Anthropic.MessageParam[] = [
    ...history.slice(-10).map((t): Anthropic.MessageParam => ({ role: t.role, content: t.text })),
    { role: "user", content: `Opsætningen lige nu:\n\`\`\`json\n${JSON.stringify(config)}\n\`\`\`\n\nØnske: ${request}` },
  ];

  let parsed: z.infer<typeof Edits> | null;
  try {
    const client = new Anthropic({ apiKey: key });
    const response = await client.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      system,
      messages,
      output_config: { effort: "low", format: zodOutputFormat(Edits) },
    });
    if (response.stop_reason === "refusal") return { ok: false, error: "Claude ville ikke lave den ændring." };
    if (response.stop_reason === "max_tokens") return { ok: false, error: "Ændringen blev for stor - prøv at dele den op." };
    parsed = response.parsed_output;
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return { ok: false, error: "Claude-nøglen virker ikke længere." };
    if (err instanceof Anthropic.RateLimitError) return { ok: false, error: "Claude har travlt - prøv igen om lidt." };
    console.error("askClaudeForTour", err);
    return { ok: false, error: "Kunne ikke få fat i Claude - prøv igen." };
  }
  if (!parsed) return { ok: false, error: "Claude svarede ikke som forventet - prøv igen." };

  const next = structuredClone(config) as unknown as Record<string, unknown>;
  try {
    for (const c of parsed.changes) apply(next, c.op, c.path, c.op === "set" ? JSON.parse(c.value_json) : undefined);
  } catch (err) {
    return { ok: false, error: `Claudes ændring kunne ikke bruges (${err instanceof Error ? err.message : err}) - prøv at formulere det anderledes.` };
  }
  return { ok: true, reply: parsed.reply, config: { ...(next as unknown as TourConfig), slug: config.slug }, changed: parsed.changes.length };
}
