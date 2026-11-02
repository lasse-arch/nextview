"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "../tours/i18n-react";
import { shownGuides, guideStops, startPlaces } from "../tours/places";
import type { TourConfig } from "../tours/types";

/*
 * "Det kan jeres tour": the first time a customer opens their tour on the
 * review link, a short walk through the smart features this very tour has -
 * each with a small animation of how it looks, in the tour's colours and with
 * its own names, and "Prøv det" to try it right away. "Vis ikke igen" keeps it
 * away on this device.
 */

/**
 * "Fremvisning" (the showcase link /vis/<token>): the tour shown to a new
 * customer. The walk-through then says what a Nextview360 tour does, not what
 * we've built for them, opens every time, and ends with who to call.
 */
export type DemoContact = {
  /** The link's own token - what happens on it is measured on its own (/api/tour-demo-events). */
  token: string;
  name?: string;
  email?: string;
  phone?: string;
  /** The tour is out with its customer - otherwise the walk-through says it's still being made. */
  finished?: boolean;
};

type Feature = { key: string; title: string; text: string; why?: string; scene: React.ReactNode; action?: () => void; actionLabel?: string; kicker?: string };

const fire = (name: string, detail?: unknown) => window.dispatchEvent(detail === undefined ? new Event(name) : new CustomEvent(name, { detail }));
const seenKey = (slug: string) => `hv-features-seen:${slug}`;

export function featuresSeen(slug: string): boolean {
  try {
    return localStorage.getItem(seenKey(slug)) === "1";
  } catch {
    return false;
  }
}

/** The tour's smart features, in the order a visitor meets them. */
function featuresOf(T: TourConfig, tr: (s: string, v?: Record<string, string | number>) => string, demo?: DemoContact): Feature[] {
  const places = startPlaces(T).map((p) => p.name);
  const somewhere = places[Math.min(2, places.length - 1)] ?? tr("Spisesalen");
  const guides = shownGuides(T).filter((g) => guideStops(T, g.id).length);
  const out: Feature[] = [];
  const pano = T.map?.panorama || T.drone;
  if (pano || T.map)
    out.push({
      key: "luften",
      title: pano ? tr("Hele stedet fra luften - i 360°") : tr("Hele stedet på et kort"),
      text: tr("Se det hele fra oven, tryk på et punkt for at læse om stedet, og gå direkte ind derfra."),
      scene: (
        <div className="ft-scene ft-luft">
          {[[22, 58], [48, 40], [70, 62], [36, 74]].map(([x, y], i) => (
            <i key={i} className="ft-pin" style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${i * 0.35}s` }} />
          ))}
          <b className="ft-pin-kort">{T.points?.[0]?.name ?? somewhere}</b>
        </div>
      ),
      action: () => fire("hv-gaa-til", { href: "#luften", label: "" }),
      actionLabel: tr("Se luftfotoet"),
    });
  for (const g of guides.slice(0, 2)) {
    const n = guideStops(T, g.id).length;
    out.push({
      key: `guide-${g.id ?? "main"}`,
      title: g.id == null ? tr("Vis mig rundt") : g.title,
      text: tr("En rundvisning af sig selv: touren går fra sted til sted ({n} stop) og fortæller undervejs - som en rundvisning med en medarbejder.", { n }),
      scene: (
        <div className="ft-scene ft-guide">
          <div className="ft-guide-kort">
            <span>1 / {n}</span>
            <b>{guideStops(T, g.id)[0]?.title ?? somewhere}</b>
            <i />
          </div>
        </div>
      ),
      action: () => fire("hv-rundvisning", g.id),
      actionLabel: tr("Start rundvisningen"),
    });
  }
  if (T.stories?.mobile || T.stories?.desktop)
    out.push({
      key: "stories",
      title: tr("Historier"),
      text: tr("Rummene som kort nederst - tryk Afspil, så går touren selv fra rum til rum."),
      scene: (
        <div className="ft-scene ft-stories">
          {places.slice(0, 5).map((p, i) => (
            <span key={i} style={{ animationDelay: `${i * 0.15}s` }}>
              {p.slice(0, 1)}
            </span>
          ))}
        </div>
      ),
    });
  if (T.wayfinding)
    out.push({
      key: "findvej",
      title: tr("Find vej"),
      text: tr("Vælg et rum - fx {sted} - så går touren selv vejen derhen fra der, hvor man står.", { sted: somewhere }),
      scene: (
        <div className="ft-scene ft-vej">
          <svg viewBox="0 0 200 110" aria-hidden>
            <path d="M20 95 L20 55 L110 55 L110 25 L178 25" />
          </svg>
          <b>{somewhere}</b>
        </div>
      ),
      action: () => fire("hv-findvej"),
      actionLabel: tr("Prøv Find vej"),
    });
  if (T.live)
    out.push({
      key: "live",
      title: T.live.title || tr("Live data"),
      text: tr("Hentes direkte fra jeres hjemmeside og er altid opdateret - gæsterne ser det, mens de kigger rundt."),
      scene: (
        <div className="ft-scene ft-live">
          <span>
            <i /> {T.live.title || tr("Ledige pladser")}
          </span>
        </div>
      ),
      action: () => fire("hv-live"),
      actionLabel: tr("Se listen"),
    });
  if (T.placeCards?.length)
    out.push({
      key: "cards",
      title: tr("Stedkort"),
      text: tr("Når man kommer ind i et rum, dukker et lille kort op med det vigtigste om stedet - og en knap videre."),
      scene: (
        <div className="ft-scene ft-cards">
          <div>
            <b>{T.placeCards[0].title}</b>
            <span />
            <span />
          </div>
        </div>
      ),
    });
  if (T.commute)
    out.push({
      key: "vej",
      title: T.commute.title || tr("Hvor langt har du til os?"),
      text: tr("Gæsten skriver sin adresse og ser afstanden og tiden i bil, på cykel og med bus."),
      scene: (
        <div className="ft-scene ft-commute">
          <span>🚗 12 min</span>
          <span>🚲 31 min</span>
          <span>🚌</span>
        </div>
      ),
      action: () => fire("hv-vej"),
      actionLabel: tr("Prøv det"),
    });
  if (T.day)
    out.push({
      key: "dag",
      title: T.day.title,
      text: tr("Dagen trin for trin - og \"Se stedet\" viser, hvor det foregår."),
      scene: (
        <div className="ft-scene ft-dag">
          {T.day.steps.slice(0, 3).map((s, i) => (
            <span key={i} style={{ animationDelay: `${i * 0.5}s` }}>
              <b>{s.time}</b> {s.title}
            </span>
          ))}
        </div>
      ),
      action: () => fire("hv-dag"),
      actionLabel: tr("Se dagen"),
    });
  if (T.finder)
    out.push({
      key: "finder",
      title: tr("Find din plads"),
      text: tr("Et par spørgsmål - så viser touren det sted, der passer bedst."),
      scene: (
        <div className="ft-scene ft-finder">
          <span>?</span>
          <span>?</span>
          <span>★</span>
        </div>
      ),
      action: () => fire("hv-find"),
      actionLabel: tr("Prøv det"),
    });
  if (T.cover?.video?.src || T.welcome?.video?.src || T.intro)
    out.push({
      key: "film",
      title: tr("Starter med film"),
      text: tr("Touren åbner med en film af stedet - fx dronefilmen - så første indtryk er levende, mens touren gør sig klar."),
      scene: (
        <div className="ft-scene ft-film">
          <i />
          <span>▶</span>
        </div>
      ),
    });
  if (T.lineDays?.lines.length)
    out.push({
      key: "linjedag",
      title: T.lineDays.title || tr("En dag på din linje"),
      text: tr("Gæsten vælger en linje ({n} at vælge imellem) og følger en hel dag - hvor de er, hvem de møder, og hvad de laver.", { n: T.lineDays.lines.length }),
      scene: (
        <div className="ft-scene ft-dag">
          {T.lineDays.lines.slice(0, 3).map((l, i) => (
            <span key={l.id} style={{ animationDelay: `${i * 0.5}s` }}>
              <b>{i + 1}</b> {l.name}
            </span>
          ))}
        </div>
      ),
      action: () => fire("hv-linjedag"),
      actionLabel: tr("Prøv det"),
    });
  if (T.yearWheel)
    out.push({
      key: "aarshjul",
      title: tr("Årshjulet"),
      text: tr("Hele året på ét hjul - drej det og se, hvad der sker måned for måned."),
      scene: (
        <div className="ft-scene ft-hjul">
          <i />
        </div>
      ),
      action: () => fire("hv-aarshjul"),
      actionLabel: tr("Drej hjulet"),
    });
  if (T.sitePlan?.units?.length)
    out.push({
      key: "pladskort",
      title: tr("Pladskort med ledige pladser"),
      text: tr("Pladserne ligger på luftfotoet, og gæsten ser, hvad der er ledigt på de datoer, de vælger - og kan booke direkte i touren."),
      scene: (
        <div className="ft-scene ft-luft">
          {[[24, 60], [40, 48], [58, 64], [74, 44]].map(([x, y], i) => (
            <i key={i} className={`ft-pin ${i % 2 ? "ft-optaget" : ""}`} style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${i * 0.35}s` }} />
          ))}
        </div>
      ),
    });
  if (T.staging?.length)
    out.push({
      key: "staging",
      title: tr("Skærme og billeder i rummene"),
      text: tr("Film, billeder og skilte sat direkte på væggene i 3D - så rummene viser, hvordan de bruges, og knapper fører videre."),
      scene: (
        <div className="ft-scene ft-staging">
          <i>▶</i>
        </div>
      ),
    });
  if (T.contactForm)
    out.push({
      key: "kontakt",
      title: T.contactForm.title || tr("Skriv til os"),
      text: tr("Gæsten skriver direkte fra touren, mens lysten er der - beskeden lander i jeres indbakke."),
      scene: (
        <div className="ft-scene ft-cards">
          <div>
            <b>{T.contactForm.title || tr("Skriv til os")}</b>
            <span />
            <span />
          </div>
        </div>
      ),
      action: () => fire("hv-kontakt"),
      actionLabel: tr("Se formularen"),
    });
  if (T.info?.length)
    out.push({
      key: "info",
      title: tr("Punkter i rummene"),
      text: tr("Små punkter i 360°-billedet med fakta, billeder, video eller priser lige dér, hvor tingen står ({n} i touren).", { n: T.info.length }),
      scene: (
        <div className="ft-scene ft-luft">
          {[[30, 45], [62, 38], [48, 70]].map(([x, y], i) => (
            <i key={i} className="ft-pin" style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${i * 0.4}s` }} />
          ))}
        </div>
      ),
    });
  if (T.weather)
    out.push({
      key: "vejret",
      title: tr("Vejret lige nu"),
      text: tr("Luftfotoet viser vejret i {sted} lige nu - og hvordan det plejer at være i den måned, gæsten kommer.", { sted: T.weather.place }),
      scene: (
        <div className="ft-scene ft-commute">
          <span>☀️ 21°</span>
          <span>🌤 juli</span>
        </div>
      ),
      action: () => fire("hv-gaa-til", { href: "#luften", label: "" }),
      actionLabel: tr("Se vejret"),
    });
  if (T.points?.some((p) => p.walks?.length))
    out.push({
      key: "gaa",
      title: tr("Gåafstande"),
      text: tr("Ved stederne står, hvor mange minutter der er at gå - fx fra pladsen til stranden eller fra værelset til spisesalen."),
      scene: (
        <div className="ft-scene ft-commute">
          <span>🚶 3 min</span>
          <span>🚶 7 min</span>
        </div>
      ),
    });
  if (T.cta?.length)
    out.push({
      key: "knapper",
      title: tr("Book og kontakt - lige dér, man står"),
      text: tr("Knappen \"{knap}\" følger med hele vejen gennem touren, så der aldrig er langt fra at kigge til at tage kontakt.", { knap: T.cta.find((c) => c.primary)?.label ?? T.cta[0].label }),
      scene: (
        <div className="ft-scene ft-live">
          <span>{T.cta.find((c) => c.primary)?.label ?? T.cta[0].label} →</span>
        </div>
      ),
    });
  if ((T.languages ?? []).length)
    out.push({
      key: "sprog",
      title: tr("På flere sprog"),
      text: tr("Touren findes også på {n} andre sprog - gæsten vælger selv.", { n: (T.languages ?? []).length }),
      scene: (
        <div className="ft-scene ft-sprog">
          <span>DA</span>
          {(T.languages ?? []).slice(0, 3).map((l) => (
            <span key={l}>{l.toUpperCase()}</span>
          ))}
        </div>
      ),
    });
  // Why each one is there - what it does for them, not just what it is.
  for (const f of out) f.why = whyOf(f.key, tr);
  if (demo) {
    // To a new customer: what this tour does, then what comes with every tour - and who to call.
    out.unshift({
      key: "intro",
      kicker: "Nextview360",
      title: `Sådan arbejder touren for ${T.brand || T.title}`,
      text: demo.finished
        ? `Her kan I se en tour, vi har lavet for ${T.brand || T.title}. En virtuel tour er mere end 360°-billeder: hver funktion er med for at føre gæsterne et skridt videre - at forstå stedet, få lyst og tage kontakt. Gå funktionerne igennem, og prøv dem selv undervejs.`
        : `Her kan I se en tour, vi er i gang med til ${T.brand || T.title}. Den er ikke afleveret endnu og ikke færdigtestet - den er her for at give jer en fornemmelse af, hvad vi laver. Hver funktion er med for at føre gæsterne et skridt videre: at forstå stedet, få lyst og tage kontakt. Gå funktionerne igennem, og prøv dem selv undervejs.`,
      scene: (
        <div className="ft-scene ft-intro">
          {out.slice(0, 6).map((f, i) => (
            <span key={f.key} style={{ animationDelay: `${0.15 + i * 0.12}s` }}>
              {f.title}
            </span>
          ))}
        </div>
      ),
    });
    out.push({
      key: "overalt",
      title: "På mobil, computer og jeres hjemmeside",
      text: "Touren er bygget til mobilen først - hvor de fleste kigger - og ligger lige så godt på computeren og direkte inde på jeres egen hjemmeside, med et link til hvert sted i den.",
      scene: (
        <div className="ft-scene ft-overalt">
          <i className="ft-mobil" />
          <i className="ft-skaerm" />
        </div>
      ),
    });
    const have = new Set(out.map((f) => f.key.replace(/^guide-.*/, "guide")));
    const more = CAN_ALSO.filter(([k]) => !have.has(k)).map(([, t]) => t);
    if (more.length)
      out.push({
        key: "ogsaa",
        title: "Det kan vi også lave til jer",
        text: "Touren her har ikke det hele med. Hver tour bygges til stedet - så den har det, der hjælper netop jeres gæster videre.",
        scene: (
          <div className="ft-scene ft-intro">
            {more.slice(0, 8).map((t, i) => (
              <span key={t} style={{ animationDelay: `${0.1 + i * 0.1}s` }}>
                {t}
              </span>
            ))}
          </div>
        ),
      });
    out.push({
      key: "portal",
      title: "Vi bliver ved med at gøre den bedre",
      text: "Vi kan se, hvor gæsterne kigger, hvad de klikker på, og hvor mange der tager kontakt. Det bruger vi til løbende at rette touren til - så I får mere af det, der virker og skaffer henvendelser.",
      why: "En tour er ikke færdig, når den er afleveret. Tallene viser, hvad jeres gæster faktisk bruger - og dér gør vi den stærkere.",
      scene: (
        <div className="ft-scene ft-portal">
          {[38, 62, 48, 80, 70, 92].map((h, i) => (
            <i key={i} style={{ height: `${h}%`, animationDelay: `${i * 0.12}s` }} />
          ))}
        </div>
      ),
    });
    return out;
  }
  if (!out.length) return out;
  // First: what we've made for them, and that everything in it is there for a reason.
  out.unshift({
    key: "intro",
    kicker: tr("Første udkast til jer"),
    title: tr("Det har vi bygget til {navn}", { navn: T.brand || T.title }),
    text: tr("Touren er mere end billeder. Hver funktion er med for at hjælpe jeres gæster et skridt videre: at forstå stedet, få lyst og tage kontakt. Her er, hvad den kan - og hvorfor vi har taget det med."),
    scene: (
      <div className="ft-scene ft-intro">
        {out.slice(0, 6).map((f, i) => (
          <span key={f.key} style={{ animationDelay: `${0.15 + i * 0.12}s` }}>
            {f.title}
          </span>
        ))}
      </div>
    ),
  });
  return out;
}

/** Everything a tour can have - for the showcase's "Det kan vi også lave til jer" (those this tour hasn't got). */
const CAN_ALSO: [string, string][] = [
  ["luften", "Hele stedet fra luften i 360°"],
  ["guide", "Rundvisning med stemme"],
  ["findvej", "Find vej til rummene"],
  ["live", "Ledige pladser live"],
  ["pladskort", "Pladskort med booking"],
  ["cards", "Stedkort"],
  ["info", "Punkter med fakta og video"],
  ["dag", "Sådan ser en dag ud"],
  ["linjedag", "En dag på din linje"],
  ["aarshjul", "Årshjul"],
  ["finder", "Find din plads"],
  ["vej", "Hvor langt har du til os?"],
  ["staging", "Skærme og billeder i rummene"],
  ["kontakt", "Skriv til os i touren"],
  ["film", "Start med dronefilm"],
  ["vejret", "Vejret lige nu"],
  ["sprog", "Flere sprog"],
  ["stories", "Historier som på Instagram"],
];

/** "Derfor er det med" - the reason behind each feature, in the customer's terms. */
function whyOf(key: string, tr: (s: string, v?: Record<string, string | number>) => string): string | undefined {
  if (key.startsWith("guide-")) return tr("Mange klikker ikke selv rundt. Rundvisningen tager dem i hånden og viser det vigtigste i den rigtige rækkefølge - så de ser det, I er stolte af.");
  const why: Record<string, string> = {
    luften: tr("Gæster vil først forstå, hvor alt ligger. Overblikket fra luften giver dem det på få sekunder - og gør det let at vælge, hvor de vil hen."),
    stories: tr("Det korte format, folk kender fra Instagram: hurtigt at se, og de bliver hængende længere i jeres tour."),
    findvej: tr("Find vej viser vejen fra der, hvor man står, til fx et lokale, man aldrig har været i - så nye elever, gæster eller kunder kender vejen i en stor bygning, før de kommer. Og ingen farer vild eller giver op i touren."),
    live: tr("Når gæsterne kan se, hvad der er ledigt lige nu, er der kortere vej fra at kigge til at booke."),
    cards: tr("Billeder fortæller ikke alt. Kortet giver de vigtigste fakta lige dér, hvor man står - og en vej videre til at booke eller spørge."),
    vej: tr("Afstanden afgør tit, om man vælger jer. Her ser de selv, hvor tæt på de er - uden at skulle spørge."),
    dag: tr("Det gør det nemt at forestille sig selv hos jer - og det er dét, der får folk til at tage næste skridt."),
    finder: tr("I stedet for at lede selv får gæsten et svar, der passer til dem - færre spørgsmål til jer og hurtigere beslutninger."),
    info: tr("Gæster har spørgsmål til det, de ser. Svaret står lige dér - så de ikke skal lede på hjemmesiden eller ringe."),
    vejret: tr("Solskin på billedet og vejret lige nu gør stedet levende - og giver lyst til at komme."),
    gaa: tr("Afstande er tit det, folk spørger om. Her ser de det med det samme."),
    knapper: tr("Lysten er størst, mens man kigger. Én knap, der altid er der, gør det let at tage næste skridt."),
    sprog: tr("Gæster fra udlandet får touren på deres eget sprog - så I når flere uden ekstra arbejde."),
  };
  return why[key];
}

export function FeatureTour({ T, onClose, onEvent, demo }: { T: TourConfig; onClose: () => void; onEvent: (name: string, params?: Record<string, string | number>) => void; demo?: DemoContact }) {
  const tr = useT();
  const all = featuresOf(T, tr, demo);
  const [at, setAt] = useState(0);
  const [never, setNever] = useState(false);
  /** "Se det hele i aktion": the step of the showreel playing (the tour shows each feature itself), or null. */
  const [reel, setReel] = useState<number | null>(null);
  const shown = useRef<number | null>(null);
  // Everything the cards say (not just what can be shown in the tour), in the same order - the intro left out, and in a
  // showcase the last card too: that one (with who to call) comes as the walk-through's own card at the end.
  const steps = all.slice(1, demo ? -1 : undefined);
  const step = reel != null ? steps[reel] : null;
  /** On to the next feature - or, after the last, back to the walk-through's last card (in a showcase: who to call). */
  const advance = (r: number) => {
    if (r + 1 < steps.length) return setReel(r + 1);
    fire("hv-luk-alt");
    shown.current = null;
    onEvent("features_reel_done", { label: `${steps.length}` });
    setReel(null);
    setAt(all.length - 1);
  };
  // Each step: everything else closed, the feature opened in the tour - and it stays there until the visitor presses Næste
  // (a guided tour goes from room to room by itself meanwhile; the showreel never moves on by itself).
  useEffect(() => {
    if (!step || reel == null || shown.current === reel) return;
    shown.current = reel;
    fire("hv-luk-alt");
    if (!step.action) return;
    const go = window.setTimeout(() => step.action!(), 350);
    return () => window.clearTimeout(go);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a new step
  }, [reel]);
  if (!all.length) return null;
  if (step)
    return (
      <div className="ft-reel" role="status">
        <p className="ft-kick">
          {demo ? "Det kan touren" : tr("Det kan jeres tour")} · {reel! + 1} / {steps.length}
        </p>
        {!step.action && <div className="ft-reel-scene">{step.scene}</div>}
        <b>{step.title}</b>
        <span>{step.text}</span>
        {step.why && (
          <span className="ft-reel-hvorfor">
            <b>{tr("Derfor er det med")}</b> {step.why}
          </span>
        )}
        <div className="ft-reel-knapper">
          <button type="button" disabled={reel === 0} onClick={() => setReel(Math.max(0, reel! - 1))}>
            ← {tr("Tilbage")}
          </button>
          <button type="button" onClick={() => advance(reel!)}>
            {tr("Næste")} →
          </button>
          <button
            type="button"
            onClick={() => {
              onEvent("features_reel_stop", { label: `${reel! + 1}/${steps.length}` });
              setReel(null);
              shown.current = null;
              fire("hv-luk-alt");
            }}
          >
            {tr("Udforsk selv")}
          </button>
        </div>
      </div>
    );
  const f = all[Math.min(at, all.length - 1)];
  const close = () => {
    if (never)
      try {
        localStorage.setItem(seenKey(T.slug), "1");
      } catch {
        /* private window */
      }
    onEvent("features_close", { seen: at + 1, of: all.length, label: `${at + 1}/${all.length}` });
    onClose();
  };
  return (
    <div className="ft-bg" role="dialog" aria-modal="true" aria-label={tr("Det kan jeres tour")}>
      <div className="ft-ark">
        <button type="button" className="ft-x" aria-label={tr("Luk")} onClick={close}>
          ×
        </button>
        <p className="ft-kick">
          {f.kicker ?? (demo ? "Det kan touren" : tr("Det kan jeres tour"))} · {at + 1} / {all.length}
        </p>
        <div key={f.key} className="ft-slide">
          {f.scene}
          <h2>{f.title}</h2>
          <p>{f.text}</p>
          {f.why && (
            <div className="ft-hvorfor">
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3Z" />
              </svg>
              <span>
                <b>{tr("Derfor er det med")}</b>
                {f.why}
              </span>
            </div>
          )}
          {at === 0 && steps.some((x) => x.action) && (
            <button
              type="button"
              className="ft-reel-start"
              onClick={() => {
                onEvent("features_reel", { label: `${steps.length}` });
                setReel(0);
              }}
            >
              ▶ {demo ? "Se det hele i aktion" : tr("Se det hele i aktion")}
            </button>
          )}
          {at === 0 && (
            <button type="button" className="ft-selv" onClick={close}>
              {tr("Udforsk selv")}
            </button>
          )}
          {demo && at === all.length - 1 && <DemoContactCard demo={demo} onContact={(how) => onEvent("demo_contact", { label: how })} />}
          {!demo && at === all.length - 1 && <p className="ft-sidst">{tr("Er der noget, I vil have ændret? Tryk \"Giv feedback\" i touren, og skriv det dér, hvor I står.")}</p>}
        </div>
        <div className="ft-dots" aria-hidden>
          {all.map((x, i) => (
            <i key={x.key} className={i === at ? "on" : ""} />
          ))}
        </div>
        <div className="ft-knapper">
          {f.action && (
            <button
              type="button"
              className="ft-prov"
              onClick={() => {
                onEvent("features_try", { feature: f.key, label: f.title });
                close();
                setTimeout(() => f.action!(), 250);
              }}
            >
              {f.actionLabel}
            </button>
          )}
          {at < all.length - 1 ? (
            <button
              type="button"
              className="ft-naeste"
              onClick={() => {
                onEvent("features_step", { label: all[at + 1].title });
                setAt(at + 1);
              }}
            >
              {tr("Næste")} →
            </button>
          ) : (
            <button type="button" className="ft-naeste" onClick={close}>
              {demo ? tr("Udforsk selv") : tr("Se touren")}
            </button>
          )}
        </div>
        {!demo && (
          <label className="ft-aldrig">
            <input type="checkbox" checked={never} onChange={(e) => setNever(e.target.checked)} /> {tr("Vis ikke igen")}
          </label>
        )}
      </div>
    </div>
  );
}

/** The end of the showcase: who sent it, and the way to them. Always Nextview360's colours - it's us talking, not the tour. */
function DemoContactCard({ demo, onContact }: { demo: DemoContact; onContact: (how: string) => void }) {
  const tel = demo.phone?.replace(/[^\d+]/g, "");
  return (
    <div className="ft-demo-kontakt">
      <b>Skal jeres sted vises sådan?</b>
      <span>
        {demo.name ? `${demo.name} fra Nextview360` : "Nextview360"} viser jer gerne, hvordan en tour vil se ud hos jer.
      </span>
      <div>
        {tel && (
          <a href={`tel:${tel}`} onClick={() => onContact("Ring")}>
            📞 {demo.phone}
          </a>
        )}
        <a onClick={() => onContact("Skriv")} href={demo.email ? `mailto:${demo.email}?subject=${encodeURIComponent("Virtuel tour")}` : "https://nextview360.dk/#kontakt"} target={demo.email ? undefined : "_blank"} rel="noopener">
          {demo.email ? "Skriv til os" : "Kontakt os"}
        </a>
      </div>
    </div>
  );
}

export const FEATURES_CSS = `
.ft-bg{position:absolute;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(8,14,18,.55);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);animation:hvFade .3s ease}
.ft-ark{position:relative;width:min(460px,100%);max-height:calc(100% - 24px);overflow-y:auto;background:#fff;border-radius:26px;padding:22px 22px 16px;box-shadow:0 24px 60px rgba(0,0,0,.35);color:#1d2a30;animation:hvUp .4s cubic-bezier(.2,.7,.2,1)}
.ft-x{position:absolute;right:14px;top:14px;width:34px;height:34px;border:0;border-radius:50%;background:#f2f2f2;font-size:20px;cursor:pointer;color:#1d2a30}
.ft-kick{margin:0 44px 12px 2px;font-size:11.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--c-accent)}
.ft-slide{animation:ftIn .35s ease}
@keyframes ftIn{from{opacity:0;transform:translateX(14px)}to{opacity:1;transform:none}}
.ft-slide h2{margin:16px 2px 6px;font-size:22px;line-height:1.15;font-weight:900;color:var(--c-main)}
.ft-slide p{margin:0 2px;font-size:15px;line-height:1.5;color:#3d4a50}
.ft-dots{display:flex;justify-content:center;gap:6px;margin:16px 0 12px}
.ft-dots i{width:7px;height:7px;border-radius:999px;background:#dfe3e5;transition:all .25s}
.ft-dots i.on{width:22px;background:var(--c-accent)}
.ft-knapper{display:flex;gap:8px}
.ft-knapper button{flex:1;border:0;border-radius:999px;padding:12px 14px;font:inherit;font-weight:800;font-size:15px;cursor:pointer}
.ft-prov{background:var(--c-accent);color:#fff}
.ft-naeste{background:#eef1f2;color:#1d2a30}
.ft-hvorfor{display:flex;gap:11px;align-items:flex-start;margin:14px 2px 0;padding:12px 14px;border-radius:16px;background:color-mix(in srgb,var(--c-accent) 9%,#fff);border:1px solid color-mix(in srgb,var(--c-accent) 22%,transparent);font-size:14px;line-height:1.45;color:#2b383e}
.ft-hvorfor svg{flex:none;width:22px;height:22px;margin-top:1px;fill:none;stroke:var(--c-accent);stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.ft-hvorfor b{display:block;margin-bottom:2px;font-size:11.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--c-accent)}
.ft-sidst{margin-top:12px!important;font-size:13.5px!important;color:#6b7a80!important}
.ft-intro{display:flex;flex-wrap:wrap;align-content:center;justify-content:center;gap:7px;padding:14px;background:linear-gradient(135deg,var(--c-main),color-mix(in srgb,var(--c-main) 60%,var(--c-accent)))!important}
.ft-intro span{padding:6px 11px;border-radius:999px;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis;background:rgba(255,255,255,.95);color:var(--c-main);font-size:12.5px;font-weight:800;box-shadow:0 4px 14px rgba(0,0,0,.15);opacity:0;animation:ftChip .45s cubic-bezier(.2,.8,.3,1.3) forwards}
@keyframes ftChip{from{opacity:0;transform:translateY(8px) scale(.9)}to{opacity:1;transform:none}}
.ft-aldrig{display:flex;align-items:center;justify-content:center;gap:7px;margin-top:12px;font-size:13px;color:#6b7a80;cursor:pointer}
.ft-aldrig input{accent-color:var(--c-accent)}
/* The little scenes - drawn in the tour's own colours. */
.ft-scene{position:relative;height:150px;border-radius:18px;overflow:hidden;background:linear-gradient(160deg,color-mix(in srgb,var(--c-main) 85%,#fff),var(--c-main))}
.ft-luft{background:radial-gradient(circle at 30% 70%,#7fa86a 0 20%,transparent 21%),radial-gradient(circle at 70% 40%,#90b47a 0 18%,transparent 19%),linear-gradient(180deg,#9cc3e6 0 30%,#6f9a5c 30%)}
.ft-pin{position:absolute;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;background:var(--c-accent);box-shadow:0 0 0 3px #fff;animation:ftPin 2.4s ease-in-out infinite}
@keyframes ftPin{0%,100%{transform:scale(1)}20%{transform:scale(1.35)}40%{transform:scale(1)}}
.ft-pin-kort{position:absolute;left:50%;bottom:12px;translate:-50% 0;background:#fff;border-radius:999px;padding:6px 12px;font-size:12.5px;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,.2);animation:ftPop 2.4s ease-in-out infinite}
@keyframes ftPop{0%,15%{opacity:0;transform:translateY(6px)}25%,85%{opacity:1;transform:none}100%{opacity:0}}
.ft-guide{display:flex;align-items:flex-end;padding:12px}
.ft-guide-kort{width:100%;background:#fff;border-radius:14px;padding:10px 12px;animation:ftUp 3s ease-in-out infinite}
.ft-guide-kort span{display:block;font-size:11px;font-weight:800;color:var(--c-accent)}
.ft-guide-kort b{display:block;margin:2px 0 8px;font-size:15px;color:var(--c-main)}
.ft-guide-kort i{display:block;height:4px;border-radius:4px;background:#eef1f2;overflow:hidden;position:relative}
.ft-guide-kort i::after{content:"";position:absolute;inset:0;background:var(--c-accent);transform-origin:left;animation:ftBar 3s linear infinite}
@keyframes ftUp{0%{transform:translateY(20px);opacity:0}12%,88%{transform:none;opacity:1}100%{opacity:0}}
@keyframes ftBar{from{transform:scaleX(0)}to{transform:scaleX(1)}}
.ft-stories{display:flex;align-items:flex-end;gap:8px;padding:14px}
.ft-stories span{flex:none;width:52px;height:66px;border-radius:12px;border:2px solid color-mix(in srgb,var(--c-accent) 70%,#fff);background:rgba(255,255,255,.15);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:20px;animation:ftStory 3s ease-in-out infinite}
@keyframes ftStory{0%,100%{transform:translateY(0)}30%{transform:translateY(-8px)}}
.ft-vej{background:linear-gradient(180deg,#eef1f2,#dfe5e7)}
.ft-vej svg{position:absolute;inset:10px 10px 18px;width:calc(100% - 20px);height:calc(100% - 28px)}
.ft-vej path{fill:none;stroke:var(--c-accent);stroke-width:5;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:300;stroke-dashoffset:300;animation:ftDraw 3s ease-in-out infinite}
@keyframes ftDraw{0%{stroke-dashoffset:300}60%,100%{stroke-dashoffset:0}}
.ft-vej b{position:absolute;right:12px;top:10px;background:var(--c-main);color:#fff;border-radius:999px;padding:5px 11px;font-size:12px}
.ft-live{display:flex;align-items:flex-start;justify-content:flex-end;padding:14px}
.ft-live span{display:flex;align-items:center;gap:7px;background:#fff;border-radius:999px;padding:8px 13px;font-size:13px;font-weight:700;color:#1d2a30;box-shadow:0 6px 16px rgba(0,0,0,.2)}
.ft-live i{width:9px;height:9px;border-radius:50%;background:#34c759;animation:ftPulse 1.6s ease-in-out infinite}
@keyframes ftPulse{0%,100%{box-shadow:0 0 0 0 rgba(52,199,89,.6)}50%{box-shadow:0 0 0 7px rgba(52,199,89,0)}}
.ft-cards{display:flex;align-items:flex-end;padding:12px}
.ft-cards div{width:70%;background:#fff;border-radius:14px;padding:10px 12px;animation:ftUp 3.2s ease-in-out infinite}
.ft-cards b{display:block;font-size:14px;color:var(--c-main);margin-bottom:6px}
.ft-cards span{display:block;height:6px;border-radius:4px;background:#eef1f2;margin-top:5px}
.ft-cards span+span{width:60%}
.ft-commute,.ft-sprog,.ft-finder{display:flex;align-items:center;justify-content:center;gap:8px;padding:14px}
.ft-commute span,.ft-sprog span{background:#fff;border-radius:12px;padding:10px 12px;font-size:14px;font-weight:800;color:#1d2a30;animation:ftStory 2.6s ease-in-out infinite}
.ft-commute span:nth-child(2),.ft-sprog span:nth-child(2){animation-delay:.3s}
.ft-commute span:nth-child(3),.ft-sprog span:nth-child(3){animation-delay:.6s}
.ft-finder span{width:46px;height:46px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:900;color:var(--c-accent);animation:ftStory 2.4s ease-in-out infinite}
.ft-finder span:nth-child(2){animation-delay:.3s}.ft-finder span:nth-child(3){animation-delay:.6s}
.ft-dag{display:flex;flex-direction:column;justify-content:center;gap:7px;padding:14px 18px}
.ft-dag span{background:#fff;border-radius:10px;padding:7px 11px;font-size:13px;color:#1d2a30;animation:ftUp 3s ease-in-out infinite both}
.ft-dag b{color:var(--c-accent);margin-right:6px}
.ft-optaget{background:#c9ced1!important}
.ft-film{display:flex;align-items:center;justify-content:center;background:linear-gradient(120deg,#3c6e8f,#6f9a5c 60%,#c9a86a)!important}
.ft-film i{position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.18),transparent);animation:ftSweep 3s linear infinite}
@keyframes ftSweep{from{transform:translateX(-100%)}to{transform:translateX(100%)}}
.ft-film span{width:54px;height:54px;border-radius:50%;background:rgba(255,255,255,.92);display:flex;align-items:center;justify-content:center;padding-left:4px;color:var(--c-main);font-size:20px;animation:ftStory 2.6s ease-in-out infinite}
.ft-hjul{display:flex;align-items:center;justify-content:center}
.ft-hjul i{width:110px;height:110px;border-radius:50%;background:conic-gradient(var(--c-accent) 0 30deg,#fff 30deg 60deg,color-mix(in srgb,var(--c-accent) 55%,#fff) 60deg 90deg,#fff 90deg 120deg,var(--c-accent) 120deg 150deg,#fff 150deg 180deg,color-mix(in srgb,var(--c-accent) 55%,#fff) 180deg 210deg,#fff 210deg 240deg,var(--c-accent) 240deg 270deg,#fff 270deg 300deg,color-mix(in srgb,var(--c-accent) 55%,#fff) 300deg 330deg,#fff 330deg);box-shadow:0 0 0 6px rgba(255,255,255,.25);animation:ftSpin 8s linear infinite}
@keyframes ftSpin{to{transform:rotate(360deg)}}
.ft-staging{display:flex;align-items:center;justify-content:center;background:linear-gradient(180deg,#d9d2c5,#bfb5a4)!important}
.ft-staging i{width:46%;aspect-ratio:16/9;border-radius:6px;background:linear-gradient(135deg,var(--c-main),var(--c-accent));display:flex;align-items:center;justify-content:center;color:#fff;font-style:normal;font-size:20px;box-shadow:0 10px 24px rgba(0,0,0,.25);transform:perspective(300px) rotateY(-14deg);animation:ftStory 3s ease-in-out infinite}
.ft-portal{display:flex;align-items:flex-end;gap:9px;padding:18px 22px 16px;background:linear-gradient(180deg,#f4f6f7,#e6ebed)!important}
.ft-portal i{flex:1;border-radius:6px 6px 2px 2px;background:var(--c-accent);transform-origin:bottom;animation:ftGrow 2.8s ease-in-out infinite both}
@keyframes ftGrow{0%{transform:scaleY(.15)}35%,85%{transform:none}100%{transform:scaleY(.15)}}
.ft-demo-kontakt{margin:14px 2px 0;padding:14px;border-radius:16px;background:#0d1b20;color:#fff}
.ft-demo-kontakt b{display:block;font-size:16px;margin-bottom:3px}
.ft-demo-kontakt span{display:block;font-size:13.5px;line-height:1.45;color:rgba(255,255,255,.78)}
.ft-demo-kontakt div{display:flex;flex-wrap:wrap;gap:8px;margin-top:11px}
.ft-demo-kontakt a{flex:1;min-width:120px;text-align:center;white-space:nowrap;border-radius:999px;padding:10px 12px;background:#fff;color:#0d1b20;font-weight:800;font-size:14px;text-decoration:none}
.ft-demo-kontakt a+a{background:rgba(255,255,255,.14);color:#fff}
/* "Se det hele i aktion": the tour plays its features, a caption at the bottom says what's shown. */
.ft-reel-start{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;margin-top:14px;border:0;border-radius:14px;padding:13px 14px;background:linear-gradient(135deg,var(--c-main),color-mix(in srgb,var(--c-main) 55%,var(--c-accent)));color:#fff;font:inherit;font-weight:800;font-size:15px;cursor:pointer;box-shadow:0 8px 22px color-mix(in srgb,var(--c-main) 35%,transparent)}
.ft-reel-start small{font-weight:600;opacity:.75}
.ft-selv{display:block;width:100%;margin-top:8px;border:0;background:none;padding:6px;font:inherit;font-weight:700;font-size:14px;color:var(--c-main);text-decoration:underline;text-underline-offset:3px;cursor:pointer}
.ft-reel{position:absolute;left:50%;bottom:calc(16px + env(safe-area-inset-bottom,0px));translate:-50% 0;z-index:62;width:min(520px,calc(100% - 24px));padding:12px 14px 10px;border-radius:18px;background:rgba(13,27,32,.9);color:#fff;box-shadow:0 14px 40px rgba(0,0,0,.35);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);animation:hvUp .35s ease}
.ft-reel .ft-kick{margin:6px 0 2px;color:color-mix(in srgb,var(--c-accent) 70%,#fff)}
.ft-reel b{display:block;font-size:17px;line-height:1.2}
.ft-reel span{display:block;margin-top:3px;font-size:13.5px;line-height:1.4;color:rgba(255,255,255,.82)}
.ft-reel-bar{height:3px;border-radius:3px;background:rgba(255,255,255,.18);overflow:hidden}
.ft-reel-bar i{display:block;height:100%;background:var(--c-accent);transform-origin:left;animation:ftBar linear forwards}
.ft-reel-knapper{display:flex;gap:6px;margin-top:9px}
.ft-reel-knapper button:disabled{opacity:.35}
.ft-reel-scene{margin:8px 0 4px}
.ft-reel-scene .ft-scene{height:96px;border-radius:12px}
.ft-reel-hvorfor{margin-top:8px!important;padding:8px 10px;border-radius:12px;background:rgba(255,255,255,.08);font-size:13px!important}
.ft-reel-hvorfor b{display:inline!important;font-size:11px!important;letter-spacing:.08em;text-transform:uppercase;color:color-mix(in srgb,var(--c-accent) 70%,#fff);margin-right:4px}
@media (max-width:760px){.ft-reel{max-height:calc(100% - 90px);overflow-y:auto}}
.ft-reel-knapper button{flex:1;border:0;border-radius:999px;padding:8px 10px;background:rgba(255,255,255,.14);color:#fff;font:inherit;font-weight:700;font-size:13px;cursor:pointer}
.ft-reel-knapper button:nth-child(2){background:var(--c-accent)}
.ft-overalt{display:flex;align-items:flex-end;justify-content:center;gap:14px;padding:18px}
.ft-mobil{width:44px;height:84px;border-radius:10px;border:4px solid #fff;background:linear-gradient(160deg,#9cc3e6,#6f9a5c);animation:ftStory 3s ease-in-out infinite}
.ft-skaerm{width:150px;height:96px;border-radius:8px;border:5px solid #fff;background:linear-gradient(160deg,#9cc3e6,#6f9a5c);animation:ftStory 3s ease-in-out .4s infinite}
/* The showcase's own button to see the features again. */
.ft-igen{position:absolute;left:50%;bottom:calc(18px + env(safe-area-inset-bottom,0px));translate:-50% 0;z-index:45;white-space:nowrap;display:flex;align-items:center;gap:7px;border:0;border-radius:999px;padding:10px 16px;background:rgba(13,27,32,.88);color:#fff;font:inherit;font-weight:800;font-size:14px;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.3);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);animation:hvUp .4s ease}
.ft-igen i{width:8px;height:8px;border-radius:50%;background:var(--c-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--c-accent) 35%,transparent)}
@media (prefers-reduced-motion:reduce){.ft-scene *{animation:none!important}.ft-intro span{opacity:1}}
@media (max-height:500px) and (min-width:500px){.ft-ark{zoom:var(--ui-zoom,.72)}}
`;
