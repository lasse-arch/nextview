import type { TourConfig } from "@/app/arpo/tour-lab/tours/types";

/*
 * Is a tour setup whole - every part the editor and the tour read has the
 * right shape? Used before saving and on everything Claude makes, so a
 * malformed setup never reaches the tour or breaks the editor.
 */

const str = (v: unknown) => typeof v === "string";
const arr = (v: unknown) => Array.isArray(v);
const obj = (v: unknown) => Boolean(v) && typeof v === "object" && !Array.isArray(v);

export function tourConfigProblem(config: unknown): string | null {
  if (!obj(config)) return "Opsætningen skal være et objekt.";
  const c = config as Partial<TourConfig>;
  for (const key of ["brand", "title", "start", "logo", "font"] as const) if (!str(c[key])) return `"${key}" skal være tekst.`;
  if (!c.brand || !c.title || !c.font) return 'Mangler "brand", "title" eller "font".';
  if (!c.modelId && !String(c.tourPage ?? "").startsWith("https://explore.nextview360.dk/")) return "Touren skal være forbundet til en Matterport-model eller et explore.nextview360.dk-link.";
  if (!obj(c.colors) || !(["main", "accent", "accentDark", "soft"] as const).every((k) => str(c.colors![k]))) return '"colors" skal have main, accent, accentDark og soft.';
  if (!arr(c.menu)) return '"menu" skal være en liste.';
  for (const m of c.menu!) {
    if (!obj(m) || !str(m.title)) return "Et menupunkt mangler sin titel.";
    if ("items" in m) {
      if (!arr(m.items) || !m.items.every((i) => arr(i) && i.length === 2 && str(i[0]) && str(i[1]))) return `Gruppen "${m.title}" skal have steder som [navn, link].`;
    } else if (!str((m as { href?: unknown }).href)) return `Menupunktet "${m.title}" mangler et link.`;
  }
  if (!arr(c.cta) || !c.cta!.every((b) => obj(b) && str(b.label) && str(b.href))) return '"cta" skal være en liste af knapper med label og href.';
  if (!obj(c.menuOpenOnStart)) return 'Mangler "menuOpenOnStart".';
  if (!arr(c.hiddenSweeps) || !arr(c.points) || !obj(c.categories) || !obj(c.matterportParams)) return 'Mangler "hiddenSweeps", "points", "categories" eller "matterportParams".';
  if (c.navigation !== "free" && c.navigation !== "points") return '"navigation" skal være "free" eller "points".';
  if (c.welcome && (!obj(c.welcome) || !arr(c.welcome.tiles) || !c.welcome.tiles.every((t) => obj(t) && str(t.title) && obj(t.go)))) return "Velkomstens fliser har en forkert form.";
  if (c.cover && (!obj(c.cover) || !["kicker", "title", "lead", "image", "enter", "placesTitle"].every((k) => str((c.cover as Record<string, unknown>)[k])))) return "Forsiden mangler tekster eller billede.";
  if (c.places && (!arr(c.places) || !c.places.every((p) => obj(p) && str(p.name) && str(p.href) && str(p.image)))) return "Et sted mangler navn, link eller foto.";
  if (c.dock && (!arr(c.dock) || !c.dock.every((d) => obj(d) && str(d.label) && (str(d.go) || obj(d.go))))) return "Bunden (dock) har en forkert form.";
  if (c.guide && (!obj(c.guide) || !arr(c.guide.stops))) return "Rundvisningen skal have en liste af stop.";
  if (c.day && (!obj(c.day) || !arr(c.day.steps))) return "Dagen skal have en liste af tidspunkter.";
  if (c.placeCards && (!arr(c.placeCards) || !c.placeCards.every((p) => obj(p) && arr(p.ss) && str(p.title) && str(p.text)))) return "Et stedkort mangler punkt, overskrift eller tekst.";
  if (c.nudge && (!obj(c.nudge) || typeof c.nudge.afterSeconds !== "number" || !arr(c.nudge.buttons))) return '"Din plads venter" har en forkert form.';
  if (c.design && (!obj(c.design) || !["tiles", "cover", "simple", "none"].includes(c.design.welcome) || !["side", "dock", "picker", "simple", "bento"].includes(c.design.menu))) return '"design" skal have welcome (tiles/cover/simple/none) og menu (side/dock/picker/simple/bento).';
  if (c.languages !== undefined && (!arr(c.languages) || !c.languages.every(str))) return '"languages" skal være en liste af sprogkoder.';
  if (c.translations !== undefined && (!obj(c.translations) || !Object.values(c.translations).every((m) => obj(m) && Object.values(m as object).every(str)))) return '"translations" skal være sprog med tekst -> oversættelse.';
  if (c.embeds && (!obj(c.embeds) || (c.embeds.pages !== undefined && (!obj(c.embeds.pages) || !Object.values(c.embeds.pages).every(str))))) return '"embeds.pages" skal være steder med en adresse.';
  return null;
}
