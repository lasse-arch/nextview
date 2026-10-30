import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSettingValue } from "@/lib/integration-settings";
import { canEmbed } from "@/lib/link-embed";
import { fetchLiveUnits } from "@/lib/availability/live";
import { tourPanoramas } from "@/lib/tour-pano-copies";
import { claudeCostUsd } from "@/lib/claude-cost";
import { loadTour } from "@/app/arpo/tour-lab/[slug]/load";
import { guideStops } from "@/app/arpo/tour-lab/tours/places";
import { allGuides, imageOfHref, isPlaceHref, pointOfHref } from "@/app/arpo/tour-lab/tours/places";
import { translatableTexts } from "@/app/arpo/tour-lab/tours/i18n";
import type { TourConfig } from "@/app/arpo/tour-lab/tours/types";

/*
 * "Tjek touren" before it goes to the customer for review: is it quick (the
 * 360° photos have their smaller copies, no huge pictures, pictures kept with
 * us), and does everything work (every place in the menu, tiles, guide and
 * cards is a scan point that exists, links out answer, live data finds
 * something, the contact form has somewhere to send to, translations are
 * complete) - and nextviewAI's own look at it, when it's set up.
 */

export type CheckItem = { level: "ok" | "warn" | "fejl"; area: "Hastighed" | "Funktioner" | "Indhold"; text: string };

const ssOf = (href: string) => {
  const m = /[?&]ss=(\d+)/.exec(href);
  return m ? Number(m[1]) : null;
};

/** Where a link is used, for the message ("Menu: Spisesalen"). */
function linksIn(c: TourConfig): { where: string; href: string }[] {
  const out: { where: string; href: string }[] = [];
  out.push({ where: "Start", href: c.start });
  for (const m of c.menu) {
    if ("items" in m) for (const [n, h] of m.items) out.push({ where: `Menu: ${m.title} › ${n}`, href: h });
    else out.push({ where: `Menu: ${m.title}`, href: m.href });
  }
  for (const t of c.welcome?.tiles ?? []) {
    if ("room" in t.go) out.push({ where: `Velkomst: ${t.title}`, href: t.go.room });
    if ("href" in t.go) out.push({ where: `Velkomst: ${t.title}`, href: t.go.href });
  }
  for (const b of c.cta) out.push({ where: `Knap: ${b.label}`, href: b.href });
  for (const p of c.places ?? []) out.push({ where: `Sted: ${p.name}`, href: p.href });
  for (const p of c.points) {
    if (p.tour) out.push({ where: `Punkt: ${p.name}`, href: p.tour });
    if (p.button?.href) out.push({ where: `Punkt: ${p.name} (knap)`, href: p.button.href });
  }
  for (const g of allGuides(c)) for (const s of guideStops(c, g.id)) if (s.href) out.push({ where: `${g.title}: ${s.title}`, href: s.href });
  for (const s of c.day?.steps ?? []) if (s.href) out.push({ where: `Dagen: ${s.title}`, href: s.href });
  for (const card of c.placeCards ?? []) for (const b of card.buttons ?? []) if ("href" in b) out.push({ where: `Stedkort: ${card.title} (knap)`, href: b.href });
  for (const b of c.nudge?.buttons ?? []) out.push({ where: `Kort efter et stykke tid: ${b.label}`, href: b.href });
  for (const t of c.bento?.tiles ?? []) out.push({ where: `Flise: ${t.title.replace(/\n/g, " ")}`, href: t.href });
  return out.filter((l) => l.href);
}

/** The pictures the tour shows (not the 360° photos - they're checked by their copies). */
function picturesIn(c: TourConfig): { where: string; url: string }[] {
  const out: { where: string; url: string }[] = [];
  if (c.cover?.image) out.push({ where: "Forsidebillede", url: c.cover.image });
  for (const t of c.welcome?.tiles ?? []) if (t.image) out.push({ where: `Velkomstflise: ${t.title}`, url: t.image });
  for (const p of c.places ?? []) out.push({ where: `Sted: ${p.name}`, url: p.image });
  for (const p of c.points) for (const img of p.images ?? []) out.push({ where: `Punkt: ${p.name}`, url: img });
  if (c.map?.image && !c.map.panorama) out.push({ where: "Kortet", url: c.map.image });
  return out.filter((p) => p.url);
}

async function answers(url: string): Promise<number | "down"> {
  try {
    let res = await fetch(url, { method: "HEAD", redirect: "follow", cache: "no-store", signal: AbortSignal.timeout(7000) });
    // Some sites don't answer HEAD - ask properly before calling it broken.
    if (res.status === 405 || res.status === 403 || res.status === 501) res = await fetch(url, { redirect: "follow", cache: "no-store", signal: AbortSignal.timeout(8000) });
    return res.status;
  } catch {
    return "down";
  }
}

export async function checkTour(c: TourConfig, opts: { ai?: boolean } = {}): Promise<{ items: CheckItem[]; ai: string | null }> {
  const items: CheckItem[] = [];
  const add = (level: CheckItem["level"], area: CheckItem["area"], text: string) => items.push({ level, area, text });

  /* --- Hastighed --- */
  const panos = tourPanoramas(c);
  const noCopies = panos.filter((u) => !c.panoCopies?.[u]);
  if (!panos.length) add("ok", "Hastighed", "Ingen store 360°-billeder at gøre mindre.");
  else if (noCopies.length) add("warn", "Hastighed", `${noCopies.length} af ${panos.length} store billeder mangler deres mindre kopier, så de loader langsomt på mobil. Gem touren, og vent et minut, så laves de.`);
  else add("ok", "Hastighed", `Alle ${panos.length} store billeder har mindre kopier til mobil og computer.`);

  const pictures = picturesIn(c);
  const ours = (u: string) => u.startsWith("/") || /\.public\.blob\.vercel-storage\.com\//.test(u);
  const outside = pictures.filter((p) => !ours(p.url));
  if (outside.length) add("warn", "Hastighed", `${outside.length} billede${outside.length === 1 ? "" : "r"} hentes fra en anden side (fx ${outside[0].where}) - langsommere, og de kan forsvinde. Brug "Gem alle filer hos os" under Avanceret.`);
  const files = await prisma.tourFile.findMany({
    where: { tourSlug: c.slug, OR: [{ url: { in: pictures.map((p) => p.url) } }, { id: { in: pictures.map((p) => /^\/api\/tour-files\/([\w-]+)$/.exec(p.url)?.[1]).filter((x): x is string => Boolean(x)) } }] },
    select: { id: true, url: true, size: true },
  });
  const sizeOf = (u: string) => files.find((f) => f.url === u || u === `/api/tour-files/${f.id}`)?.size ?? null;
  const big = pictures.filter((p) => (sizeOf(p.url) ?? 0) > 2_500_000);
  if (big.length) add("warn", "Hastighed", `${big.length} billede${big.length === 1 ? " er" : "r er"} over 2,5 MB (fx ${big[0].where}, ${((sizeOf(big[0].url) ?? 0) / 1e6).toFixed(1)} MB) - det mærkes på mobil. Upload ${big.length === 1 ? "det" : "dem"} i en mindre udgave.`);
  else if (pictures.length) add("ok", "Hastighed", "Ingen af billederne er for store.");

  /* --- Funktioner --- */
  const loaded = await loadTour(c).catch(() => null);
  if (!loaded?.modelId) add("fejl", "Funktioner", "Touren er ikke koblet til en Matterport-model - der er ingen scanning at vise.");
  const links = linksIn(c);
  const places = links.filter((l) => isPlaceHref(l.href));
  if (loaded && places.length && !Object.keys(loaded.sweepBySs).length) {
    // Nothing known about the scan at all: Matterport didn't answer just now - not 20 places that are wrong.
    add("warn", "Funktioner", "Scanningens punkter kunne ikke hentes fra Matterport lige nu, så stederne er ikke tjekket. Prøv igen om lidt.");
  } else if (loaded) {
    const missing = places.filter((l) => {
      const ss = ssOf(l.href);
      return ss != null && !loaded.sweepBySs[ss];
    });
    if (missing.length) for (const m of missing.slice(0, 8)) add("fejl", "Funktioner", `${m.where} peger på scanpunkt ${ssOf(m.href)}, som ikke findes i scanningen.`);
    else if (places.length) add("ok", "Funktioner", `Alle ${places.length} steder i menu, velkomst, guide og kort findes i scanningen.`);
  }
  const points = links.filter((l) => pointOfHref(l.href));
  const badPoints = points.filter((l) => !c.points.some((p) => p.id === pointOfHref(l.href)));
  for (const b of badPoints.slice(0, 5)) add("fejl", "Funktioner", `${b.where} peger på et punkt, der ikke findes længere.`);
  for (const g of c.guide?.stops ?? []) if ("point" in g && !c.points.some((p) => p.id === g.point)) add("fejl", "Funktioner", `"Vis mig rundt" har et stop ved et punkt, der ikke findes længere (${g.point}).`);

  // Links out of the tour: do they answer?
  const outsideLinks = [...new Map(links.filter((l) => /^https?:\/\//.test(l.href) && !isPlaceHref(l.href) && !imageOfHref(l.href)).map((l) => [l.href, l])).values()].slice(0, 25);
  const statuses = await Promise.all(outsideLinks.map(async (l) => ({ l, s: await answers(l.href) })));
  let broken = statuses.filter((x) => x.s === "down" || (typeof x.s === "number" && x.s >= 400));
  // Not one answered: it's our connection just now, not every link the tour has.
  if (statuses.length > 2 && statuses.every((x) => x.s === "down")) {
    add("warn", "Funktioner", "Linkene ud af touren kunne ikke tjekkes lige nu (ingen svarede). Prøv igen om lidt.");
    broken = [];
  }
  // Only "not there" (404/410) is certainly broken - booking systems often turn automatic checks away (403, 429, 500 …).
  for (const b of broken.slice(0, 8)) {
    const gone = b.s === 404 || b.s === 410;
    add(gone ? "fejl" : "warn", "Funktioner", `${b.l.where}: linket ${b.s === "down" ? "svarer ikke" : gone ? "findes ikke (fejl " + b.s + ")" : `svarede med fejl ${b.s} på tjekket - åbn det selv og se, at det virker`} (${b.l.href}).`);
  }
  if (outsideLinks.length && !broken.length && !statuses.every((x) => x.s === "down")) add("ok", "Funktioner", `Alle ${outsideLinks.length} links ud af touren virker.`);
  // Links meant to open over the tour that the site won't allow there (they open in a new tab instead).
  const reachable = !(statuses.length > 2 && statuses.every((x) => x.s === "down"));
  const popupLinks = outsideLinks.filter(() => reachable).filter((l) => (c.linkOpen?.byUrl?.[l.href] ?? c.linkOpen?.default) === "popup");
  const refusing = (await Promise.all(popupLinks.map(async (l) => ((await canEmbed(l.href).catch(() => true)) ? null : l)))).filter((l): l is { where: string; href: string } => l != null);
  if (refusing.length) add("warn", "Funktioner", `${refusing.length} link${refusing.length === 1 ? "" : "s"} kan ikke vises oven på touren (fx ${refusing[0].where}) og åbner i en ny fane i stedet.`);

  if (c.live) {
    const units = await fetchLiveUnits(c.live).catch(() => null);
    if (!units) add("fejl", "Funktioner", `Live data: siden ${c.live.url} kunne ikke læses.`);
    else if (!units.length) add("fejl", "Funktioner", "Live data finder ingenting på kundens side lige nu - tjek mønsteret under Live data.");
    else add("ok", "Funktioner", `Live data finder ${units.length} på kundens side (fx "${units[0].name}").`);
  }
  if (c.contactForm && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.contactForm.to ?? "")) add("fejl", "Funktioner", "Kontaktformularen har ingen gyldig e-mail at sende til.");
  for (const g of allGuides(c)) if (guideStops(c, g.id).length < 2) add("warn", "Indhold", `"${g.title}" har kun ${guideStops(c, g.id).length} stop.`);

  // Translations: every text in each language the tour offers.
  const langs = (c.languages ?? []).filter((l) => l !== "da");
  if (langs.length) {
    const texts = translatableTexts(c);
    for (const l of langs) {
      const dict = c.translations?.[l] ?? {};
      const miss = texts.filter((t) => !dict[t.trim()]).length;
      if (miss) add("warn", "Indhold", `${miss} tekst${miss === 1 ? "" : "er"} mangler på ${l.toUpperCase()} - oversæt igen under Sprog.`);
    }
  }
  if (!c.cta.length) add("warn", "Indhold", "Touren har ingen knap til næste skridt (fx Book, Kontakt).");

  const ai = opts.ai ? await aiLook(c, items).catch(() => null) : null;
  return { items, ai };
}

/** nextviewAI's own short look: what a visitor would stumble on, in a few lines (never the setup itself). */
async function aiLook(c: TourConfig, items: CheckItem[]): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY || (await getSettingValue("ANTHROPIC_API_KEY"));
  if (!key) return null;
  const client = new Anthropic({ apiKey: key });
  const Out = z.object({ notes: z.array(z.string()).max(6) });
  const res = await client.messages
    .stream({
      model: "claude-opus-5-5",
      max_tokens: 3000,
      system:
        "Du er nextviewAI i Nextview360's CRM. Du tjekker en virtuel tour (en JSON-opsætning) igennem, lige før kunden får den til gennemgang. Mobil først: 90 % ser den på en telefon. Skriv højst 6 korte, konkrete punkter på dansk om det, en besøgende ville støde på: tomme eller for lange tekster, stavefejl, et forvirrende første valg, steder uden navn, manglende næste skridt, for mange valg på mobil. Ingen ros, ingen gentagelse af tjeklisten, ingen teknisk snak om JSON. Er alt fint, så returnér en tom liste.",
      messages: [{ role: "user", content: `Tjekket har fundet:\n${items.map((i) => `- [${i.level}] ${i.text}`).join("\n")}\n\nOpsætningen:\n\`\`\`json\n${JSON.stringify({ ...c, translations: undefined, panoCopies: undefined, customCss: undefined })}\n\`\`\`` }],
      output_config: { effort: "low", format: zodOutputFormat(Out) },
    })
    .finalMessage();
  await prisma.tourAiUsage
    .create({ data: { tourSlug: c.slug, userName: "Tjek", kind: "check", inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens, cacheReadTokens: res.usage.cache_read_input_tokens ?? 0, cacheWriteTokens: res.usage.cache_creation_input_tokens ?? 0, costUsd: claudeCostUsd(res.usage) } })
    .catch(() => {});
  const notes = res.parsed_output?.notes ?? [];
  return notes.length ? notes.map((n) => `• ${n}`).join("\n") : "";
}
