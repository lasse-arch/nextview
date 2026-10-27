"use server";

import { tourChanged } from "@/lib/tour-cache";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { claudeCostUsd } from "@/lib/claude-cost";
import { getSettingValue } from "@/lib/integration-settings";
import { fetchScanImages, type ScanImages } from "@/lib/matterport-graph";
import { fetchMpskinsCfg } from "@/lib/mpskins";
import type { TourConfig } from "@/app/arpo/tour-lab/tours/types";

/*
 * People in the scans: we film without people, but on 250 scan points
 * someone is sometimes in the shot. nextviewAI looks at each scan's four
 * walls - first all scans small (cheap, and it flags anything that might be
 * a person), then only the flagged ones big, to be sure and say where. What
 * it finds waits for review on /tour-lab/personer: hide the scan, or keep it.
 */

async function admin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Kun admin.");
  return user;
}

async function modelOf(slug: string): Promise<{ modelId: string; config: TourConfig } | null> {
  const tour = await prisma.tour.findUnique({ where: { slug }, select: { config: true } });
  if (!tour) return null;
  const config = tour.config as unknown as TourConfig;
  const modelId = config.modelId ?? (config.tourPage ? (await fetchMpskinsCfg(config.tourPage).catch(() => null))?.mpModel : null);
  return modelId ? { modelId, config } : null;
}

export type ScanPlan = { slug: string; name: string; total: number; todo: string[]; found: number; error?: string };

/** What's left to check on each tour (or one), and what's waiting for review. */
export async function peoplePlan(slug?: string): Promise<ScanPlan[]> {
  await admin();
  const tours = await prisma.tour.findMany({ where: slug ? { slug } : {}, select: { slug: true, name: true }, orderBy: { name: "asc" } });
  return Promise.all(
    tours.map(async (t) => {
      try {
        const m = await modelOf(t.slug);
        if (!m) return { slug: t.slug, name: t.name, total: 0, todo: [], found: 0, error: "Ingen Matterport-model" };
        const [scans, checks] = await Promise.all([fetchScanImages(m.modelId), prisma.tourScanCheck.findMany({ where: { tourSlug: t.slug }, select: { sweepId: true, status: true } })]);
        const done = new Set(checks.map((c) => c.sweepId));
        return { slug: t.slug, name: t.name, total: scans.length, todo: scans.filter((s) => !done.has(s.sweepId)).map((s) => s.sweepId), found: checks.filter((c) => c.status === "person").length };
      } catch (err) {
        return { slug: t.slug, name: t.name, total: 0, todo: [], found: 0, error: err instanceof Error ? err.message : String(err) };
      }
    })
  );
}

const Quick = z.object({
  scans: z.array(z.object({ scan: z.number().describe("Scannets nummer"), maybe: z.boolean().describe("Kan der være et menneske (eller en del af et) i scannet?") })),
});
const Sure = z.object({
  scans: z.array(
    z.object({
      scan: z.number(),
      person: z.boolean().describe("Er der helt sikkert et rigtigt menneske?"),
      wall: z.number().describe("Væggen (1-4), hvor personen tydeligst ses. 0 hvis ingen."),
      note: z.string().describe('Kort på dansk, hvor og hvad - fx "En person i blå trøje står ved døren". Tom hvis ingen.'),
    })
  ),
});

const RULES = `Du ser på billeder fra 360°-scanninger (Matterport) af et sted. Hvert scan vises som fire billeder: dets fire vægge (side 1-4).
Find rigtige mennesker, der var der, da der blev scannet: en hel person, eller en del af en (arm, ben, hoved, ryg), også i et spejl eller en rude.
Tæl IKKE med: mennesker på billeder, plakater, skærme eller malerier, dukker, statuer og udstillingsfigurer, og ikke slørede kanter eller stativet nederst.`;

/**
 * The walls as images in the message itself. Fetched by us and sent along,
 * not as links: Matterport's image server forbids Claude's own fetcher in its
 * robots.txt ("This URL is disallowed by the website's robots.txt file").
 */
async function imageBlocks(scans: ScanImages[], size: "low" | "high"): Promise<Anthropic.ContentBlockParam[]> {
  const image = async (url: string): Promise<Anthropic.ImageBlockParam> => {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`Kunne ikke hente et billede fra Matterport (${res.status}).`);
    const type = res.headers.get("content-type")?.split(";")[0];
    const media_type = type === "image/png" || type === "image/webp" || type === "image/gif" ? type : "image/jpeg";
    return { type: "image", source: { type: "base64", media_type, data: Buffer.from(await res.arrayBuffer()).toString("base64") } };
  };
  const per = await Promise.all(
    scans.map(async (s) => [
      { type: "text" as const, text: `Scan ${s.ss}:` },
      ...(await Promise.all([1, 2, 3, 4].map((f) => image((s[size] ?? s.low ?? s.high)!.replace("<face>", String(f)))))),
    ])
  );
  return per.flat();
}

async function ask<T extends z.ZodTypeAny>(client: Anthropic, slug: string, by: string, schema: T, content: Anthropic.ContentBlockParam[]): Promise<z.infer<T> | null> {
  const response = await client.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 4000,
    system: RULES,
    messages: [{ role: "user", content }],
    output_config: { effort: "low", format: zodOutputFormat(schema) },
  });
  const u = response.usage;
  await prisma.tourAiUsage
    .create({ data: { tourSlug: slug, userName: by, kind: "personer", inputTokens: u.input_tokens, outputTokens: u.output_tokens, cacheReadTokens: u.cache_read_input_tokens ?? 0, cacheWriteTokens: u.cache_creation_input_tokens ?? 0, costUsd: claudeCostUsd(u) } })
    .catch(() => {});
  return (response.parsed_output as z.infer<T> | null) ?? null;
}

/** Checks some of a tour's scans (the client sends them a dozen at a time, so it never runs too long). */
export async function checkScansForPeople(slug: string, sweepIds: string[]): Promise<{ ok: true; checked: number; found: number } | { ok: false; error: string }> {
  const user = await admin();
  const key = process.env.ANTHROPIC_API_KEY || (await getSettingValue("ANTHROPIC_API_KEY"));
  if (!key) return { ok: false, error: "nextviewAI er ikke sat op - indsæt en nøgle i en tours editor." };
  const m = await modelOf(slug);
  if (!m) return { ok: false, error: "Touren har ingen Matterport-model." };
  const all = await fetchScanImages(m.modelId);
  const wanted = all.filter((s) => sweepIds.includes(s.sweepId)).slice(0, 12);
  if (!wanted.length) return { ok: true, checked: 0, found: 0 };
  // Scans already checked on another tour of the same Matterport model (e.g. two tours of one scanning): reuse what was seen there.
  const known = await prisma.tourScanCheck.findMany({ where: { sweepId: { in: wanted.map((s) => s.sweepId) }, NOT: { tourSlug: slug } } });
  let reused = 0;
  for (const s of wanted) {
    const k = known.find((x) => x.sweepId === s.sweepId);
    if (!k) continue;
    const saw = k.status === "clear" ? "clear" : "person";
    await prisma.tourScanCheck.upsert({
      where: { tourSlug_sweepId: { tourSlug: slug, sweepId: s.sweepId } },
      create: { tourSlug: slug, sweepId: s.sweepId, ss: s.ss, status: saw, face: k.face, note: k.note },
      update: {},
    });
    if (saw === "person") reused++;
  }
  const scans = wanted.filter((s) => !known.some((x) => x.sweepId === s.sweepId));
  if (!scans.length) return { ok: true, checked: wanted.length, found: reused };
  const client = new Anthropic({ apiKey: key });
  try {
    // 1: all of them small - anything that might be a person.
    const quick = await ask(client, slug, user.name, Quick, [{ type: "text", text: "Svar for hvert scan, om der kan være et menneske. Er du i tvivl, så svar ja." }, ...(await imageBlocks(scans, "low"))]);
    const maybe = scans.filter((s) => quick?.scans.find((q) => q.scan === s.ss)?.maybe);
    // 2: the maybes big - sure, and where.
    const sure: z.infer<typeof Sure>["scans"] = [];
    for (let i = 0; i < maybe.length; i += 3) {
      const r = await ask(client, slug, user.name, Sure, [{ type: "text", text: "Se nøje efter. Svar for hvert scan." }, ...(await imageBlocks(maybe.slice(i, i + 3), "high"))]);
      sure.push(...(r?.scans ?? []));
    }
    let found = 0;
    for (const s of scans) {
      const hit = sure.find((x) => x.scan === s.ss && x.person);
      if (hit) found++;
      const existing = await prisma.tourScanCheck.findUnique({ where: { tourSlug_sweepId: { tourSlug: slug, sweepId: s.sweepId } }, select: { status: true } });
      if (existing && (existing.status === "hidden" || existing.status === "kept")) continue; // a decision stands
      const data = { ss: s.ss, status: hit ? "person" : "clear", face: hit ? Math.min(4, Math.max(1, hit.wall)) : null, note: hit?.note || null, checkedAt: new Date() };
      await prisma.tourScanCheck.upsert({ where: { tourSlug_sweepId: { tourSlug: slug, sweepId: s.sweepId } }, create: { tourSlug: slug, sweepId: s.sweepId, ...data }, update: data });
    }
    return { ok: true, checked: wanted.length, found: found + reused };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return { ok: false, error: "nextviewAI-nøglen virker ikke længere." };
    if (err instanceof Anthropic.RateLimitError) return { ok: false, error: "nextviewAI har travlt - prøv igen om lidt." };
    console.error("checkScansForPeople", err);
    return { ok: false, error: `Kunne ikke tjekke (${err instanceof Error ? err.message : err}).` };
  }
}

export type ScanFinding = { slug: string; tour: string; sweepId: string; ss: number; status: string; face: number | null; note: string | null; images: string[] };

/** The scans with people waiting for review (or all decided ones too), with fresh pictures of their walls. */
export async function peopleFindings(includeDecided = false): Promise<ScanFinding[]> {
  await admin();
  const rows = await prisma.tourScanCheck.findMany({ where: { status: { in: includeDecided ? ["person", "hidden", "kept"] : ["person"] } }, orderBy: [{ tourSlug: "asc" }, { ss: "asc" }] });
  const slugs = [...new Set(rows.map((r) => r.tourSlug))];
  const tours = await prisma.tour.findMany({ where: { slug: { in: slugs } }, select: { slug: true, name: true } });
  const images: Record<string, ScanImages[]> = {};
  await Promise.all(
    slugs.map(async (slug) => {
      const m = await modelOf(slug).catch(() => null);
      images[slug] = m ? await fetchScanImages(m.modelId).catch(() => []) : [];
    })
  );
  return rows.map((r) => {
    const img = images[r.tourSlug]?.find((s) => s.sweepId === r.sweepId);
    const t = img?.high ?? img?.low;
    // The wall with the person first.
    const order = r.face ? [r.face, ...[1, 2, 3, 4].filter((f) => f !== r.face)] : [1, 2, 3, 4];
    return { slug: r.tourSlug, tour: tours.find((x) => x.slug === r.tourSlug)?.name ?? r.tourSlug, sweepId: r.sweepId, ss: r.ss, status: r.status, face: r.face, note: r.note, images: t ? order.map((f) => t.replace("<face>", String(f))) : [] };
  });
}

/** Hide the scan in the tour (saved as a new version) - or keep it. */
export async function decideScan(slug: string, sweepId: string, decision: "hide" | "keep" | "undo"): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await admin();
  const check = await prisma.tourScanCheck.findUnique({ where: { tourSlug_sweepId: { tourSlug: slug, sweepId } } });
  if (!check) return { ok: false, error: "Scannet findes ikke." };
  const tour = await prisma.tour.findUnique({ where: { slug }, select: { config: true } });
  if (!tour) return { ok: false, error: "Touren findes ikke." };
  const config = tour.config as unknown as TourConfig;
  const hidden = new Set(config.hiddenSweeps ?? []);
  const wasHidden = hidden.has(sweepId);
  if (decision === "hide") hidden.add(sweepId);
  if (decision === "undo" && check.status === "hidden") hidden.delete(sweepId);
  if (hidden.has(sweepId) !== wasHidden) {
    const next = { ...config, hiddenSweeps: [...hidden] } as unknown as Prisma.InputJsonValue;
    await prisma.tour.update({
      where: { slug },
      data: { config: next, versions: { create: { config: next, note: `${decision === "hide" ? "Skjulte" : "Viste igen"} scan ${check.ss} (person i billedet)`, createdByName: user.name } } },
    });
    tourChanged(slug);
  }
  await prisma.tourScanCheck.update({ where: { id: check.id }, data: { status: decision === "hide" ? "hidden" : decision === "keep" ? "kept" : "person", decidedBy: decision === "undo" ? null : user.name } });
  return { ok: true };
}
