"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "../tours/i18n-react";
import type { CardPerson, LineDayStop, TourConfig } from "../tours/types";

/*
 * "En linje på <skolen>" (was "En dag på din linje"): the visitor picks a
 * line and sees what it is like to go there - a few moments, the line's own
 * places woven together with the school's shared ones, each with a photo of
 * the life there, a few words and the people met there. No schedule.
 * A moment with a place: its photo fills the screen and fades into the same
 * place in the tour (a room, or a drone point). Without a place: the photos
 * stand big with the tour blurred behind. Nothing moves on by itself:
 * "Næste" goes on. "Lidt af det hele" is a short visit to every line, for
 * those in doubt. The end gathers the moments, the next visit and another line.
 */

type L = NonNullable<TourConfig["lineDays"]>;
export type LineDayRun = { line: string; at: number; end?: boolean };
/** A stop as shown: the stop, and whether it's the whole school's or which line's. */
export type ShownStop = LineDayStop & { shared: boolean; lineName?: string; lineId?: string; people?: CardPerson[]; /** The line's overview, before its moments. */ intro?: boolean };

export const MIX = "mix";

/** A line's photo on the picker: its own, else the first photo of its own moments. */
const lineImage = (l: L["lines"][number]) => l.image || l.day.flatMap((d) => (typeof d === "string" ? [] : (d.images ?? []))).find(Boolean) || null;


/** The day for a line (or "Lidt af det hele"), in order. */
export function lineDayStops(L: L, line: string): ShownStop[] {
  const shared = new Map(L.shared.map((s) => [s.id, s]));
  if (line === MIX) {
    const visits: ShownStop[] = L.lines.flatMap((l) => {
      const own = l.day.filter((d): d is LineDayStop => typeof d !== "string");
      const sig = own.find((d) => d.id === l.signature) ?? own[0];
      return sig ? [{ ...sig, people: sig.people ?? l.people, shared: false, lineName: l.name, lineId: l.id }] : [];
    });
    const after = L.mix ? L.mix.after : undefined;
    const at = after ? L.shared.findIndex((s) => s.id === after) : Math.floor(L.shared.length / 2) - 1;
    const list: ShownStop[] = L.shared.map((s) => ({ ...s, shared: true }));
    list.splice(Math.max(0, at + 1), 0, ...visits);
    return list;
  }
  const l = L.lines.find((x) => x.id === line);
  if (!l) return [];
  // The overview first (what the line is over a week and a year), with the line's photo - the tour stays where it is, blurred.
  const photo = lineImage(l);
  const intro: ShownStop[] = l.intro?.text
    ? [{ id: `${l.id}-overblik`, title: l.intro.title || l.name, text: l.intro.text, tags: l.intro.facts?.filter(Boolean), images: photo ? [photo] : undefined, people: l.people, shared: false, lineName: l.name, lineId: l.id, intro: true }]
    : [];
  return [...intro, ...l.day
    .map((d): ShownStop | null => {
      if (typeof d === "string") {
        const s = shared.get(d);
        return s ? { ...s, shared: true } : null;
      }
      return { ...d, people: d.people ?? l.people, shared: false, lineName: l.name, lineId: l.id };
    })
    .filter((s): s is ShownStop => Boolean(s))];
}

/** The feature's name: its own title - or "En linje på <the tour's name>" (also for tours still called the old "En dag på din linje"). */
export function lineDaysTitle(T: TourConfig, tr: (s: string, v?: Record<string, string | number>) => string): string {
  const own = T.lineDays?.title?.trim();
  if (own && !/^en dag på din linje$/i.test(own)) return own;
  return tr("En linje på {skole}", { skole: T.title || T.brand });
}


const names = (people?: CardPerson[]) => {
  const n = (people ?? []).map((p) => p.name?.split(" ")[0]).filter(Boolean) as string[];
  return n.length > 1 ? `${n.slice(0, -1).join(", ")} og ${n[n.length - 1]}` : n[0] ?? "";
};

function Faces({ people, size = 34 }: { people?: CardPerson[]; size?: number }) {
  if (!people?.length) return null;
  return (
    <span className="ld-faces">
      {people.slice(0, 4).map((p, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={p.image + i} src={p.image} alt={p.name ?? ""} loading="lazy" style={{ width: size, height: size }} />
      ))}
    </span>
  );
}

/** A photo that fades in once it's there - on a soft, moving placeholder until then (also when it was already in the cache). */
function FadeImg({ src, alt = "", eager = false }: { src: string; alt?: string; eager?: boolean }) {
  const [shown, setShown] = useState(false);
  return (
    <span className={`ld-img ${shown ? "klar" : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={(el) => {
          if (el?.complete && el.naturalWidth) setShown(true);
        }}
        src={src}
        alt={alt}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={eager ? "high" : "low"}
        draggable={false}
        onLoad={() => setShown(true)}
        onError={() => setShown(true)}
      />
    </span>
  );
}

/** A stop's 1-3 photos at the top of its card: swiped (or the arrows on a computer), with dots. */
function StopPhotos({ images, alt }: { images: string[]; alt: string }) {
  const tr = useT();
  const strip = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);
  const go = (i: number) => {
    const el = strip.current;
    if (el) el.scrollTo({ left: Math.max(0, Math.min(images.length - 1, i)) * el.clientWidth, behavior: "smooth" });
  };
  return (
    <div className="ld-photos">
      <div className="ld-photo-strip" ref={strip} onScroll={(e) => setAt(Math.round(e.currentTarget.scrollLeft / Math.max(1, e.currentTarget.clientWidth)))}>
        {images.map((src, i) => (
          <div key={src + i} className="ld-photo" aria-label={images.length > 1 ? tr("Billede {n} af {i alt}", { n: String(i + 1), "i alt": String(images.length) }) : undefined}>
            <FadeImg src={src} alt={i === 0 ? alt : ""} eager={i === 0} />
          </div>
        ))}
      </div>
      {images.length > 1 && (
        <>
          <button type="button" className="ld-photo-pil forrige" aria-label={tr("Forrige billede")} disabled={at === 0} onClick={() => go(at - 1)}>
            ‹
          </button>
          <button type="button" className="ld-photo-pil naeste" aria-label={tr("Næste billede")} disabled={at >= images.length - 1} onClick={() => go(at + 1)}>
            ›
          </button>
          <div className="ld-photo-dots" aria-hidden>
            {images.map((_, i) => (
              <i key={i} className={i === at ? "nu" : ""} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** The start: "Forestil dig en skoledag ..." - the lines with their teachers, or a bit of everything. */
export function LineDayPicker({ L, title, onPick, onClose }: { L: L; title: string; onPick: (line: string) => void; onClose: () => void }) {
  const tr = useT();
  // The photos only when (nearly) every line has one - a row of photos with one plain tile looks unfinished.
  const photos = L.lines.filter((l) => lineImage(l)).length >= Math.max(1, L.lines.length - 1);
  return (
    <div className="ld" onClick={onClose}>
      <div className="ld-pick" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="ld-x" aria-label={tr("Luk")} onClick={onClose}>
          ×
        </button>
        <h2>{title}</h2>
        {L.lead && <p className="ld-lead">{L.lead}</p>}
        <div className={`ld-lines ${photos ? "med-fotos" : ""}`}>
          {L.lines.map((l) => {
            const img = photos ? lineImage(l) : null;
            return (
              <button key={l.id} type="button" className={`ld-line ${img ? "med-foto" : ""}`} onClick={() => onPick(l.id)}>
                {img && <FadeImg src={img} />}
                <Faces people={l.people} size={img ? 30 : 38} />
                <b>{l.name}</b>
                {l.people?.length ? <small>{tr("Med {navne}", { navne: names(l.people) })}</small> : l.teaser ? <small>{l.teaser}</small> : null}
              </button>
            );
          })}
        </div>
        <div className="ld-or">
          {L.mix !== false && (
            <button type="button" onClick={() => onPick(MIX)}>
              {tr("I tvivl? Se lidt af det hele")}
            </button>
          )}
          <button type="button" onClick={onClose}>
            {tr("Gå selv rundt")} →
          </button>
        </div>
      </div>
    </div>
  );
}

/** While the day runs: where in the day, the stop, the people - and Næste. */
export function LineDayCard({ L, stops, run, onGo, onClose }: { L: L; stops: ShownStop[]; run: LineDayRun; onGo: (at: number | "end") => void; onClose: () => void }) {
  const tr = useT();
  /** The photo shown big again (a thumbnail pressed) - each press shows it anew. */
  const [again, setAgain] = useState<{ n: number; at: number }>({ n: 0, at: 0 });
  // The next stops' first photos are fetched while this one is read - so they're there when Næste is pressed.
  const coming = stops
    .slice(run.at + 1, run.at + 3)
    .map((x) => x.images?.[0])
    .filter((x): x is string => Boolean(x))
    .join("|");
  useEffect(() => {
    for (const src of coming ? coming.split("|") : []) {
      const img = new Image();
      img.decoding = "async";
      img.src = src;
    }
  }, [coming]);
  const s = stops[run.at];
  if (!s) return null;
  const next = stops[run.at + 1];
  // The same people as on a stop before (most often the line's teachers): only their faces and names on one line - the whole list is shown where they're met first.
  const who = (x?: ShownStop) => (x?.people ?? []).map((p) => p.image).join("|");
  // Small faces on one line also for the overview and for 3 or more people (a list of 3-4 would fill the card).
  const metBefore = L.people === "faces" || Boolean(s.intro) || (s.people?.length ?? 0) >= 3 || (Boolean(who(s)) && stops.slice(0, run.at).some((x) => who(x) === who(s)));
  // "Kun én": just the first person, in full.
  const people = L.people === "one" ? s.people?.slice(0, 1) : s.people;
  const title = run.line === MIX ? (L.mix && L.mix.title) || tr("Lidt af det hele") : (L.lines.find((l) => l.id === run.line)?.name ?? "");
  const photos = (s.images ?? []).filter(Boolean).slice(0, 3);
  const placed = Boolean(s.href);
  const label = (x: ShownStop) => [x.time, x.title].filter(Boolean).join(" ");
  return (
    <>
      {photos.length > 0 &&
        (placed ? (
          <StopReveal key={`${s.id}:${run.at}:${again.n}`} src={photos[again.n ? again.at : 0]} alt={s.title} />
        ) : (
          <div className="ld-frame" key={`${s.id}:${run.at}`}>
            <div className="ld-frame-photos">
              <StopPhotos images={photos} alt={s.title} />
            </div>
          </div>
        ))}
    <div className={`ld-card ${s.intro ? "ld-overblik" : ""}`} key={s.id + run.at} role="dialog" aria-label={title}>
      {/* The moments as dots, and Luk - one row (the line's name is on the badge below). */}
      <div className="ld-top">
        <ol className="ld-dots" aria-label={tr("Øjeblikke")}>
          {stops.map((x, i) => (
            <li key={x.id + i}>
              <button type="button" className={i === run.at ? "nu" : i < run.at ? "set" : ""} title={label(x)} aria-label={label(x)} onClick={() => onGo(i)} />
            </li>
          ))}
        </ol>
        <button type="button" className="ld-x2" aria-label={tr("Luk")} onClick={onClose}>
          ×
        </button>
      </div>
      <div className="ld-when">
        {s.time && <time>{s.time}</time>}
        <span className={`ld-badge ${s.shared ? "faelles" : ""}`}>{s.shared ? tr("Hele skolen") : s.intro ? tr("Overblik") : s.lineName}</span>
        {s.place && <span className="ld-place">{s.place}</span>}
        {/* The moment's photos, small at the end of this row - a tap shows one big again (no row of its own). */}
        {placed && photos.length > 0 && (
          <span className="ld-thumbs">
            {photos.map((src, i) => (
              <button key={src + i} type="button" aria-label={tr("Se billedet stort")} onClick={() => setAgain((a) => ({ n: a.n + 1, at: i }))}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" loading="lazy" decoding="async" />
              </button>
            ))}
          </span>
        )}
      </div>
      <h3>{s.title}</h3>
      {s.text && <LongText key={s.id + run.at} text={s.text} />}
      {/* Small facts only on the overview - on a moment they only made the card taller. */}
      {s.intro && s.tags?.length ? (
        <div className="ld-tags">
          {s.tags.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
      ) : null}
      {people?.length && metBefore && L.people !== "one" ? (
        <div className="ld-people-kort">
          <Faces people={people} size={28} />
          <small>{tr("Med {navne}", { navne: names(people) })}</small>
        </div>
      ) : people?.length ? (
        <div className="ld-people">
          {people.slice(0, 4).map((p, i) => (
            <span key={p.image + i}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.image} alt="" loading="lazy" />
              {(p.name || p.role) && (
                <span>
                  {p.name && <b>{p.name}</b>}
                  {p.role && <small>{p.role}</small>}
                </span>
              )}
            </span>
          ))}
        </div>
      ) : null}
      <div className="ld-nav">
        {run.at > 0 && (
          <button type="button" className="ld-back" onClick={() => onGo(run.at - 1)}>
            ‹
          </button>
        )}
        <button type="button" className="ld-next" onClick={() => onGo(next ? run.at + 1 : "end")}>
          {next ? `${tr("Næste")}: ${next.title}` : tr("Se det hele samlet")} ›
        </button>
      </div>
    </div>
    </>
  );
}

/** A text kept to a few lines - "Læs mere" shows the rest, in the card. */
function LongText({ text }: { text: string }) {
  const tr = useT();
  const [open, setOpen] = useState(false);
  const [cut, setCut] = useState(false);
  return (
    <>
      <p
        className={open ? "aaben" : ""}
        ref={(el) => {
          if (el && !open) setCut(el.scrollHeight > el.clientHeight + 2);
        }}
      >
        {text}
      </p>
      {(cut || open) && (
        <button type="button" className="ld-mere" onClick={() => setOpen(!open)}>
          {open ? tr("Vis mindre") : tr("Læs mere")}
        </button>
      )}
    </>
  );
}

/**
 * A moment's photo of the life there, full screen as the moment opens - then
 * it fades away into the same place in the tour (which has moved there
 * meanwhile). A tap lets the tour through at once.
 */
function StopReveal({ src, alt }: { src: string; alt: string }) {
  const [phase, setPhase] = useState<"show" | "fade" | "gone">("show");
  useEffect(() => {
    const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const a = setTimeout(() => setPhase((p) => (p === "show" ? "fade" : p)), calm ? 1400 : 2600);
    const b = setTimeout(() => setPhase("gone"), calm ? 1800 : 4000);
    return () => (clearTimeout(a), clearTimeout(b));
  }, []);
  if (phase === "gone") return null;
  return (
    <div className={`ld-reveal ${phase === "fade" ? "ud" : ""}`} onClick={() => setPhase("fade")} onTransitionEnd={() => phase === "fade" && setPhase("gone")}>
      <FadeImg src={src} alt={alt} eager />
    </div>
  );
}

/** The end: the day gathered, the next visit, another line's day. */
export function LineDayEnd({ L, run, onPick, onVisit, onClose }: { L: L; stops: ShownStop[]; run: LineDayRun; onPick: (line: string) => void; onVisit: (label: string, href: string) => void; onClose: () => void }) {
  const tr = useT();
  const line = L.lines.find((l) => l.id === run.line);
  return (
    <div className="ld" onClick={onClose}>
      <div className="ld-pick ld-end" role="dialog" aria-label={tr("Linjen")} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="ld-x" aria-label={tr("Luk")} onClick={onClose}>
          ×
        </button>
        <div className="ld-end-grid">
          <div>
            <h2>{line ? tr("Sådan er det at gå på {linje}.", { linje: line.name }) : tr("Sådan er det at gå hos os.")}</h2>
            {line?.outro && <p className="ld-lead">{line.outro}</p>}
            {line?.trips?.length ? (
              <div className="ld-trips">
                <span className="ld-kicker">{tr("Det venter dig også")}</span>
                <div className="ld-trip-row">
                  {line.trips.slice(0, 6).map((t, i) => (
                    <article key={t.title + i} className={`ld-trip ${t.image ? "" : "uden-foto"}`}>
                      {t.image && (
                        <div className="ld-trip-pic">
                          <FadeImg src={t.image} />
                        </div>
                      )}
                      <div className="ld-trip-txt">
                        {t.when && <small>{t.when}</small>}
                        <b>{t.title}</b>
                        {t.text && <p>{t.text}</p>}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}
            {L.visit && (
              <div className="ld-visit">
                <b>{L.visit.title}</b>
                {L.visit.text && <p>{L.visit.text}</p>}
                <button type="button" onClick={() => onVisit(L.visit!.label, L.visit!.href)}>
                  {L.visit.label}
                </button>
              </div>
            )}
            <span className="ld-kicker">{run.line === MIX ? tr("Se din linje") : tr("Se en anden linje")}</span>
            <div className="ld-chips">
              {L.lines
                .filter((l) => l.id !== run.line)
                .map((l) => (
                  <button key={l.id} type="button" onClick={() => onPick(l.id)}>
                    {l.name}
                  </button>
                ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export const LINE_DAY_CSS = `
.ld{position:absolute;inset:0;z-index:36;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(10,14,16,.5);animation:hvFade .2s ease}
.ld-pick{position:relative;width:min(760px,100%);max-height:100%;overflow-y:auto;overscroll-behavior:contain;padding:28px;border-radius:24px;background:#fff;color:#1d2a30;box-shadow:0 24px 70px rgba(0,0,0,.45);animation:hvUp .3s cubic-bezier(.2,.7,.2,1) both}
.ld-pick h2{margin:0 40px 6px 0;font-family:var(--font-heading);font-size:32px;line-height:1.1;color:var(--c-main)}
.ld-lead{margin:0 0 18px;font-size:15px;line-height:1.5;color:#56636a}
.ld-x,.ld-x2{position:absolute;right:16px;top:16px;width:36px;height:36px;border:0;border-radius:50%;background:#f1f2f3;color:#56636a;font-size:21px;line-height:1;cursor:pointer}
.ld-x2{position:static;width:30px;height:30px;font-size:18px}
.ld-lines{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.ld-line{display:flex;flex-direction:column;align-items:flex-start;gap:6px;padding:14px;border:1px solid #e8e6e1;border-radius:16px;background:#fff;font:inherit;color:inherit;text-align:left;cursor:pointer;transition:border-color .15s,box-shadow .15s,transform .15s}
.ld-line:hover{border-color:var(--c-accent);box-shadow:0 8px 22px rgba(0,0,0,.1);transform:translateY(-1px)}
.ld-line b{font-size:17px;color:var(--c-main)}
.ld-line small{font-size:13px;line-height:1.35;color:#6b7a80}
.ld-faces{display:flex}
.ld-faces img{border-radius:50%;object-fit:cover;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.18)}
.ld-faces img+img{margin-left:-10px}
.ld-or{display:flex;flex-wrap:wrap;gap:8px 18px;margin-top:16px}
.ld-or button{border:0;background:none;padding:6px 0;font:inherit;font-size:14px;font-weight:700;color:var(--c-accent);cursor:pointer}
/* The line's photo on the picker: the tile is the photo, with the faces and the name on it. */
.ld-line.med-foto{position:relative;justify-content:flex-end;min-height:150px;padding:12px;border:0;overflow:hidden;color:#fff;background:#2a3135}
.ld-line.med-foto>.ld-img{position:absolute;inset:0}
.ld-line.med-foto::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0) 30%,rgba(0,0,0,.7));pointer-events:none}
.ld-line.med-foto>*:not(.ld-img){position:relative;z-index:1}
.ld-line.med-foto .ld-faces{position:absolute;top:10px;left:10px}
.ld-line.med-foto b{color:#fff;font-size:18px}
.ld-line.med-foto small{color:rgba(255,255,255,.88)}
.ld-line.med-foto:hover .ld-img img{transform:scale(1.04)}
/* A moment's photo, full screen as it opens - fading into the same place in the tour. */
.ld-reveal{position:absolute;inset:0;z-index:29;background:#111;opacity:1;transition:opacity 1.3s ease;cursor:pointer}
.ld-reveal .ld-img{width:100%;height:100%}
.ld-reveal .ld-img img{transform:scale(1.04);transition:opacity .4s ease,transform 4s ease-out}
.ld-reveal .ld-img.klar img{transform:scale(1)}
.ld-reveal.ud{opacity:0;pointer-events:none}
/* A moment with no place: its photos big, the tour blurred behind. */
.ld-frame{position:absolute;inset:0;z-index:29;background:rgba(10,14,16,.35);-webkit-backdrop-filter:blur(18px) saturate(1.1);backdrop-filter:blur(18px) saturate(1.1);animation:hvFade .4s ease}
.ld-frame-photos{position:absolute;top:24px;right:24px;bottom:24px;left:440px;display:flex}
.ld-frame-photos .ld-photos{flex:1!important;margin:0;border-radius:20px;box-shadow:0 20px 60px rgba(0,0,0,.4)}
/* The moment's photos, small - a tap shows one big again. */
.ld-thumbs{display:flex;gap:4px;margin-left:auto}
.ld-thumbs button{width:34px;height:34px;padding:0;border:0;border-radius:8px;overflow:hidden;background:#e9ecee;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,.15)}
.ld-thumbs img{width:100%;height:100%;object-fit:cover;display:block}
/* A tighter card: dots and Luk on one row. */
.ld-top{gap:12px}
.ld-top .ld-dots{flex:1;margin:0}
.ld-card .ld-when{margin-top:10px;flex-wrap:nowrap;min-width:0}
.ld-card .ld-when>*{flex:none}
.ld-card .ld-when .ld-place{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
/* Long words fold: 3 lines, "Læs mere" for the rest (the card scrolls only then). */
.ld-card>p{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.ld-card>p.aaben{display:block;-webkit-line-clamp:unset;overflow:visible}
.ld-card:has(p.aaben){overflow-y:auto;overscroll-behavior:contain}
.ld-mere{align-self:flex-start;margin-top:2px;padding:2px 0;border:0;background:none;font:inherit;font-size:13px;font-weight:800;color:var(--c-accent);cursor:pointer}
/* The facts: one row of small chips (swiped sideways when there are many). */
.ld-tags{flex-wrap:nowrap!important;overflow-x:auto;scrollbar-width:none;margin-top:8px!important}
.ld-tags::-webkit-scrollbar{display:none}
.ld-tags span{flex:none;padding:3px 9px!important;font-size:11.5px!important}
/* The card never scrolls: the text is cut short instead (the whole text is in the day's summary). */
.ld-card{position:absolute;left:16px;bottom:16px;z-index:30;width:min(400px,calc(100% - 32px));max-height:calc(100% - 120px);overflow:hidden;padding:16px 18px;border-radius:20px;background:rgba(255,255,255,.98);color:#1d2a30;box-shadow:0 16px 44px rgba(0,0,0,.32);animation:hvUp .35s cubic-bezier(.2,.7,.2,1) both}
.ld-top{display:flex;align-items:center;justify-content:space-between;gap:10px}
.ld-kicker{display:block;font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#8a969b}
.ld-dots{display:flex;gap:4px;margin:10px 0 12px;padding:0;list-style:none}
.ld-dots li{flex:1}
.ld-dots button{display:block;width:100%;height:5px;padding:0;border:0;border-radius:3px;background:#e6e8e9;cursor:pointer}
.ld-dots button.set{background:color-mix(in srgb,var(--c-accent) 45%,#fff)}
.ld-dots button.nu{background:var(--c-accent)}
.ld-when{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px}
.ld-when time{font-weight:800;font-size:15px;font-variant-numeric:tabular-nums;color:var(--c-accent)}
.ld-badge{padding:2px 9px;border-radius:999px;background:var(--c-accent);color:var(--c-on-accent,#fff);font-size:11.5px;font-weight:800}
.ld-badge.faelles{background:var(--c-main)}
.ld-place{font-size:12.5px;font-weight:700;color:#6b7a80}
.ld-card h3{margin:8px 0 4px;font-family:var(--font-heading);font-size:22px;line-height:1.15;color:var(--c-main)}
.ld-card p{margin:0;font-size:14.5px;line-height:1.5;color:#3d4a50}
.ld-tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.ld-tags span{padding:4px 10px;border-radius:999px;background:var(--c-soft);font-size:12.5px;font-weight:700;color:var(--c-main)}
.ld-people{display:flex;flex-wrap:wrap;gap:10px 14px;margin-top:12px}
.ld-people-kort{display:flex;align-items:center;gap:8px;margin-top:10px;min-width:0}
.ld-people-kort small{min-width:0;font-size:12.5px;font-weight:700;color:#56636a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ld-people>span{display:flex;align-items:center;gap:8px;min-width:0}
.ld-people img{width:42px;height:42px;border-radius:50%;object-fit:cover;flex:none}
.ld-people b{display:block;font-size:13.5px}
.ld-people small{display:block;font-size:12px;color:#6b7a80}
.ld-nav{display:flex;gap:8px;margin-top:14px}
.ld-nav button{border:0;border-radius:12px;font:inherit;font-weight:800;cursor:pointer}
.ld-back{width:42px;background:#f1f2f3;color:#56636a;font-size:20px}
.ld-next{flex:1;min-width:0;padding:11px 14px;background:var(--c-accent);color:var(--c-on-accent,#fff);font-size:14.5px;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* A stop's photos: edge to edge at the top of the card, a fixed frame (no jump while they load), swiped with the finger. */
/* The card is a column: when space is short, the photo and the text give way - the people and Næste are always seen. */
.ld-card{display:flex;flex-direction:column}
.ld-card>*{flex:none}
.ld-card>p{flex:0 1 auto;min-height:0}
.ld-photos{position:relative;flex:0 1 min(210px,28vh)!important;min-height:96px;margin:-16px -18px 12px;border-radius:20px 20px 0 0;overflow:hidden;background:#e9ecee}
.ld-photo-strip{height:100%;display:flex;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;overscroll-behavior-x:contain;-webkit-overflow-scrolling:touch}
.ld-photo-strip::-webkit-scrollbar{display:none}
.ld-photo{flex:0 0 100%;scroll-snap-align:center;scroll-snap-stop:always;height:100%}
.ld-img{position:relative;display:block;width:100%;height:100%;overflow:hidden;background:linear-gradient(100deg,#e7eaec 30%,#f3f5f6 50%,#e7eaec 70%) 0 0/300% 100%;animation:ldShimmer 1.4s linear infinite}
.ld-img.klar{animation:none;background:#e9ecee}
.ld-img img{display:block;width:100%;height:100%;object-fit:cover;opacity:0;transform:scale(1.02);transition:opacity .4s ease,transform .6s cubic-bezier(.2,.7,.2,1)}
.ld-img.klar img{opacity:1;transform:none}
@keyframes ldShimmer{from{background-position:100% 0}to{background-position:-50% 0}}
.ld-photo-dots{position:absolute;left:0;right:0;bottom:9px;display:flex;justify-content:center;gap:5px;pointer-events:none}
.ld-photo-dots i{width:6px;height:6px;border-radius:3px;background:rgba(255,255,255,.55);box-shadow:0 1px 3px rgba(0,0,0,.3);transition:width .2s,background .2s}
.ld-photo-dots i.nu{width:16px;background:#fff}
.ld-photo-pil{position:absolute;top:50%;translate:0 -50%;width:32px;height:32px;display:none;place-items:center;padding:0 0 2px;border:0;border-radius:50%;background:rgba(255,255,255,.9);color:#1d2a30;font:inherit;font-size:20px;font-weight:700;line-height:1;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.2)}
.ld-photo-pil.forrige{left:10px}.ld-photo-pil.naeste{right:10px}
.ld-photo-pil:disabled{opacity:0;pointer-events:none}
@media (hover:hover) and (pointer:fine){.ld-photo-pil{display:grid}}
/* The line's trips at the end of its day: a row of cards, swiped sideways. */
.ld-trips{margin:0 0 18px}
.ld-trip-row{display:flex;gap:10px;margin-top:8px;overflow-x:auto;scroll-snap-type:x proximity;scrollbar-width:none;padding-bottom:2px}
.ld-trip-row::-webkit-scrollbar{display:none}
.ld-trip{flex:0 0 min(220px,70%);scroll-snap-align:start;border-radius:16px;overflow:hidden;background:#fff;border:1px solid #ecebe7}
.ld-trip.uden-foto{background:var(--c-soft);border-color:transparent}
.ld-trip-pic{height:120px}
.ld-trip-txt{padding:10px 12px 12px}
.ld-trip small{display:block;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--c-accent)}
.ld-trip b{display:block;margin-top:2px;font-size:14.5px;line-height:1.25;color:var(--c-main)}
.ld-trip p{margin:4px 0 0;font-size:13px;line-height:1.4;color:#56636a;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.ld-end{width:min(640px,100%)}
.ld-end-grid{display:block}
.ld-visit{margin:4px 0 20px;padding:16px;border-radius:16px;background:var(--c-soft)}
.ld-visit b{display:block;font-size:17px;color:var(--c-main)}
.ld-visit p{margin:4px 0 12px;font-size:14px;line-height:1.45;color:#3d4a50}
.ld-visit button{padding:11px 18px;border:0;border-radius:999px;background:var(--c-accent);color:var(--c-on-accent,#fff);font:inherit;font-weight:800;cursor:pointer}
.ld-chips{display:flex;flex-wrap:nowrap;gap:6px;margin-top:8px;overflow-x:auto;scrollbar-width:none;-webkit-mask-image:linear-gradient(90deg,#000 88%,transparent);mask-image:linear-gradient(90deg,#000 88%,transparent);padding-right:24px}
.ld-chips::-webkit-scrollbar{display:none}
.ld-chips button{flex:none;white-space:nowrap}
.ld-chips button{padding:9px 14px;border:1px solid #e3e1dc;border-radius:999px;background:#fff;font:inherit;font-size:14px;font-weight:700;color:var(--c-main);cursor:pointer}
.ld-chips button:hover{border-color:var(--c-accent)}
@media (max-width:760px){
  .ld{align-items:flex-end;padding:0}
  .ld-pick{border-radius:22px 22px 0 0;padding:22px 18px calc(18px + env(safe-area-inset-bottom,0px));max-height:90%}
  .ld-pick h2{font-size:26px}
  .ld-lines{grid-template-columns:repeat(2,minmax(0,1fr))}
  .ld-card{left:10px;right:10px;width:auto;bottom:calc(10px + env(safe-area-inset-bottom,0px));max-height:58%;padding:12px 14px}
  .ld-card h3{font-size:18px;margin:6px 0 3px}
  .ld-card>p{-webkit-line-clamp:2}
  .ld-card .ld-when{margin-top:8px}
  .ld-x2{width:26px;height:26px;font-size:16px}
  .ld-nav{margin-top:10px}
  .ld-next{padding:10px 12px;font-size:14px}
  .ld-people-kort{margin-top:8px}
  .ld-people-kort .ld-faces img{width:24px!important;height:24px!important}
  .ld-thumbs button{width:30px;height:30px;border-radius:7px}
  .ld-chips button{padding:7px 12px;font-size:13px}
  .ld-card h3{font-size:19px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
  .ld-photos{margin:-14px -14px 10px}
  .ld-photos{flex-basis:min(170px,22vh)!important}
  /* With photos on top, the words keep it short, so the card stays clear of the top and never scrolls. */
  .ld-med-foto h3{-webkit-line-clamp:2}
  .ld-med-foto p{-webkit-line-clamp:2}
  .ld-card p{font-size:14px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  /* On the phone the people take less room: smaller faces, close together. */
  .ld-people{display:grid;grid-template-columns:minmax(0,1fr);gap:6px;margin-top:10px}
  .ld-people img{width:30px;height:30px}
  .ld-people b{font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .ld-people small{font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .ld-people>span>span{min-width:0}
  .ld-frame-photos{top:calc(12px + env(safe-area-inset-top,0px));left:10px;right:10px;bottom:auto;height:42%}
  .ld-line.med-foto{min-height:128px}
  }
`;
