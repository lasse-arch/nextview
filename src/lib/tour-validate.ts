import { riskyPattern } from "@/lib/availability/pattern-check";
import { safeColor, UNSAFE_SCHEME } from "@/app/arpo/tour-lab/tours/safe";
import type { Point3, TourConfig } from "@/app/arpo/tour-lab/tours/types";

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
  if (c.lockInHidden !== undefined && c.lockInHidden !== true) return '"lockInHidden" skal være true eller udeladt.';
  if (c.welcome && (!obj(c.welcome) || !arr(c.welcome.tiles) || !c.welcome.tiles.every((t) => obj(t) && str(t.title) && obj(t.go)))) return "Velkomstens fliser har en forkert form.";
  if (c.cover && (!obj(c.cover) || !["kicker", "title", "lead", "image", "enter", "placesTitle"].every((k) => str((c.cover as Record<string, unknown>)[k])))) return "Forsiden mangler tekster eller billede.";
  const ld = c.lineDays;
  if (ld !== undefined) {
    const stopOk = (x: unknown) => {
      const st = x as { id?: unknown; time?: unknown; title?: unknown; people?: unknown; tags?: unknown; href?: unknown; images?: unknown };
      return obj(x) && str(st.id) && str(st.time) && str(st.title) && (st.href === undefined || str(st.href)) &&
        (st.people === undefined || (arr(st.people) && (st.people as unknown[]).length <= 4 && (st.people as unknown[]).every((p) => obj(p) && str((p as { image?: unknown }).image)))) &&
        (st.tags === undefined || (arr(st.tags) && (st.tags as unknown[]).every(str))) &&
        (st.images === undefined || (arr(st.images) && (st.images as unknown[]).length <= 3 && (st.images as unknown[]).every((u) => str(u) && /^(https?:\/\/|\/)/.test(u as string))));
    };
    if (!obj(ld) || !str(ld.title) || !arr(ld.shared) || !arr(ld.lines)) return "En dag på linjen skal have en overskrift, fælles stop og linjer.";
    if (!ld.shared.every(stopOk)) return "Et fælles stop mangler id, tidspunkt eller overskrift.";
    const sharedIds = new Set(ld.shared.map((x) => x.id));
    for (const l of ld.lines) {
      if (!obj(l) || !str(l.id) || !str(l.name) || !arr(l.day)) return "En linje mangler id, navn eller sin dag.";
      if (l.people !== undefined && (!arr(l.people) || l.people.length > 4 || !l.people.every((p) => obj(p) && str(p.image)))) return `${l.name}: højst 4 lærere, hver med et billede.`;
      if (l.trips !== undefined && (!arr(l.trips) || l.trips.length > 6 || !l.trips.every((t) => obj(t) && str(t.title) && (t.image === undefined || (str(t.image) && /^(https?:\/\/|\/)/.test(t.image)))))) return `${l.name}: højst 6 rejser, hver med en titel.`;
      for (const d of l.day) {
        if (typeof d === "string") {
          if (!sharedIds.has(d)) return `${l.name}: dagen peger på et fælles stop, der ikke findes ("${d}").`;
        } else if (!stopOk(d)) return `${l.name}: et stop mangler id, tidspunkt eller overskrift.`;
      }
    }
    if (ld.visit !== undefined && (!obj(ld.visit) || !str(ld.visit.title) || !str(ld.visit.label) || !str(ld.visit.href))) return "Afslutningen skal have overskrift, knaptekst og link.";
  }
  const sp = c.sitePlan;
  if (sp !== undefined) {
    const pct = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= -50 && v <= 150;
    if (!obj(sp) || !str(sp.image) || !str(sp.label)) return "Pladskortet mangler billede eller knaptekst.";
    if (sp.overlay !== undefined && (!obj(sp.overlay) || !arr(sp.overlay.corners) || sp.overlay.corners.length !== 4 || !sp.overlay.corners.every((p) => arr(p) && p.length === 2 && pct(p[0]) && pct(p[1])) || (sp.overlay.opacity !== undefined && !(typeof sp.overlay.opacity === "number" && sp.overlay.opacity >= 0.2 && sp.overlay.opacity <= 1))))
      return "Pladskortet over luftfotoet skal have fire hjørner (x, y i %) og en gennemsigtighed mellem 0,2 og 1.";
    if (sp.units !== undefined && (!arr(sp.units) || sp.units.length > 1000 || !sp.units.every((u) => obj(u) && str(u.id) && str(u.name) && pct(u.x) && pct(u.y) && (u.tour === undefined || str(u.tour)) && (u.cat === undefined || str(u.cat)))))
      return "Pladserne på pladskortet skal have id, navn og placering (x, y i %).";
    if (sp.unitCats !== undefined && (!obj(sp.unitCats) || !Object.values(sp.unitCats as Record<string, unknown>).every((v) => obj(v) && ["label", "color", "tour"].every((k) => (v as Record<string, unknown>)[k] === undefined || str((v as Record<string, unknown>)[k])))))
      return "Pladskortets slags har en forkert form.";
    if (sp.nextStay !== undefined && (!obj(sp.nextStay) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(sp.nextStay.tenantId)) || (sp.nextStay.book !== undefined && !/^https:\/\//i.test(String(sp.nextStay.book)))))
      return "Next-Stay skal have bookingens id (fra online.next-stay-booking.dk/search/…) og et https-link til Book.";
  }
  if (c.cover?.video !== undefined && (!obj(c.cover.video) || !str(c.cover.video.src) || (c.cover.video.srcMobile !== undefined && !str(c.cover.video.srcMobile)))) return "Filmen bag forsiden har en forkert form.";
  if (c.wayfinding?.skip !== undefined && (!arr(c.wayfinding.skip) || !c.wayfinding.skip.every(str))) return "Find vejs fravalgte steder har en forkert form.";
  if (c.welcome?.video !== undefined && (!obj(c.welcome.video) || !str(c.welcome.video.src) || (c.welcome.video.srcMobile !== undefined && !str(c.welcome.video.srcMobile)) || (c.welcome.video.size !== undefined && !["small", "medium", "large"].includes(c.welcome.video.size)) || (c.welcome.video.place !== undefined && !["bottom", "center", "top", "bottom-left", "bottom-right"].includes(c.welcome.video.place)) || (c.welcome.video.sizeMobile !== undefined && !["small", "medium", "large"].includes(c.welcome.video.sizeMobile)) || (c.welcome.video.placeMobile !== undefined && !["bottom", "center", "top"].includes(c.welcome.video.placeMobile)))) return "Filmen bag fliserne har en forkert form.";
  if (c.places && (!arr(c.places) || !c.places.every((p) => obj(p) && str(p.name) && str(p.href) && str(p.image)))) return "Et sted mangler navn, link eller foto.";
  if (c.dock && (!arr(c.dock) || !c.dock.every((d) => obj(d) && str(d.label) && (str(d.go) || obj(d.go))))) return "Bunden (dock) har en forkert form.";
  if (c.guide && (!obj(c.guide) || !arr(c.guide.stops))) return "Rundvisningen skal have en liste af stop.";
  if (c.guides !== undefined) {
    if (!arr(c.guides)) return "De ekstra rundvisninger skal være en liste.";
    const ids = new Set<string>();
    for (const g of c.guides) {
      if (!obj(g) || !str(g.id) || !g.id.trim() || !str(g.title) || !arr(g.stops)) return "Hver ekstra rundvisning skal have id, navn og en liste af stop.";
      if (ids.has(g.id)) return `To rundvisninger har samme id ("${g.id}").`;
      ids.add(g.id);
    }
  }
  if (c.day && (!obj(c.day) || !arr(c.day.steps))) return "Dagen skal have en liste af tidspunkter.";
  if (c.placeCards && (!arr(c.placeCards) || !c.placeCards.every((p) => obj(p) && arr(p.ss) && str(p.title) && str(p.text)))) return "Et stedkort mangler punkt, overskrift eller tekst.";
  if (c.placeCards?.some((p) => p.people != null && (!arr(p.people) || p.people.length > 3 || !p.people.every((x) => obj(x) && str(x.image) && (x.name == null || str(x.name)) && (x.role == null || str(x.role))))))
    return "Personer på et stedkort: højst 3, hver med et billede.";
  if (c.nudge && (!obj(c.nudge) || typeof c.nudge.afterSeconds !== "number" || !arr(c.nudge.buttons))) return '"Din plads venter" har en forkert form.';
  if (c.design && (!obj(c.design) || !["tiles", "cover", "simple", "none"].includes(c.design.welcome) || !["side", "glass", "dock", "float", "picker", "simple", "bento"].includes(c.design.menu))) return '"design" skal have welcome (tiles/cover/simple/none) og menu (side/glass/dock/float/picker/simple/bento).';
  if (c.contact?.hours !== undefined && (!arr(c.contact.hours) || c.contact.hours.length > 10 || !c.contact.hours.every((h) => obj(h) && typeof h.days === "string" && typeof h.time === "string")))
    return "Åbningstiderne skal være højst 10 rækker med dage og tid.";
  if (c.classes !== undefined) {
    const k = c.classes;
    if (!obj(k) || !str(k.source) || !/^https:\/\/profile\.flexybox\.com\//.test(k.source)) return 'Holdplanen skal have kundens Flexybox-link (https://profile.flexybox.com/…).';
    if (k.department !== undefined && (typeof k.department !== "string" || !/^[0-9a-f-]{36}$/i.test(k.department))) return "Holdplanen: centeret har en forkert form.";
    if ([k.room, k.title, k.button, k.bookHref].some((v) => v !== undefined && typeof v !== "string")) return "Holdplanen: sal, overskrift, knap og link skal være tekst.";
  }
  if (c.team !== undefined) {
    if (!obj(c.team) || !arr(c.team.people) || c.team.people.length > 30) return '"Personer" skal være en liste (højst 30).';
    const ids = new Set<string>();
    for (const p of c.team.people) {
      if (!obj(p) || !str(p.id) || !/^[a-z0-9-]{1,40}$/.test(p.id) || !str(p.image) || typeof p.name !== "string") return "En person mangler id, navn eller foto.";
      if (ids.has(p.id)) return `To personer har samme id ("${p.id}").`;
      ids.add(p.id);
      if ([p.role, p.bio, p.quote, p.ask, p.href, p.video].some((v) => v !== undefined && typeof v !== "string")) return `${p.name || p.id}: rolle, tekst, citat, sted og video skal være tekst.`;
    }
  }
  if (c.inUse?.some((i) => (i.images !== undefined && (!arr(i.images) || i.images.length > 12 || !i.images.every(str))) || (i.button !== undefined && (!obj(i.button) || typeof i.button.label !== "string" || typeof i.button.href !== "string"))))
    return '"Se det i brug": højst 12 billeder, og knappen skal have tekst og link.';
  if (c.languages !== undefined && (!arr(c.languages) || !c.languages.every(str))) return '"languages" skal være en liste af sprogkoder.';
  if (c.translations !== undefined && (!obj(c.translations) || !Object.values(c.translations).every((m) => obj(m) && Object.values(m as object).every(str)))) return '"translations" skal være sprog med tekst -> oversættelse.';
  if (c.embeds && (!obj(c.embeds) || (c.embeds.pages !== undefined && (!obj(c.embeds.pages) || !Object.values(c.embeds.pages).every(str))))) return '"embeds.pages" skal være steder med en adresse.';
  if (c.intro !== undefined && (!obj(c.intro) || !arr(c.intro.sources) || !c.intro.sources.length || !c.intro.sources.every((v) => obj(v) && str(v.src) && v.src.trim() !== "")))
    return "Filmen før touren mangler sin fil.";
  const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);
  if (c.staging !== undefined) {
    if (!arr(c.staging) || c.staging.length > 40) return "Virtual staging skal være en liste (højst 40).";
    for (const it of c.staging) {
      if (!obj(it) || !str(it.id) || !["video", "image", "iframe", "sign", "yearwheel", "treasure"].includes(it.kind)) return "Et staging-element har en ukendt type.";
      if (!arr(it.corners) || it.corners.length !== 4 || !it.corners.every((p) => obj(p) && num(p.x) && num(p.y) && num(p.z))) return "Et staging-element skal have fire hjørner.";
      if (!arr(it.ss) || !it.ss.every((n) => Number.isInteger(n))) return "Et staging-element skal vises fra scanpunkter (tal).";
      if (it.place !== undefined) {
        const p3 = (v: unknown) => obj(v) && num((v as Point3).x) && num((v as Point3).y) && num((v as Point3).z);
        if (!obj(it.place) || !p3(it.place.center) || !p3(it.place.normal) || !num(it.place.w) || !num(it.place.h) || it.place.w <= 0 || it.place.h <= 0 || it.place.w > 20 || it.place.h > 20)
          return "Et staging-element har en ugyldig placering eller størrelse.";
      }
      if (it.kind === "iframe" && !/^https:\/\//i.test(String(it.src ?? ""))) return "En hjemmeside i staging skal være et https-link.";
      if ((it.kind === "video" || it.kind === "image") && !str(it.src)) return "En video eller et billede i staging mangler sin fil.";
      if (it.contest !== undefined && (!obj(it.contest) || typeof it.contest.prize !== "string" || it.contest.prize.length > 80 || (it.contest.ends !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(String(it.contest.ends))) || (it.contest.keepDays !== undefined && !(Number.isInteger(it.contest.keepDays) && it.contest.keepDays >= 1 && it.contest.keepDays <= 365))))
        return "En skattekistes lodtrækning er ugyldig (præmie, dato eller dage).";
      if (it.action !== undefined && (!obj(it.action) || !str(it.action.label) || !str(it.action.href))) return "Knappen på et staging-element skal have tekst og link.";
      if (it.stand !== undefined && (!obj(it.stand) || (it.stand.lift !== undefined && !(num(it.stand.lift) && it.stand.lift >= 0 && it.stand.lift <= 10)))) return "\"Stil op i rummet\" har en ugyldig højde over gulvet (0-10 m).";
    }
  }
  const sk = c.schedule;
  if (sk !== undefined) {
    if (!obj(sk) || !str(sk.title) || !arr(sk.days) || !arr(sk.blocks) || !arr(sk.slots)) return "Skemaet skal have en overskrift, dage, fagblokke og timer.";
    if (!sk.days.length || sk.days.length > 7 || !sk.days.every(str)) return "Skemaet skal have 1-7 dage.";
    if (sk.periods !== undefined && (!arr(sk.periods) || sk.periods.length > 6 || !sk.periods.every((p) => obj(p) && str(p.id) && str(p.name)))) return "Skemaets perioder skal have id og navn (højst 6).";
    if (sk.daily !== undefined && (!arr(sk.daily) || sk.daily.length > 12 || !sk.daily.every((d) => obj(d) && str(d.time) && str(d.title)))) return "Skemaets faste punkter hver dag skal have tid og titel (højst 12).";
    if (sk.blocks.length > 20 || sk.slots.length > 150) return "Skemaet har for mange fagblokke (højst 20) eller timer (højst 150).";
    const periodOk = (v: unknown) => v === undefined || (arr(v) && v.every(str));
    for (const b of sk.blocks) {
      if (!obj(b) || !str(b.id) || !str(b.name) || !arr(b.subjects) || b.subjects.length > 30) return "En fagblok mangler id, navn eller sine fag (højst 30).";
      for (const x of b.subjects) {
        if (!obj(x) || !str(x.id) || !str(x.name)) return `${b.name}: et fag mangler id eller navn.`;
        if (x.images !== undefined && (!arr(x.images) || x.images.length > 12 || !x.images.every(str))) return `${x.name}: højst 12 billeder.`;
        if (x.people !== undefined && (!arr(x.people) || x.people.length > 4 || !x.people.every((p) => obj(p) && str(p.image)))) return `${x.name}: højst 4 lærere, hver med et billede.`;
        if ((x.href !== undefined && !str(x.href)) || (x.video !== undefined && !str(x.video)) || !periodOk(x.periods)) return `${x.name}: sted, film eller perioder har en forkert form.`;
      }
    }
    const blockIds = new Set(sk.blocks.map((b) => b.id));
    for (const t of sk.slots) {
      if (!obj(t) || !Number.isInteger(t.day) || t.day < 0 || t.day >= sk.days.length || !str(t.from)) return "En time i skemaet mangler dag eller tidspunkt.";
      if (t.block !== undefined ? !blockIds.has(t.block) : !str(t.title)) return "En time i skemaet skal være en fagblok, der findes, eller have en titel.";
      if (!periodOk(t.periods) || (t.href !== undefined && !str(t.href))) return "En time i skemaet har forkerte perioder eller sted.";
    }
    if (sk.visit !== undefined && (!obj(sk.visit) || !str(sk.visit.label) || !str(sk.visit.href))) return "Skemaets knap skal have tekst og link.";
  }
  if (c.yearWheel !== undefined) {
    const w = c.yearWheel;
    if (!obj(w) || !str(w.title) || !arr(w.months)) return "Årshjulet skal have en titel og en liste af måneder.";
    if (!w.months.every((m) => obj(m) && Number.isInteger(m.month) && m.month >= 1 && m.month <= 12 && arr(m.events) && m.events.every((e) => obj(e) && str(e.title))))
      return "Årshjulets måneder skal være 1-12, og hver begivenhed skal have en titel.";
    if (w.cta !== undefined && (!obj(w.cta) || !str(w.cta.label) || !str(w.cta.href))) return "Årshjulets afslutning skal have knaptekst og link.";
  }
  // Live data's pattern runs on outside pages: one that backtracks without end could hang the server.
  const live = (c as { live?: { pattern?: unknown } }).live;
  if (live && typeof live.pattern === "string" && riskyPattern(live.pattern)) return "Live data-mønsteret har en gentagelse inde i en gentagelse (fx (a+)+) - det kan låse serveren. Skriv det enklere.";
  // Untrusted text (developers, nextviewAI, the customer's site): no link that runs code, no colour that isn't a colour.
  const bad = unsafeStrings(c);
  if (bad) return `Et link må ikke starte med ${bad.split(":")[0]}: (${bad.slice(0, 40)}).`;
  for (const [name, cat] of Object.entries((c.categories ?? {}) as Record<string, { color?: unknown }>))
    if (cat && obj(cat) && cat.color !== undefined && safeColor(cat.color, "") === "") return `Kategorien "${name}" har en ugyldig farve.`;
  return null;
}

/** The first string anywhere in the setup that is a javascript:/vbscript:/data:/file:/blob: link - images as data:image/… are fine. */
function unsafeStrings(v: unknown): string | null {
  if (typeof v === "string") return UNSAFE_SCHEME.test(v) && !/^\s*data:image\/(png|jpe?g|webp|gif|avif);/i.test(v) ? v : null;
  if (Array.isArray(v)) {
    for (const x of v) {
      const b = unsafeStrings(x);
      if (b) return b;
    }
  } else if (v && typeof v === "object") {
    for (const x of Object.values(v)) {
      const b = unsafeStrings(x);
      if (b) return b;
    }
  }
  return null;
}
