"use client";

import { useState } from "react";
import { useT } from "../tours/i18n-react";
import { allGuides, guideStops, startPlaces } from "../tours/places";
import type { TourConfig } from "../tours/types";

/*
 * "Det kan jeres tour": the first time a customer opens their tour on the
 * review link, a short walk through the smart features this very tour has -
 * each with a small animation of how it looks, in the tour's colours and with
 * its own names, and "Prøv det" to try it right away. "Vis ikke igen" keeps it
 * away on this device.
 */

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
function featuresOf(T: TourConfig, tr: (s: string, v?: Record<string, string | number>) => string): Feature[] {
  const places = startPlaces(T).map((p) => p.name);
  const somewhere = places[Math.min(2, places.length - 1)] ?? tr("Spisesalen");
  const guides = allGuides(T).filter((g) => guideStops(T, g.id).length);
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

/** "Derfor er det med" - the reason behind each feature, in the customer's terms. */
function whyOf(key: string, tr: (s: string, v?: Record<string, string | number>) => string): string | undefined {
  if (key.startsWith("guide-")) return tr("Mange klikker ikke selv rundt. Rundvisningen tager dem i hånden og viser det vigtigste i den rigtige rækkefølge - så de ser det, I er stolte af.");
  const why: Record<string, string> = {
    luften: tr("Gæster vil først forstå, hvor alt ligger. Overblikket fra luften giver dem det på få sekunder - og gør det let at vælge, hvor de vil hen."),
    stories: tr("Det korte format, folk kender fra Instagram: hurtigt at se, og de bliver hængende længere i jeres tour."),
    findvej: tr("På et stort sted er det let at fare vild i en 360°-tour. Find vej fører dem direkte hen til det, de leder efter - så de ikke giver op."),
    live: tr("Når gæsterne kan se, hvad der er ledigt lige nu, er der kortere vej fra at kigge til at booke."),
    cards: tr("Billeder fortæller ikke alt. Kortet giver de vigtigste fakta lige dér, hvor man står - og en vej videre til at booke eller spørge."),
    vej: tr("Afstanden afgør tit, om man vælger jer. Her ser de selv, hvor tæt på de er - uden at skulle spørge."),
    dag: tr("Det gør det nemt at forestille sig selv hos jer - og det er dét, der får folk til at tage næste skridt."),
    finder: tr("I stedet for at lede selv får gæsten et svar, der passer til dem - færre spørgsmål til jer og hurtigere beslutninger."),
    sprog: tr("Gæster fra udlandet får touren på deres eget sprog - så I når flere uden ekstra arbejde."),
  };
  return why[key];
}

export function FeatureTour({ T, onClose, onEvent }: { T: TourConfig; onClose: () => void; onEvent: (name: string, params?: Record<string, string | number>) => void }) {
  const tr = useT();
  const all = featuresOf(T, tr);
  const [at, setAt] = useState(0);
  const [never, setNever] = useState(false);
  if (!all.length) return null;
  const f = all[Math.min(at, all.length - 1)];
  const close = () => {
    if (never)
      try {
        localStorage.setItem(seenKey(T.slug), "1");
      } catch {
        /* private window */
      }
    onEvent("features_close", { seen: at + 1, of: all.length });
    onClose();
  };
  return (
    <div className="ft-bg" role="dialog" aria-modal="true" aria-label={tr("Det kan jeres tour")}>
      <div className="ft-ark">
        <button type="button" className="ft-x" aria-label={tr("Luk")} onClick={close}>
          ×
        </button>
        <p className="ft-kick">
          {f.kicker ?? tr("Det kan jeres tour")} · {at + 1} / {all.length}
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
          {at === all.length - 1 && <p className="ft-sidst">{tr("Er der noget, I vil have ændret? Tryk \"Giv feedback\" i touren, og skriv det dér, hvor I står.")}</p>}
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
                onEvent("features_try", { feature: f.key });
                close();
                setTimeout(() => f.action!(), 250);
              }}
            >
              {f.actionLabel}
            </button>
          )}
          {at < all.length - 1 ? (
            <button type="button" className="ft-naeste" onClick={() => setAt(at + 1)}>
              {tr("Næste")} →
            </button>
          ) : (
            <button type="button" className="ft-naeste" onClick={close}>
              {tr("Se touren")}
            </button>
          )}
        </div>
        <label className="ft-aldrig">
          <input type="checkbox" checked={never} onChange={(e) => setNever(e.target.checked)} /> {tr("Vis ikke igen")}
        </label>
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
@media (prefers-reduced-motion:reduce){.ft-scene *{animation:none!important}.ft-intro span{opacity:1}}
@media (max-height:500px) and (min-width:500px){.ft-ark{zoom:var(--ui-zoom,.72)}}
`;
