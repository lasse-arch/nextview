"use client";

import { useT } from "../tours/i18n-react";
import type { CardPerson, LineDayStop, TourConfig } from "../tours/types";

/*
 * "En dag på din linje": the visitor picks a line and lives a school day.
 * The tour flies from stop to stop - the line's own places (the stable
 * before breakfast) woven together with the school's shared ones (morning
 * assembly, the room at night) - each with its time, a few words and the
 * people met there. Nothing moves by itself: "Næste" goes on. "Lidt af det
 * hele" is the shared day with a short visit to every line, for those in
 * doubt. The end gathers the day, the next visit and another line's day.
 */

type L = NonNullable<TourConfig["lineDays"]>;
export type LineDayRun = { line: string; at: number; end?: boolean };
/** A stop as shown: the stop, and whether it's the whole school's or which line's. */
export type ShownStop = LineDayStop & { shared: boolean; lineName?: string; lineId?: string; people?: CardPerson[] };

export const MIX = "mix";

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
  return l.day
    .map((d): ShownStop | null => {
      if (typeof d === "string") {
        const s = shared.get(d);
        return s ? { ...s, shared: true } : null;
      }
      return { ...d, people: d.people ?? l.people, shared: false, lineName: l.name, lineId: l.id };
    })
    .filter((s): s is ShownStop => Boolean(s));
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

/** The start: "Forestil dig en skoledag ..." - the lines with their teachers, or a bit of everything. */
export function LineDayPicker({ L, onPick, onClose }: { L: L; onPick: (line: string) => void; onClose: () => void }) {
  const tr = useT();
  return (
    <div className="ld" onClick={onClose}>
      <div className="ld-pick" role="dialog" aria-label={L.title} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="ld-x" aria-label={tr("Luk")} onClick={onClose}>
          ×
        </button>
        <h2>{L.title}</h2>
        {L.lead && <p className="ld-lead">{L.lead}</p>}
        <div className="ld-lines">
          {L.lines.map((l) => (
            <button key={l.id} type="button" className="ld-line" onClick={() => onPick(l.id)}>
              <Faces people={l.people} size={38} />
              <b>{l.name}</b>
              {l.people?.length ? <small>{tr("Med {navne}", { navne: names(l.people) })}</small> : l.teaser ? <small>{l.teaser}</small> : null}
            </button>
          ))}
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
  const s = stops[run.at];
  if (!s) return null;
  const next = stops[run.at + 1];
  // The same people as on a stop before (most often the line's teachers): only their faces and names on one line - the whole list is shown where they're met first.
  const who = (x?: ShownStop) => (x?.people ?? []).map((p) => p.image).join("|");
  const metBefore = L.people === "faces" || (Boolean(who(s)) && stops.slice(0, run.at).some((x) => who(x) === who(s)));
  // "Kun én": just the first person, in full.
  const people = L.people === "one" ? s.people?.slice(0, 1) : s.people;
  const title = run.line === MIX ? (L.mix && L.mix.title) || tr("Lidt af det hele") : tr("En dag på {linje}", { linje: L.lines.find((l) => l.id === run.line)?.name ?? "" });
  return (
    <div className="ld-card" key={s.id + run.at}>
      <div className="ld-top">
        <span className="ld-kicker">{title}</span>
        <button type="button" className="ld-x2" aria-label={tr("Luk")} onClick={onClose}>
          ×
        </button>
      </div>
      <ol className="ld-dots" aria-label={tr("Dagen")}>
        {stops.map((x, i) => (
          <li key={x.id + i}>
            <button type="button" className={i === run.at ? "nu" : i < run.at ? "set" : ""} title={`${x.time} · ${x.title}`} aria-label={`${x.time} · ${x.title}`} onClick={() => onGo(i)} />
          </li>
        ))}
      </ol>
      <div className="ld-when">
        <time>{s.time}</time>
        <span className={`ld-badge ${s.shared ? "faelles" : ""}`}>{s.shared ? tr("Hele skolen") : s.lineName}</span>
        {s.place && <span className="ld-place">{s.place}</span>}
      </div>
      <h3>{s.title}</h3>
      {s.text && <p>{s.text}</p>}
      {s.tags?.length ? (
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
          {next ? `${tr("Næste")}: ${next.time} ${next.title}` : tr("Se hele dagen")} ›
        </button>
      </div>
    </div>
  );
}

/** The end: the day gathered, the next visit, another line's day. */
export function LineDayEnd({ L, stops, run, onPick, onVisit, onClose }: { L: L; stops: ShownStop[]; run: LineDayRun; onPick: (line: string) => void; onVisit: (label: string, href: string) => void; onClose: () => void }) {
  const tr = useT();
  const line = L.lines.find((l) => l.id === run.line);
  return (
    <div className="ld" onClick={onClose}>
      <div className="ld-pick ld-end" role="dialog" aria-label={tr("Din dag")} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="ld-x" aria-label={tr("Luk")} onClick={onClose}>
          ×
        </button>
        <div className="ld-end-grid">
          <ol className="ld-sum">
            {stops.map((s, i) => (
              <li key={s.id + i}>
                <time>{s.time}</time>
                <span>
                  <b>{s.title}</b>
                  {!s.shared && s.lineName && run.line === MIX && <small>{s.lineName}</small>}
                </span>
              </li>
            ))}
          </ol>
          <div>
            <h2>{line ? tr("Det var en dag på {linje}.", { linje: line.name }) : tr("Det var en dag hos os.")}</h2>
            {line?.outro && <p className="ld-lead">{line.outro}</p>}
            {L.visit && (
              <div className="ld-visit">
                <b>{L.visit.title}</b>
                {L.visit.text && <p>{L.visit.text}</p>}
                <button type="button" onClick={() => onVisit(L.visit!.label, L.visit!.href)}>
                  {L.visit.label}
                </button>
              </div>
            )}
            <span className="ld-kicker">{run.line === MIX ? tr("Se en hel dag på din linje") : tr("Se en dag på en anden linje")}</span>
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
.ld-end{width:min(860px,100%)}
.ld-end-grid{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:28px}
.ld-sum{margin:0;padding:0;list-style:none;border-right:1px solid #eee;padding-right:20px}
.ld-sum li{display:flex;gap:12px;padding:7px 0}
.ld-sum time{flex:none;width:96px;font-weight:800;font-size:13.5px;color:var(--c-accent)}
.ld-sum b{display:block;font-size:14.5px}
.ld-sum small{display:block;font-size:12px;color:#8a969b}
.ld-visit{margin:4px 0 20px;padding:16px;border-radius:16px;background:var(--c-soft)}
.ld-visit b{display:block;font-size:17px;color:var(--c-main)}
.ld-visit p{margin:4px 0 12px;font-size:14px;line-height:1.45;color:#3d4a50}
.ld-visit button{padding:11px 18px;border:0;border-radius:999px;background:var(--c-accent);color:var(--c-on-accent,#fff);font:inherit;font-weight:800;cursor:pointer}
.ld-chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.ld-chips button{padding:9px 14px;border:1px solid #e3e1dc;border-radius:999px;background:#fff;font:inherit;font-size:14px;font-weight:700;color:var(--c-main);cursor:pointer}
.ld-chips button:hover{border-color:var(--c-accent)}
@media (max-width:760px){
  .ld{align-items:flex-end;padding:0}
  .ld-pick{border-radius:22px 22px 0 0;padding:22px 18px calc(18px + env(safe-area-inset-bottom,0px));max-height:90%}
  .ld-pick h2{font-size:26px}
  .ld-lines{grid-template-columns:repeat(2,minmax(0,1fr))}
  .ld-card{left:10px;right:10px;width:auto;bottom:calc(10px + env(safe-area-inset-bottom,0px));max-height:58%;padding:14px}
  .ld-card h3{font-size:19px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
  .ld-card p{font-size:14px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
  /* On the phone the people take less room: smaller faces, close together. */
  .ld-people{display:grid;grid-template-columns:minmax(0,1fr);gap:6px;margin-top:10px}
  .ld-people img{width:30px;height:30px}
  .ld-people b{font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .ld-people small{font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .ld-people>span>span{min-width:0}
  .ld-end-grid{grid-template-columns:1fr;gap:16px}
  .ld-sum{border-right:0;padding-right:0;order:2}
}
`;
