"use server";

import { readFile } from "node:fs/promises";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSettingValue, setSettingValue } from "@/lib/integration-settings";
import { mpskinsMenuDigest, siteDigest } from "@/lib/site-digest";
import { hostFiles } from "@/lib/tour-files";
import { fetchMpskinsCfg, filterFromCss } from "@/lib/mpskins";
import { tourConfigProblem } from "@/lib/tour-validate";
import { fetchModelInfo, modelIdsIn, type ModelInfo } from "@/lib/matterport-graph";
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

/** Claude Opus 5.5's price per million tokens: input $4, output $20, cache reads $0.20, cache writes (5 min) $5. */
function claudeCostUsd(u: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }) {
  return (u.input_tokens * 4 + u.output_tokens * 20 + (u.cache_read_input_tokens ?? 0) * 0.2 + (u.cache_creation_input_tokens ?? 0) * 5) / 1_000_000;
}

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

const docs: Record<string, Promise<string>> = {};
/** A file next to the tour setups: types.ts (what every field does) or PLAYBOOK.md (how we make a good tour). */
function tourDoc(file: "types.ts" | "PLAYBOOK.md") {
  docs[file] ??= readFile(path.join(process.cwd(), "src/app/(app)/tour-lab/tours", file), "utf8").catch(() => "");
  return docs[file];
}

async function systemPrompt() {
  const [types, playbook] = await Promise.all([tourDoc("types.ts"), tourDoc("PLAYBOOK.md")]);
  return `Du hjælper Nextview360 med at sætte virtuelle 360°-tours op i deres CRM, Arpo. En tour er en Matterport-scanning med Nextview360's egen brugerflade ovenpå (velkomst, menu, knapper, kort osv.), styret af en JSON-opsætning (TourConfig).

Brugeren beskriver en ændring på dansk. Svar med de præcise ændringer til opsætningen (changes) og et kort, venligt svar (reply) på dansk - som en dygtig designer, der lige har lavet ændringen. Ingen teknisk snak om JSON eller stier i svaret.

Regler:
- Ændr kun det, der bliver bedt om. Bevar alt andet.
- Links til steder i touren er explore.nextview360.dk-links med ?ss=<scanpunkt> (evt. &rot=pitch,yaw). Opfind aldrig scanpunkter - genbrug dem, der allerede står i opsætningen eller i MPSkins-menuen, eller spørg.
- Links ud af touren (booking, hjemmeside) er almindelige https-links.
- Farver er hex (#rrggbb). Skrifter er navne på Google Fonts.
- Er ønsket uklart, så stil ét kort spørgsmål i reply og lad changes være tom.
- En menu (menu) er en liste af enten {title, href} eller grupper {title, items: [[navn, link], ...]}.
- Følg drejebogen nedenfor - den er Nextview360's erfaring med, hvad der virker.

<drejebog>
${playbook}
</drejebog>

Opsætningens typer, med forklaring af hvert felt:
\`\`\`ts
${types}
\`\`\``;
}

/** Asks Claude for edits to a setup and applies them to a copy. */
async function claudeEdits(key: string, who: { name: string; kind: string }, config: TourConfig, history: ChatTurn[], request: string, maxTokens = 16000, retry = true): Promise<AiEditResult> {
  const messages: Anthropic.MessageParam[] = [
    ...history.slice(-10).map((t): Anthropic.MessageParam => ({ role: t.role, content: t.text })),
    { role: "user", content: `Opsætningen lige nu:\n\`\`\`json\n${JSON.stringify(config)}\n\`\`\`\n\n${request}` },
  ];
  let parsed: z.infer<typeof Edits> | null;
  try {
    const client = new Anthropic({ apiKey: key });
    const response = await client.messages
      .stream({
        model: "claude-opus-5-5",
        max_tokens: maxTokens,
        // The setup docs and the playbook are the same in every call - cached, they cost a tenth on the next ones.
        system: [{ type: "text", text: await systemPrompt(), cache_control: { type: "ephemeral" } }],
        messages,
        output_config: { effort: "low", format: zodOutputFormat(Edits) },
      })
      .finalMessage();
    const u = response.usage;
    // What the call cost, kept on the tour (see "Tid og pris" in the editor).
    await prisma.tourAiUsage
      .create({
        data: {
          tourSlug: config.slug,
          userName: who.name,
          kind: who.kind,
          inputTokens: u.input_tokens,
          outputTokens: u.output_tokens,
          cacheReadTokens: u.cache_read_input_tokens ?? 0,
          cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
          costUsd: claudeCostUsd(u),
        },
      })
      .catch((err: unknown) => console.error("tourAiUsage", err));
    if (response.stop_reason === "refusal") return { ok: false, error: "Claude ville ikke lave den ændring." };
    if (response.stop_reason === "max_tokens") return { ok: false, error: "Ændringen blev for stor - prøv at dele den op." };
    parsed = response.parsed_output ?? null;
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return { ok: false, error: "Claude-nøglen virker ikke længere." };
    if (err instanceof Anthropic.RateLimitError) return { ok: false, error: "Claude har travlt - prøv igen om lidt." };
    console.error("claudeEdits", err);
    return { ok: false, error: "Kunne ikke få fat i Claude - prøv igen." };
  }
  if (!parsed) return { ok: false, error: "Claude svarede ikke som forventet - prøv igen." };

  const next = structuredClone(config) as unknown as Record<string, unknown>;
  let problem: string | null;
  try {
    for (const c of parsed.changes) apply(next, c.op, c.path, c.op === "set" ? JSON.parse(c.value_json) : undefined);
    problem = tourConfigProblem(next);
  } catch (err) {
    problem = err instanceof Error ? err.message : String(err);
  }
  if (problem) {
    // Claude gets one go at fixing its own edit, told exactly what was wrong.
    if (retry) return claudeEdits(key, who, config, history, `${request}\n\n(Dit forrige forsøg kunne ikke bruges: ${problem}. Lav ændringen igen, så opsætningen har den rigtige form.)`, maxTokens, false);
    return { ok: false, error: `Claudes ændring kunne ikke bruges (${problem}) - prøv at formulere det anderledes.` };
  }
  return { ok: true, reply: parsed.reply, config: { ...(next as unknown as TourConfig), slug: config.slug }, changed: parsed.changes.length };
}

export async function askClaudeForTour(config: TourConfig, history: ChatTurn[], request: string): Promise<AiEditResult> {
  const user = await admin();
  const key = await apiKey();
  if (!key) return { ok: false, error: "Claude er ikke sat op endnu - indsæt en nøgle." };
  try {
    return await claudeEdits(key, { name: user.name, kind: "ændring" }, config, history, `Ønske: ${request}`);
  } catch (err) {
    console.error("askClaudeForTour", err);
    return { ok: false, error: `Noget gik galt hos Claude (${err instanceof Error ? err.message : err}) - prøv igen.` };
  }
}

/**
 * A new tour built by Claude from the customer's website and the existing
 * MPSkins tour: the website gives the look, the words and the actions (the
 * red thread), the MPSkins tour its rooms and links - on top of an existing
 * tour's features (its kind of menu, start and functions).
 */
export async function createTourFromWebsite(input: {
  name: string;
  website: string;
  /** The MPSkins tour (optional when a Matterport model is given) - its menu is reused. */
  tourUrl: string;
  /** The Matterport model the tour is connected to. */
  modelId?: string;
  /** The customer (deal) - the tour is linked to it. */
  dealId?: string;
  base: string;
  notes: string;
}): Promise<{ ok: true; slug: string; reply: string } | { ok: false; error: string }> {
  const user = await admin();
  const key = await apiKey();
  if (!key) return { ok: false, error: "Claude er ikke sat op endnu - indsæt en nøgle i en tours editor (fanen Claude)." };
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Giv touren et navn." };
  let tourUrl: URL | null = null;
  if (input.tourUrl.trim()) {
    try {
      tourUrl = new URL(input.tourUrl.trim());
    } catch {
      return { ok: false, error: "MPSkins-linket ser ikke rigtigt ud (explore.nextview360.dk/…)." };
    }
    if (tourUrl.hostname !== "explore.nextview360.dk") return { ok: false, error: "MPSkins-linket skal være et explore.nextview360.dk-link." };
  }
  const model = input.modelId ? await fetchModelInfo(input.modelId) : null;
  if (input.modelId && !model) return { ok: false, error: "Matterport-modellen findes ikke eller er ikke offentlig." };
  if (!tourUrl && !model) return { ok: false, error: "Vælg kundens Matterport-tour." };
  const source = await prisma.tour.findUnique({ where: { slug: input.base }, select: { config: true } });
  if (!source) return { ok: false, error: "Touren, der skal bygges videre på, findes ikke." };

  const [site, menu] = await Promise.all([
    input.website.trim() ? siteDigest(input.website).catch((err: unknown) => `(Hjemmesiden kunne ikke hentes: ${err instanceof Error ? err.message : err})`) : Promise.resolve("(Ingen hjemmeside angivet)"),
    tourUrl ? mpskinsMenuDigest(tourUrl.toString()).catch(() => "") : Promise.resolve(""),
  ]);

  let slug = slugify(name) || "tour";
  for (let i = 2; await prisma.tour.findUnique({ where: { slug }, select: { id: true } }); i++) slug = `${slugify(name)}-${i}`;
  const base = { ...neutral(source.config as unknown as TourConfig, { slug, title: name, tourPage: tourUrl?.toString() ?? "" }), modelId: model?.id };

  const result = await claudeEdits(
    key,
    { name: user.name, kind: "bygget" },
    base,
    [],
    `Byg en ny tour til en ny kunde. Opsætningen ovenfor er en skabelon: funktionerne (bevægelse, skift, menutype osv.) er valgt med vilje, men alt kundeindhold er tomt og skal udfyldes.

Udfyld ud fra kundens hjemmeside og den eksisterende MPSkins-tour nedenfor, efter drejebogen:
- brand, title, subtitle, logo (en logo-kandidat fra hjemmesiden; logoOnLight hvis logoet er mørkt), colors og font/fontHeading så touren ligner hjemmesiden (rød tråd).
- start: et godt startpunkt fra MPSkins-menuen (typisk "Velkommen"-punktet).
- menu: byg den fra MPSkins-menuens punkter og links (brug linkene præcis som de står), ordnet efter drejebogen.
- cta og contact: hjemmesidens vigtigste handling(er) og kontaktoplysninger. linkOpen: popup for booking.
- velkomst: vælg den start, drejebogen anbefaler til branchen (design.welcome + welcome eller cover). Brug ikke fotos, du ikke har - forsiden får hjemmesidens delingsbillede, hvis der er et.
- nudge ("Din plads venter") med hovedhandlingen, og evt. et par stedkort/rundvisning ud fra MPSkins-menuens punkter, hvis det giver mening.
Skriv al tekst på dansk i kundens stemme. Opfind ingen fakta. I reply: fortæl kort, hvad du har valgt og hvorfor, og hvad brugeren selv bør tjekke eller tilføje (fx fotos af stederne).
${input.notes.trim() ? `\nBemærkninger fra brugeren: ${input.notes.trim()}\n` : ""}
<hjemmeside>
${site}
</hjemmeside>

<mpskins-menu>
${menu || (tourUrl ? "(Kunne ikke læses)" : "(Ingen MPSkins-tour - menuens steder vælges bagefter i editoren. Lav menuen med kundens handlinger og evt. tomme grupper, som brugeren fylder.)")}
</mpskins-menu>
${
  model
    ? `
<matterport>
Touren er forbundet direkte til Matterport-modellen ${model.id} ("${model.name}"${model.address ? `, ${model.address}` : ""}).
Steder i touren skrives som https://my.matterport.com/show/?m=${model.id}&ss=<scanpunkt> - start: brug ss=1, medmindre MPSkins-menuen viser et bedre startpunkt.
Fotos fra scanningen (brug det første som forsidebillede, hvis der er en forside): ${model.photos.slice(0, 4).join(" ")}
</matterport>`
    : ""
}`,
    32000
  );
  if (!result.ok) return result;

  // MPSkins' colour filter comes along as it was set there.
  if (tourUrl) {
    const filter = filterFromCss((await fetchMpskinsCfg(tourUrl.toString()).catch(() => null))?.modelCssFilter);
    if (filter) result.config.filter = filter;
  }
  // The logo and pictures from the website are copied to us, so the tour keeps them whatever happens to the site.
  const hosted = await hostFiles(slug, { ...result.config, slug });
  const config = hosted.config as unknown as Prisma.InputJsonValue;
  await prisma.tour.create({
    data: { slug, name, dealId: input.dealId || null, config, versions: { create: { config, note: `Bygget af Claude ud fra ${input.website.trim() || "MPSkins-touren"}`, createdByName: user.name } } },
  });
  revalidatePath("/tour-lab");
  const failed = hosted.failed.length ? `\n\nDisse filer kunne ikke hentes til os: ${hosted.failed.join("; ")}` : "";
  return { ok: true, slug, reply: result.reply + failed };
}

const slugify = (s: string) =>
  s.toLowerCase().replace(/æ/g, "ae").replace(/ø/g, "oe").replace(/å/g, "aa").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

/** An existing tour's setup with everything that belongs to its customer taken out - its features stay. */
function neutral(c: TourConfig, fields: Pick<TourConfig, "slug" | "title" | "tourPage">): TourConfig {
  return {
    ...fields,
    brand: "",
    subtitle: undefined,
    start: "",
    logo: "",
    logoOnLight: undefined,
    logoSize: c.logoSize,
    colors: c.colors,
    font: c.font,
    fontHeading: c.fontHeading,
    cta: [],
    contact: undefined,
    linkOpen: c.linkOpen ? { default: c.linkOpen.default } : undefined,
    design: c.design,
    jump: c.jump,
    measure: c.measure,
    matterportUi: c.matterportUi,
    navigation: c.navigation,
    menuOpenOnStart: c.menuOpenOnStart,
    stories: c.stories ? { mobile: c.stories.mobile, desktop: c.stories.desktop } : undefined,
    mobileZoomLock: c.mobileZoomLock,
    matterportParams: c.matterportParams,
    flyMs: c.flyMs,
    wayfinding: c.wayfinding ? {} : undefined,
    welcome: c.welcome ? { kicker: "", title: "", lead: "", tiles: [], skip: c.welcome.skip } : undefined,
    cover: c.cover ? { kicker: "", title: "", lead: "", image: "", enter: c.cover.enter, placesTitle: c.cover.placesTitle } : undefined,
    categories: {},
    points: [],
    hiddenSweeps: [],
    menu: [],
  };
}

/* ----- "Ny tour": the customer and their Matterport tours ----- */

export type TourCustomer = { id: string; name: string; address: string | null; website: string | null; stage: string; contractSignedAt: string | null; tours: number; hasModel: boolean };

/** Customers to make a tour for - signed/filmed/live first, then by name. */
export async function searchTourCustomers(query: string): Promise<TourCustomer[]> {
  await admin();
  const q = query.trim();
  const deals = await prisma.deal.findMany({
    where: q.length >= 2 ? { OR: [{ companyName: { contains: q, mode: "insensitive" } }, { displayName: { contains: q, mode: "insensitive" } }] } : { OR: [{ contractSignedAt: { not: null } }, { mpSkinId: { not: null } }] },
    orderBy: [{ filmedAt: { sort: "desc", nulls: "last" } }, { contractSignedAt: { sort: "desc", nulls: "last" } }],
    take: 12,
    select: { id: true, companyName: true, displayName: true, address: true, websiteUrl: true, stage: true, contractSignedAt: true, mpSkinId: true, _count: { select: { tours: true } }, items: { select: { url: true } } },
  });
  return deals.map((d) => ({
    id: d.id,
    name: d.displayName ?? d.companyName,
    address: d.address,
    website: d.websiteUrl,
    stage: d.stage,
    contractSignedAt: d.contractSignedAt?.toISOString() ?? null,
    tours: d._count.tours,
    hasModel: modelIdsIn([d.mpSkinId ?? "", ...d.items.map((i) => i.url ?? "")].join(" ")).length > 0,
  }));
}

/** The customer's Matterport tours (from the deal's MP-Space ids and product links), with name and photo from Matterport - or one pasted link/id. */
export async function matterportModels(dealId: string | null, pasted?: string): Promise<ModelInfo[]> {
  await admin();
  let text = pasted ?? "";
  if (dealId && !pasted) {
    const d = await prisma.deal.findUnique({ where: { id: dealId }, select: { mpSkinId: true, items: { select: { url: true } } } });
    text = [d?.mpSkinId ?? "", ...(d?.items.map((i) => i.url ?? "") ?? [])].join(" ");
  }
  const models = await Promise.all(modelIdsIn(text).slice(0, 10).map(fetchModelInfo));
  return models.filter((m): m is ModelInfo => m != null);
}
