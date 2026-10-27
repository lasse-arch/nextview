"use server";

import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { storeTourFile } from "@/lib/tour-files";
import type { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSettingValue, setSettingValue } from "@/lib/integration-settings";
import { siteResearch } from "@/lib/site-digest";
import { pageAsText, readUnits, type LiveUnit } from "@/lib/availability/live";
import { hostFiles } from "@/lib/tour-files";
import { claudeCostUsd } from "@/lib/claude-cost";
import { BRANCHES, DESIGN_PRESETS, type Branch, type DesignPreset } from "@/app/arpo/tour-lab/tours/presets";

/** The prototype tour each ready-made design starts from (for its kind of features). */
const PRESET_BASE: Record<DesignPreset["id"], string> = {
  klassisk: "halvorsminde",
  forside: "jalsa",
  direkte: "fitness-gronlandstorv",
  rumvaelger: "boxdepot-rum",
  guidet: "halvorsminde",
  enkel: "tolne-efterskole",
};
import { tourConfigProblem } from "@/lib/tour-validate";
import { fetchModelInfo, modelIdsIn, searchAccountModels, type ModelInfo } from "@/lib/matterport-graph";
import type { TourConfig } from "@/app/arpo/tour-lab/tours/types";
import { plainWordsInConfig } from "@/app/arpo/tour-lab/tours/i18n";

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
  if (!value.startsWith("sk-ant-")) return { ok: false, error: "En nøgle fra Anthropic starter med sk-ant-" };
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
  remember: z
    .array(
      z.object({
        scope: z.enum(["all", "tour"]).describe('"all": gælder alle tours (hvordan Nextview360 vil have tingene). "tour": fakta om netop denne kunde.'),
        text: z.string().describe("Én kort sætning på dansk."),
      })
    )
    .describe("Det, du har lært og skal huske til næste gang (se Hukommelse). Ofte tom."),
});

export type ChatTurn = { role: "user" | "assistant"; text: string };
export type AiEditResult = { ok: true; reply: string; config: TourConfig; changed: number; remembered: string[] } | { ok: false; error: string };


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
  docs[file] ??= readFile(path.join(process.cwd(), "src/app/arpo/tour-lab/tours", file), "utf8").catch(() => "");
  return docs[file];
}

async function systemPrompt() {
  const [types, playbook] = await Promise.all([tourDoc("types.ts"), tourDoc("PLAYBOOK.md")]);
  return `Du hjælper Nextview360 med at sætte virtuelle 360°-tours op i deres CRM, Arpo. En tour er en Matterport-scanning med Nextview360's egen brugerflade ovenpå (velkomst, menu, knapper, kort osv.), styret af en JSON-opsætning (TourConfig).

Brugeren beskriver en ændring på dansk. Svar med de præcise ændringer til opsætningen (changes) og et kort, venligt svar (reply) på dansk - som en dygtig designer, der lige har lavet ændringen. Ingen teknisk snak om JSON eller stier i svaret.

Regler:
- Ændr kun det, der bliver bedt om. Bevar alt andet.
- Links til steder i touren er Matterport-links (https://my.matterport.com/show/?m=<model>&ss=<scanpunkt>, evt. &rot=pitch,yaw). Opfind aldrig scanpunkter - genbrug dem, der allerede står i opsætningen, eller bed brugeren om at vælge stedet i forhåndsvisningen.
- Links ud af touren (booking, hjemmeside) er almindelige https-links.
- Farver er hex (#rrggbb). Skrifter er navne på Google Fonts.
- Er ønsket uklart, så stil ét kort spørgsmål i reply og lad changes være tom.
- En menu (menu) er en liste af enten {title, href} eller grupper {title, items: [[navn, link], ...]}.
- Følg drejebogen nedenfor - den er Nextview360's erfaring med, hvad der virker.
- Brug de funktioner, touren allerede har. Minder et ønske om noget, der findes, så brug den eksisterende funktion (sæt dens felter) - byg aldrig en ny funktion, der gør næsten det samme, og efterlign aldrig en funktion med CSS. Fx:
  - et kort/en tekst, der kommer frem ved et sted → placeCards (stedkort)
  - et kort efter et stykke tid / "book nu"-påmindelse → nudge
  - en rundtur der kører af sig selv → guide ("Vis mig rundt")
  - en dagsplan/et skema → day
  - små prikker med info på ting i rummet → info (tags)
  - billeder af rummene i bunden → stories (stories.desktop / stories.mobile slår dem til - aldrig med CSS)
  - steder med foto at vælge imellem → places + design.welcome "cover" eller design.menu "dock"
  - størrelser/rum at skifte mellem → design.menu "picker"
  - ledige pladser/datoer/rum fra kundens side → live
  - et luftfoto/kort at starte på → drone eller map; knapper → cta, dock eller placeCards.buttons
  - lysere/varmere tour → filter; farver og skrift → colors, font, fontHeading; logo-side → logoSide
- Findes der ingen funktion til det, så sig det i reply (fx "Det kan touren ikke endnu - det skal bygges ind i motoren"), og lav højst en lille, forsigtig CSS-tilpasning i customCss, hvis det kun handler om udseende (en stil, en form, at flytte eller skjule et element). Bevar det, der allerede står i customCss, og tilføj til det. Design skal stadig virke på mobil.

Sådan arbejder du (du hedder nextviewAI i Arpo):
- Alt skal være skræddersyet til netop denne kunde - aldrig en skabelon med navnet skiftet ud. Brug kundens egne ord, fakta og handlinger fra hjemmesiden, undersiderne og PDF'erne (fx et ugeskema → "Sådan ser en dag ud" med de rigtige tider).
- Find først ud af, hvem der besøger touren, og hvad de har brug for. Er det fx en specialskole (autisme, ADHD, særlige behov), så gør alt helt enkelt og forudsigeligt: designet "Helt enkel" (design.welcome og design.menu "simple"), 2-3 store knapper, én flad menu, ingen fliser, intet der dukker op af sig selv (ingen nudge, ingen stedkort), jump "fade", rundtur med stemme hvor man selv trykker videre. Forældre og fagfolk er dem, der handler - giv dem deres egen lille gruppe.
- Hvem handler, og hvad er næste skridt i virkeligheden (fx "Book en rundvisning", fordi optagelse altid starter der)? Gør det til hovedhandlingen.
- Mindre er mere: hellere få, tydelige valg end mange.
- Du får tourens live data-side, som den ser ud lige nu (<live-data>), og sider, brugeren linker til (<side>). Brug dem til at tjekke i stedet for at gætte: virker mønsteret ikke, så ret live.pattern, så det finder enhederne på siden.
- Skriv som et menneske: aldrig "·", "—", "–" eller "|" mellem ord eller som pynt. Brug komma, punktum, kolon eller en almindelig bindestreg.

Hukommelse (remember):
- Du har en hukommelse, der gives tilbage til dig hver gang (se <hukommelse> nedenfor og i beskeden). Brug den.
- Gem en kort sætning, når du lærer noget, der skal bruges igen: når brugeren retter dig eller siger, hvordan Nextview360 vil have tingene (scope "all"), eller vigtige fakta om kunden, som ikke står i opsætningen (scope "tour").
- Gem ikke det, der allerede står i drejebogen eller hukommelsen, og ikke selve ændringen. Oftest er listen tom.

<drejebog>
${playbook}
</drejebog>

Opsætningens typer, med forklaring af hvert felt:
\`\`\`ts
${types}
\`\`\``;
}

/** What nextviewAI remembers: for every tour, and about this one. */
async function memories(slug: string) {
  const rows = await prisma.tourAiMemory.findMany({ where: { scope: { in: ["all", slug] } }, orderBy: { createdAt: "asc" }, take: 300 });
  const list = (scope: string) => rows.filter((r) => r.scope === scope).map((r) => `- ${r.text}`).join("\n");
  return { all: list("all"), tour: list(slug) };
}

/** Keeps what nextviewAI learned (skipping what it already knew). */
async function remember(slug: string, by: string, notes: { scope: "all" | "tour"; text: string }[]): Promise<string[]> {
  const kept: string[] = [];
  for (const n of notes) {
    const text = n.text.trim().slice(0, 400);
    const scope = n.scope === "all" ? "all" : slug;
    if (!text || (await prisma.tourAiMemory.findFirst({ where: { scope, text }, select: { id: true } }))) continue;
    await prisma.tourAiMemory.create({ data: { scope, text, createdBy: by } });
    kept.push(text);
  }
  return kept;
}

/** Asks nextviewAI for edits to a setup and applies them to a copy. `pdfs`: documents (by address) it reads along with the request. */
async function claudeEdits(key: string, who: { name: string; kind: string }, config: TourConfig, history: ChatTurn[], request: string, maxTokens = 16000, retry = true, pdfs: string[] = [], images: string[] = []): Promise<AiEditResult> {
  const mem = await memories(config.slug);
  const text = `Opsætningen lige nu:\n\`\`\`json\n${JSON.stringify(config)}\n\`\`\`\n\n${mem.tour ? `<hukommelse om denne kunde>\n${mem.tour}\n</hukommelse>\n\n` : ""}${request}`;
  const messages: Anthropic.MessageParam[] = [
    ...history.slice(-10).map((t): Anthropic.MessageParam => ({ role: t.role, content: t.text })),
    { role: "user", content: [...pdfs.map((url): Anthropic.DocumentBlockParam => ({ type: "document", source: { type: "url", url } })), ...imageBlocks(images), { type: "text", text }] },
  ];
  let parsed: z.infer<typeof Edits> | null;
  try {
    const client = new Anthropic({ apiKey: key });
    const response = await client.messages
      .stream({
        model: "claude-opus-5-5",
        max_tokens: maxTokens,
        // The setup docs, the playbook and the shared memory are the same in every call - cached, they cost a tenth on the next ones.
        system: [
          { type: "text", text: await systemPrompt(), cache_control: { type: "ephemeral" } },
          { type: "text", text: `<hukommelse>\nDet, Nextview360 har lært dig (gælder alle tours):\n${mem.all || "(intet endnu)"}\n</hukommelse>`, cache_control: { type: "ephemeral" } },
        ],
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
    if (response.stop_reason === "refusal") return { ok: false, error: "nextviewAI ville ikke lave den ændring." };
    if (response.stop_reason === "max_tokens") return { ok: false, error: "Ændringen blev for stor - prøv at dele den op." };
    parsed = response.parsed_output ?? null;
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return { ok: false, error: "nextviewAI-nøglen virker ikke længere." };
    if (err instanceof Anthropic.RateLimitError) return { ok: false, error: "nextviewAI har travlt - prøv igen om lidt." };
    console.error("claudeEdits", err);
    return { ok: false, error: "Kunne ikke få fat i nextviewAI - prøv igen." };
  }
  if (!parsed) return { ok: false, error: "nextviewAI svarede ikke som forventet - prøv igen." };

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
    if (retry) return claudeEdits(key, who, config, history, `${request}\n\n(Dit forrige forsøg kunne ikke bruges: ${problem}. Lav ændringen igen, så opsætningen har den rigtige form.)`, maxTokens, false, pdfs, images);
    return { ok: false, error: `nextviewAIs ændring kunne ikke bruges (${problem}) - prøv at formulere det anderledes.` };
  }
  const remembered = await remember(config.slug, who.name, parsed.remember ?? []).catch((err: unknown) => (console.error("remember", err), []));
  return { ok: true, reply: parsed.reply, config: plainWordsInConfig({ ...(next as unknown as TourConfig), slug: config.slug }), changed: parsed.changes.length, remembered };
}

/** Screenshots sent with a request (data URLs from the editor, made small there) as image blocks - anything else is dropped. */
function imageBlocks(images: string[]): Anthropic.ImageBlockParam[] {
  return images.slice(0, 4).flatMap((url): Anthropic.ImageBlockParam[] => {
    const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(url);
    if (!m || m[2].length > 6_000_000) return [];
    return [{ type: "image", source: { type: "base64", media_type: m[1] as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data: m[2] } }];
  });
}

/**
 * What nextviewAI sees of the web as it answers: the tour's live-data page read
 * right now (what the pattern finds there, and the page itself), and any page
 * the user links to in the request - so it can check instead of guessing.
 */
async function webContext(config: TourConfig, request: string): Promise<string> {
  const parts: string[] = [];
  if (config.live) {
    const L = config.live;
    try {
      const text = await pageAsText(L.url, 0);
      let found = "";
      try {
        const units = readUnits(text, L).filter((u) => !L.exclude?.includes(u.name));
        found = units.length
          ? `Mønsteret finder ${units.length} lige nu: ${units.slice(0, 15).map((u) => [u.name, u.size, u.price, u.from].filter(Boolean).join(" / ")).join("; ")}${units.length > 15 ? " …" : ""}`
          : "Mønsteret finder INGEN lige nu - så vises live data ingen steder i touren.";
      } catch (err) {
        found = `Mønsteret virker ikke: ${err instanceof Error ? err.message : err}`;
      }
      parts.push(`<live-data>
Siden ${L.url} er læst nu (som tekst, links som [tekst](adresse) - kun det, der står i sidens HTML; noget, siden først henter med JavaScript bagefter, kan ikke ses).
Mønster: /${L.pattern}/${L.flags ?? ""}. ${found}
Live data vises i touren: som knap øverst i sidemenuen ("${L.title}" med antal) og som chip øverst til højre, når man er inde i touren - ikke på velkomsten, forsiden, dronebilledet eller kortet, og ikke i designs med menuen "simple", "dock" eller "picker". Med 0 fundne vises de ingen steder.
Sidens tekst (uddrag):
${text.slice(0, 15_000)}
</live-data>`);
    } catch (err) {
      parts.push(`<live-data>Siden ${L.url} kunne ikke hentes lige nu: ${err instanceof Error ? err.message : err}</live-data>`);
    }
  }
  const links = [...new Set(request.match(/https?:\/\/[^\s<>"')]+/g) ?? [])].slice(0, 2);
  for (const url of links) {
    const text = await pageAsText(url, 0).catch((err: unknown) => `(kunne ikke hentes: ${err instanceof Error ? err.message : err})`);
    parts.push(`<side adresse="${url}">\n${text.slice(0, 15_000)}\n</side>`);
  }
  return parts.length ? `\n\n${parts.join("\n\n")}` : "";
}

/** A change asked for in the editor's chat - `images`: screenshots the user sent along (of the preview, the customer's site …). */
export async function askClaudeForTour(config: TourConfig, history: ChatTurn[], request: string, images: string[] = []): Promise<AiEditResult> {
  const user = await admin();
  const key = await apiKey();
  if (!key) return { ok: false, error: "nextviewAI er ikke sat op endnu - indsæt en nøgle." };
  try {
    const seen = images.length ? `\n\n(Brugeren har sendt ${images.length === 1 ? "et billede" : `${images.length} billeder`} med - typisk et skærmbillede af forhåndsvisningen eller kundens hjemmeside. Brug ${images.length === 1 ? "det" : "dem"} til at forstå, hvad de ser og mener.)` : "";
    const web = await webContext(config, request).catch(() => "");
    return await claudeEdits(key, { name: user.name, kind: "ændring" }, config, history, `Ønske: ${request}${seen}${web}`, 16000, true, [], images);
  } catch (err) {
    console.error("askClaudeForTour", err);
    return { ok: false, error: `Noget gik galt hos nextviewAI (${err instanceof Error ? err.message : err}) - prøv igen.` };
  }
}

/**
 * A new tour built by Claude from the customer's website and the existing
 * Matterport space: the website gives the look, the words and the actions
 * (the red thread), the Matterport model the scan points - on top of an existing
 * tour's features (its kind of menu, start and functions).
 */
export async function createTourFromWebsite(input: {
  name: string;
  website: string;
  /** The Matterport model the tour is connected to. */
  modelId?: string;
  /** The customer (deal) - the tour is linked to it. */
  dealId?: string;
  /** An existing tour to take the features from (the copy flow) - or a ready-made design instead. */
  base?: string;
  preset?: DesignPreset["id"];
  branch?: Branch;
  /** The branch and audience in the user's own words. */
  about?: string;
  /** What the tour should drive visitors to. */
  focus?: string;
  notes: string;
  /** A drone photo to start on (a JPEG/PNG/WebP data URL) - nextviewAI places the points on it. */
  droneImage?: string;
}): Promise<{ ok: true; slug: string; reply: string } | { ok: false; error: string }> {
  const user = await admin();
  const key = await apiKey();
  if (!key) return { ok: false, error: "nextviewAI er ikke sat op endnu - indsæt en nøgle i en tours editor (fanen nextviewAI)." };
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Giv touren et navn." };
  const model = input.modelId ? await fetchModelInfo(input.modelId) : null;
  if (!model) return { ok: false, error: input.modelId ? "Matterport-modellen findes ikke eller er ikke offentlig." : "Vælg kundens Matterport-tour." };
  const preset = DESIGN_PRESETS.find((p) => p.id === input.preset);
  // A ready-made design starts from the prototype tour that has its kind of features.
  const baseSlug = input.base ?? (preset ? PRESET_BASE[preset.id] : "halvorsminde");
  const source =
    (await prisma.tour.findUnique({ where: { slug: baseSlug }, select: { config: true } })) ?? (await prisma.tour.findFirst({ orderBy: { createdAt: "asc" }, select: { config: true } }));
  if (!source) return { ok: false, error: "Der er ingen tour at bygge videre på." };

  // Read like a person would: the front page and the pages and PDFs behind it (cached for a week).
  const research = input.website.trim()
    ? await siteResearch(input.website).catch((err: unknown) => ({ text: `(Hjemmesiden kunne ikke hentes: ${err instanceof Error ? err.message : err})`, pdfs: [] as string[] }))
    : { text: "(Ingen hjemmeside angivet)", pdfs: [] as string[] };
  const site = research.text;

  let slug = slugify(name) || "tour";
  for (let i = 2; await prisma.tour.findUnique({ where: { slug }, select: { id: true } }); i++) slug = `${slugify(name)}-${i}`;
  let base: TourConfig = { ...neutral(source.config as unknown as TourConfig, { slug, title: name, tourPage: "" }), modelId: model.id };
  if (preset) base = { ...base, ...preset.apply(base) };
  const branch = BRANCHES.find(([b]) => b === input.branch)?.[1];

  // The drone photo: kept with the tour's files, and shown to nextviewAI so it can place the points on it.
  let drone: { url: string; w: number; h: number; data: string } | null = null;
  if (input.droneImage) {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(input.droneImage);
    if (!m || m[2].length > 12_000_000) return { ok: false, error: "Dronebilledet skal være et JPEG-, PNG- eller WebP-billede på højst ca. 9 MB." };
    const bytes = Buffer.from(m[2], "base64");
    const meta = await sharp(bytes).metadata().catch(() => null);
    if (!meta?.width || !meta.height) return { ok: false, error: "Dronebilledet kunne ikke læses." };
    const url = await storeTourFile(slug, "drone-start", m[1], bytes).catch((err: unknown) => {
      throw new Error(`Dronebilledet kunne ikke gemmes: ${err instanceof Error ? err.message : err}`);
    });
    // What nextviewAI looks at: the same picture, small enough for it (the tour keeps the big one).
    const small = await sharp(bytes).resize({ width: 1568, height: 1568, fit: "inside" }).jpeg({ quality: 80 }).toBuffer();
    drone = { url, w: meta.width, h: meta.height, data: `data:image/jpeg;base64,${small.toString("base64")}` };
  }

  const result = await claudeEdits(
    key,
    { name: user.name, kind: "bygget" },
    base,
    [],
    `Byg en ny tour til en ny kunde. Opsætningen ovenfor er en skabelon: funktionerne (bevægelse, skift, menutype osv.) er valgt med vilje, men alt kundeindhold er tomt og skal udfyldes.

Udfyld ud fra kundens hjemmeside nedenfor, efter drejebogen:
- brand, title, subtitle, logo (en logo-kandidat fra hjemmesiden; logoOnLight hvis logoet er mørkt), favicon (hjemmesidens favicon, gerne apple-touch-icon), colors og font/fontHeading så touren ligner hjemmesiden (rød tråd).
- start: scanpunkt 1, medmindre brugeren har sagt andet (det rettes i editoren under Scanpunkter).
- menu: kundens handlinger og grupper efter drejebogen. Rummene vælges bagefter i editoren ved at stå i dem - lav tomme grupper med gode navne, som brugeren fylder.
- cta og contact: hjemmesidens vigtigste handling(er) og kontaktoplysninger. linkOpen: popup for booking.
- velkomst: vælg den start, drejebogen anbefaler til branchen (design.welcome + welcome eller cover). Brug ikke fotos, du ikke har, og aldrig Matterports automatiske billeder (de er for dårlige) - forsiden får hjemmesidens delingsbillede, hvis det er et rigtigt foto af stedet; ellers sig i reply, at brugeren skal tage et forsidebillede i forhåndsvisningen (Start → Forsiden → Tag billede).
- nudge ("Din plads venter") med hovedhandlingen.
- Læs undersiderne og eventuelle PDF'er (vedhæftet): find ud af, hvem stedet er for, og hvad besøgende har brug for - og byg touren til dem (se "Sådan arbejder du"). Brug rigtige fakta (fx dagsrytme fra et skema → day).
- Gem det vigtigste, du har lært om kunden, i remember (scope "tour"), så du ved det næste gang.
Skriv al tekst på dansk i kundens stemme. Opfind ingen fakta. I reply: fortæl kort, hvad du har valgt og hvorfor, og hvad brugeren selv bør tjekke eller tilføje (fx fotos af stederne).
${branch ? `\nBranche: ${branch}.` : ""}${input.about?.trim() ? `\nOm kunden og målgruppen (brugerens egne ord - følg dem): ${input.about.trim()}` : ""}${preset ? `\nDesign valgt af brugeren: "${preset.name}" (${preset.what}) - bevar design, menutype, bevægelse og start, som de står i skabelonen; udfyld kun indholdet.` : ""}${input.focus?.trim() ? `\nTouren skal især få besøgende til: ${input.focus.trim()}. Gør det til hovedhandlingen (cta, "Din plads venter", stedkort i de vigtigste rum).` : ""}
${input.notes.trim() ? `\nBemærkninger fra brugeren: ${input.notes.trim()}\n` : ""}${
      drone
        ? `
<dronebillede>
Brugeren har givet et dronebillede (vedhæftet), som touren skal starte på. Det ligger på ${drone.url} og er ${drone.w} × ${drone.h} px.
- Sæt map = { image: "${drone.url}", w: ${drone.w}, h: ${drone.h}, spots: {...} } - touren starter på billedet med punkterne på.
- Lav points for de steder, bygninger og områder, du kan se på billedet, og som hjemmesiden fortæller om (navn som kunden selv bruger, kategori, ikon, kort tekst og chips efter drejebogen; yaw og pitch 0; tour null - rummene vælges bagefter i editoren).
- spots[punktets id] = [x, y] i procent af billedets bredde og højde (0-100), præcis der hvor stedet er på billedet - midt på bygningen/området, ikke en kant. Sæt kun et punkt, du faktisk kan se; er du i tvivl, så nævn det i reply i stedet.
- map.intro med en kort titel og tekst til start, og categories til punkterne.
</dronebillede>
`
        : ""
    }
<hjemmeside>
${site}
</hjemmeside>

<matterport>
Touren er forbundet til Matterport-modellen ${model.id} ("${model.name}"${model.address ? `, ${model.address}` : ""}).
Steder i touren skrives som https://my.matterport.com/show/?m=${model.id}&ss=<scanpunkt>.
</matterport>`,
    32000,
    true,
    research.pdfs,
    drone ? [drone.data] : []
  );
  if (!result.ok) return result;

  // The logo and pictures from the website are copied to us, so the tour keeps them whatever happens to the site.
  const hosted = await hostFiles(slug, { ...result.config, slug });
  const config = hosted.config as unknown as Prisma.InputJsonValue;
  await prisma.tour.create({
    data: { slug, name, dealId: input.dealId || null, config, versions: { create: { config, note: `Bygget af nextviewAI${input.website.trim() ? ` ud fra ${input.website.trim()}` : ""}`, createdByName: user.name } } },
  });
  revalidatePath("/arpo/tour-lab");
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

/* ----- Our Matterport account: pick the space ----- */

export async function matterportConnected(): Promise<boolean> {
  await admin();
  return Boolean(process.env.MATTERPORT_API_TOKEN || (await getSettingValue("MATTERPORT_API_TOKEN")));
}

/** Connects our Matterport account (an API token: id and secret) - checked against Matterport before it's kept. */
export async function connectMatterport(tokenId: string, secret: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await admin();
  const token = `${tokenId.trim()}:${secret.trim()}`;
  if (token.length < 10) return { ok: false, error: "Indsæt både token-id og secret." };
  const test = await searchAccountModels(token, "");
  if (!test.ok) return test;
  await setSettingValue("MATTERPORT_API_TOKEN", token);
  return { ok: true };
}

/** Spaces on our Matterport account, searchable. */
export async function searchMatterportSpaces(query: string, offset?: string | null) {
  await admin();
  const token = process.env.MATTERPORT_API_TOKEN || (await getSettingValue("MATTERPORT_API_TOKEN"));
  if (!token) return { ok: false as const, error: "Matterport er ikke forbundet." };
  return searchAccountModels(token, query, offset);
}

/* ----- Live data: Claude writes the recipe for reading a customer's page ----- */

const LiveRecipe = z.object({
  title: z.string().describe('Kort titel i touren på dansk, fx "Ledige pladser" eller "Ledige depotrum".'),
  pattern: z.string().describe("JavaScript-regex (uden skråstreger) med navngivne grupper: name (krævet) og evt. size, price, from, link. Ét match = én ledig enhed."),
  flags: z.string().describe('Regex-flag uden g, fx "i" eller "is".'),
  explanation: z.string().describe("Kort forklaring på dansk af, hvad der læses, og evt. hvad der ikke kunne findes."),
});

type LiveSpec = NonNullable<TourConfig["live"]>;

/**
 * Reads a customer's page with the free units (pitches, rooms, storage …) and
 * has Claude write the pattern that picks them out - tested at once on the
 * page; Claude gets one more go if it finds nothing. After this the tour reads
 * the page itself, no AI.
 */
export async function setupLiveData(slug: string, url: string, what: string): Promise<{ ok: true; spec: LiveSpec; units: LiveUnit[]; explanation: string } | { ok: false; error: string }> {
  const user = await admin();
  const key = await apiKey();
  if (!key) return { ok: false, error: "nextviewAI er ikke sat op endnu - indsæt en nøgle under fanen nextviewAI." };
  let text: string;
  try {
    text = await pageAsText(url, 0);
  } catch (err) {
    return { ok: false, error: `Kunne ikke læse siden: ${err instanceof Error ? err.message : err}` };
  }
  const client = new Anthropic({ apiKey: key });
  let feedback = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    let r;
    try {
      r = await client.messages.parse({
        model: "claude-opus-5-5",
        max_tokens: 8000,
        system:
          "Du skriver regulære udtryk, der læser ledige enheder (campingpladser, depotrum, værelser, boliger …) ud af en hjemmeside, så en virtuel tour kan vise dem live. Teksten er siden som ren tekst, links skrevet som [tekst](adresse). Skriv ét JavaScript-regex med navngivne grupper: name (enhedens navn/nummer - krævet), og hvis siden har dem: size, price, from (ledig fra), link (adressen til at booke netop den). Ét match skal være én ledig enhed - kun de ledige, ikke de optagne, fulde eller dem på venteliste (fx 0 ledige pladser). Er det begivenheder (rundvisninger, åbent hus), er hver begivenhed én enhed: name er dens dato og tid (fx tirsdag d. 15. december kl. 18.30), size antal ledige pladser, og link dens egen tilmeldingsknap (tilmeldingsformularen), så Book fører direkte til den. Andre datoer i samme række (tilmeldingsfrist o.l.) er ikke enheder. Brug ikke-grådige mønstre og [\\s\\S] frem for punktum over linjeskift. Regexet skal virke på hele siden og fortsat virke, når der kommer flere eller færre enheder.",
        messages: [{ role: "user", content: `Hvad skal læses: ${what || "de ledige enheder"}\nSidens adresse: ${url}\n${feedback}\n<side>\n${text.slice(0, 45_000)}\n</side>` }],
        output_config: { effort: "medium", format: zodOutputFormat(LiveRecipe) },
      });
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) return { ok: false, error: "nextviewAI-nøglen virker ikke længere." };
      return { ok: false, error: `Kunne ikke få fat i nextviewAI (${err instanceof Error ? err.message : err}).` };
    }
    const u = r.usage;
    await prisma.tourAiUsage
      .create({ data: { tourSlug: slug, userName: user.name, kind: "live data", inputTokens: u.input_tokens, outputTokens: u.output_tokens, cacheReadTokens: u.cache_read_input_tokens ?? 0, cacheWriteTokens: u.cache_creation_input_tokens ?? 0, costUsd: claudeCostUsd(u) } })
      .catch(() => {});
    const recipe = r.parsed_output;
    if (!recipe) return { ok: false, error: "nextviewAI svarede ikke som forventet - prøv igen." };
    const spec: LiveSpec = { url, title: recipe.title, pattern: recipe.pattern, flags: recipe.flags.replace(/[^imsu]/g, "") };
    let units: LiveUnit[] = [];
    try {
      units = readUnits(text, spec);
    } catch (err) {
      feedback = `\n(Dit forrige regex virkede ikke: ${err instanceof Error ? err.message : err}. Prøv igen.)\n`;
      continue;
    }
    if (units.length || attempt === 1) return { ok: true, spec, units: units.slice(0, 100), explanation: recipe.explanation };
    feedback = `\n(Dit forrige regex /${spec.pattern}/${spec.flags} fandt ingen enheder på siden. Se teksten igen og prøv et andet mønster.)\n`;
  }
  return { ok: false, error: "nextviewAI kunne ikke finde de ledige enheder på siden." };
}

/** What a live-data setup finds on the page right now (for the editor's list) - all units, the excluded ones too. */
export async function previewLiveData(spec: LiveSpec): Promise<{ ok: true; units: LiveUnit[] } | { ok: false; error: string }> {
  await admin();
  try {
    return { ok: true, units: readUnits(await pageAsText(spec.url, 0), spec).slice(0, 300) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/* ----- nextviewAI's memory, as the editor shows it ----- */

export type AiMemory = { id: string; scope: "all" | "tour"; text: string; by: string | null; at: string };

export async function tourAiMemories(slug: string): Promise<AiMemory[]> {
  await admin();
  const rows = await prisma.tourAiMemory.findMany({ where: { scope: { in: ["all", slug] } }, orderBy: { createdAt: "desc" }, take: 300 });
  return rows.map((r) => ({ id: r.id, scope: r.scope === "all" ? "all" : "tour", text: r.text, by: r.createdBy, at: r.createdAt.toISOString() }));
}

/** Teaches nextviewAI something by hand - for every tour, or about this customer. */
export async function addTourAiMemory(slug: string, scope: "all" | "tour", text: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await admin();
  if (!text.trim()) return { ok: false, error: "Skriv det, nextviewAI skal huske." };
  await remember(slug, user.name, [{ scope, text }]);
  return { ok: true };
}

export async function forgetTourAiMemory(id: string): Promise<void> {
  await admin();
  await prisma.tourAiMemory.delete({ where: { id } }).catch(() => {});
}
