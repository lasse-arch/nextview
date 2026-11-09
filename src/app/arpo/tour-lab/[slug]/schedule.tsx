"use client";

import { useMemo, useState } from "react";
import { useT } from "../tours/i18n-react";
import type { ScheduleBlock, ScheduleSlot, ScheduleSubject, TourConfig } from "../tours/types";
import { videoEmbed } from "./info";

/*
 * "Byg dit skema": the visitor picks a subject in each choice block - per
 * period - and sees their week at once, with the fixed parts of the day. A
 * subject's card shows it the best way there is: its place in the tour
 * ("Se stedet"), else its photos or film, else just its text - so a subject
 * that was never scanned (the climbing wall) still shows well. The choices
 * are kept in the visitor's browser for the visit.
 */

type Schedule = NonNullable<TourConfig["schedule"]>;
type Choices = Record<string, Record<string, string>>;

const ONE = "_";
/** "9.15" / "09:15" → minutes, for the order within a day. */
const minutes = (t: string) => {
  const m = /(\d{1,2})[.:](\d{2})/.exec(t);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
};
const inPeriod = (x: { periods?: string[] }, p: string) => !x.periods?.length || p === ONE || x.periods.includes(p);
const span = (s: ScheduleSlot) => (s.to ? `${s.from}-${s.to}` : s.from);

function load(slug: string): Choices {
  try {
    const raw = window.sessionStorage.getItem(`hv-skema:${slug}`);
    const v = raw ? JSON.parse(raw) : null;
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}
function keep(slug: string, c: Choices) {
  try {
    window.sessionStorage.setItem(`hv-skema:${slug}`, JSON.stringify(c));
  } catch {}
}

export function ScheduleSheet({
  S,
  slug,
  onSee,
  onImages,
  onVisit,
  onTrack,
  onClose,
}: {
  S: Schedule;
  slug: string;
  onSee: (href: string, label: string) => void;
  onImages: (images: string[], at: number, title: string) => void;
  onVisit: (label: string, href: string) => void;
  onTrack: (event: string, data: Record<string, string | number>) => void;
  onClose: () => void;
}) {
  const tr = useT();
  const periods = S.periods?.length ? S.periods : [{ id: ONE, name: "" }];
  const [period, setPeriod] = useState(periods[0].id);
  const [choices, setChoices] = useState<Choices>(() => load(slug));
  const [picker, setPicker] = useState<string | null>(null);
  const [card, setCard] = useState<{ subject: ScheduleSubject; block: ScheduleBlock } | null>(null);
  const [dayAt, setDayAt] = useState(0);

  const slots = useMemo(() => S.slots.filter((s) => inPeriod(s, period)), [S.slots, period]);
  /** The blocks with a lesson in this period - the ones to choose in. */
  const blocks = useMemo(() => S.blocks.filter((b) => slots.some((s) => s.block === b.id) && b.subjects.some((x) => inPeriod(x, period))), [S.blocks, slots, period]);
  const mine = choices[period] ?? {};
  const chosen = (b: ScheduleBlock) => b.subjects.find((x) => x.id === mine[b.id] && inPeriod(x, period));
  const done = blocks.filter((b) => chosen(b)).length;
  const allDone = periods.every((p) => S.blocks.filter((b) => S.slots.some((s) => s.block === b.id && inPeriod(s, p.id))).every((b) => b.subjects.some((x) => x.id === choices[p.id]?.[b.id])));

  function pick(b: ScheduleBlock, x: ScheduleSubject) {
    const next = { ...choices, [period]: { ...mine, [b.id]: x.id } };
    setChoices(next);
    keep(slug, next);
    setPicker(null);
    onTrack("schedule_pick", { label: x.name, group: b.name });
  }
  function clear() {
    const next = { ...choices, [period]: {} };
    setChoices(next);
    keep(slug, next);
  }
  function openCard(subject: ScheduleSubject, block: ScheduleBlock) {
    setPicker(null);
    setCard({ subject, block });
    onTrack("schedule_view", { label: subject.name, group: block.name });
  }

  const blockOf = (id?: string) => S.blocks.find((b) => b.id === id);
  const days = S.days.map((name, i) => ({ name, i, slots: slots.filter((s) => s.day === i).sort((a, b) => minutes(a.from) - minutes(b.from)) }));

  const slotView = (s: ScheduleSlot, k: number) => {
    const b = blockOf(s.block);
    if (b) {
      const x = chosen(b);
      return (
        <div key={k} className={`sk-slot sk-valg ${x ? "sk-har" : ""}`}>
          <small>
            {b.name} · {span(s)}
          </small>
          {x ? (
            <button type="button" className="sk-fag" onClick={() => openCard(x, b)}>
              {x.name}
              <span aria-hidden>›</span>
            </button>
          ) : (
            <button type="button" className="sk-vaelg" onClick={() => setPicker(b.id)}>
              + {tr("Vælg fag")}
            </button>
          )}
          {x && (
            <button type="button" className="sk-skift" onClick={() => setPicker(b.id)}>
              {tr("Skift")}
            </button>
          )}
        </div>
      );
    }
    return (
      <div key={k} className="sk-slot sk-fast">
        <small>{span(s)}</small>
        <b>{s.title}</b>
        {s.text && <p>{s.text}</p>}
        {s.href && (
          <button type="button" className="sk-se" onClick={() => onSee(s.href!, s.title ?? "")}>
            {tr("Se stedet")} ›
          </button>
        )}
      </div>
    );
  };

  const pickerBlock = blockOf(picker ?? undefined);

  return (
    <div className="sk" onClick={onClose}>
      <div className="sk-sheet" role="dialog" aria-label={S.title} onClick={(e) => e.stopPropagation()}>
        <div className="sk-head">
          <div>
            <b>{S.title}</b>
            {S.lead && <p>{S.lead}</p>}
          </div>
          <button type="button" className="sk-x" aria-label={tr("Luk")} onClick={onClose}>
            ×
          </button>
        </div>

        <div className="sk-bar">
          {periods.length > 1 && (
            <div className="sk-perioder" role="tablist">
              {periods.map((p) => {
                const n = S.blocks.filter((b) => S.slots.some((s) => s.block === b.id && inPeriod(s, p.id)) && b.subjects.some((x) => inPeriod(x, p.id)));
                const c = n.filter((b) => b.subjects.some((x) => x.id === choices[p.id]?.[b.id])).length;
                return (
                  <button key={p.id} type="button" role="tab" aria-selected={p.id === period} className={p.id === period ? "on" : ""} onClick={() => setPeriod(p.id)}>
                    {p.name}
                    <small>
                      {c}/{n.length}
                    </small>
                  </button>
                );
              })}
            </div>
          )}
          <span className="sk-tal">{tr("{n} af {m} fag valgt", { n: done, m: blocks.length })}</span>
          {done > 0 && (
            <button type="button" className="sk-ryd" onClick={clear}>
              {tr("Ryd skema")}
            </button>
          )}
        </div>

        <div className="sk-body">
          <aside className="sk-liste">
            {blocks.map((b) => (
              <section key={b.id}>
                <b>{b.name}</b>
                {b.when && <small>{b.when}</small>}
                <div>
                  {b.subjects
                    .filter((x) => inPeriod(x, period))
                    .map((x) => (
                      <span key={x.id} className={`sk-chip ${mine[b.id] === x.id ? "on" : ""}`}>
                        <button type="button" onClick={() => pick(b, x)}>
                          {mine[b.id] === x.id ? "✓ " : ""}
                          {x.name}
                        </button>
                        <button type="button" className="sk-mere" aria-label={`${tr("Læs mere")}: ${x.name}`} onClick={() => openCard(x, b)}>
                          ›
                        </button>
                      </span>
                    ))}
                </div>
              </section>
            ))}
          </aside>

          <div className="sk-uge">
            <div className="sk-dage" role="tablist">
              {days.map((d) => (
                <button key={d.i} type="button" role="tab" aria-selected={d.i === dayAt} className={d.i === dayAt ? "on" : ""} onClick={() => setDayAt(d.i)}>
                  {d.name.slice(0, 3)}
                </button>
              ))}
            </div>
            {S.daily?.length ? (
              <div className="sk-daglig">
                {S.daily.map((d, i) => (
                  <span key={i}>
                    <time>{d.time}</time> {d.title}
                  </span>
                ))}
              </div>
            ) : null}
            <div className="sk-grid" style={{ ["--sk-days" as string]: days.length }}>
              {days.map((d) => (
                <div key={d.i} className={`sk-dag ${d.i === dayAt ? "on" : ""}`}>
                  <h4>{d.name}</h4>
                  {d.slots.map(slotView)}
                </div>
              ))}
            </div>
            {S.note && <p className="sk-note">{S.note}</p>}
          </div>
        </div>

        {S.visit?.label && S.visit.href && (
          <div className={`sk-cta ${allDone ? "sk-klar" : ""}`}>
            {allDone && <span>{tr("Dit skema er klar.")}</span>}
            <button type="button" className="hv-btn hv-primary" onClick={() => onVisit(S.visit!.label, S.visit!.href)}>
              {S.visit.label}
            </button>
          </div>
        )}

        {pickerBlock && (
          <div className="sk-pop" onClick={() => setPicker(null)}>
            <div className="sk-pop-in" onClick={(e) => e.stopPropagation()}>
              <div className="sk-pop-head">
                <b>{pickerBlock.name}</b>
                {pickerBlock.when && <small>{pickerBlock.when}</small>}
                <button type="button" className="sk-x" aria-label={tr("Luk")} onClick={() => setPicker(null)}>
                  ×
                </button>
              </div>
              {pickerBlock.subjects
                .filter((x) => inPeriod(x, period))
                .map((x) => (
                  <div key={x.id} className={`sk-pop-row ${mine[pickerBlock.id] === x.id ? "on" : ""}`}>
                    <button type="button" onClick={() => pick(pickerBlock, x)}>
                      <b>{x.name}</b>
                      {x.text && <small>{x.text}</small>}
                    </button>
                    <button type="button" className="sk-mere" aria-label={`${tr("Læs mere")}: ${x.name}`} onClick={() => openCard(x, pickerBlock)}>
                      ›
                    </button>
                  </div>
                ))}
            </div>
          </div>
        )}

        {card && (
          <SubjectCard
            subject={card.subject}
            block={card.block}
            picked={mine[card.block.id] === card.subject.id}
            canPick={blocks.includes(card.block) && inPeriod(card.subject, period)}
            onPick={() => (pick(card.block, card.subject), setCard(null))}
            onSee={() => (onTrack("schedule_place", { label: card.subject.name }), onSee(card.subject.href!, card.subject.name))}
            onImages={(at) => onImages(card.subject.images ?? [], at, card.subject.name)}
            onClose={() => setCard(null)}
          />
        )}
      </div>
    </div>
  );
}

/** A subject, shown the best way there is: its film or photos, its text, its teachers - and its place in the tour when it has one. */
function SubjectCard({
  subject: x,
  block,
  picked,
  canPick,
  onPick,
  onSee,
  onImages,
  onClose,
}: {
  subject: ScheduleSubject;
  block: ScheduleBlock;
  picked: boolean;
  canPick: boolean;
  onPick: () => void;
  onSee: () => void;
  onImages: (at: number) => void;
  onClose: () => void;
}) {
  const tr = useT();
  const embed = x.video ? videoEmbed(x.video) : null;
  const [img, setImg] = useState(0);
  const images = x.images ?? [];
  return (
    <div className="sk-pop" onClick={onClose}>
      <div className="sk-kort" role="dialog" aria-label={x.name} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="sk-x sk-kort-x" aria-label={tr("Luk")} onClick={onClose}>
          ×
        </button>
        {x.video ? (
          <div className="sk-media">
            {embed ? (
              <iframe src={embed} title={x.name} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen />
            ) : (
              <video src={x.video} controls playsInline preload="metadata" />
            )}
          </div>
        ) : images.length ? (
          <div className="sk-media">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={images[img]} alt={x.name} onClick={() => onImages(img)} />
            {images.length > 1 && (
              <div className="sk-prikker">
                {images.map((_, i) => (
                  <button key={i} type="button" aria-label={`${i + 1}`} className={i === img ? "on" : ""} onClick={() => setImg(i)} />
                ))}
              </div>
            )}
          </div>
        ) : null}
        <div className="sk-kort-txt">
          <small>
            {block.name}
            {block.when ? ` · ${block.when}` : ""}
          </small>
          <b>{x.name}</b>
          {x.text && <p>{x.text}</p>}
          {x.people?.length ? (
            <div className="sk-folk">
              {x.people.slice(0, 4).map((p, i) => (
                <span key={i}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.image} alt="" />
                  <span>
                    {p.name && <b>{p.name}</b>}
                    {p.role && <small>{p.role}</small>}
                  </span>
                </span>
              ))}
            </div>
          ) : null}
          <div className="sk-kort-knapper">
            {canPick && (
              <button type="button" className={`hv-btn ${picked ? "hv-secondary" : "hv-primary"}`} disabled={picked} onClick={onPick}>
                {picked ? `✓ ${tr("Valgt")}` : tr("Vælg {fag}", { fag: x.name })}
              </button>
            )}
            {x.href && (
              <button type="button" className="hv-btn hv-secondary" onClick={onSee}>
                {tr("Se stedet")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export const SCHEDULE_CSS = `
.sk{position:absolute;inset:0;z-index:36;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.4);animation:hvFade .2s ease}
.sk-sheet{position:relative;width:min(1180px,calc(100% - 24px));height:min(860px,calc(100% - 24px));display:flex;flex-direction:column;border-radius:22px;background:#fff;color:#1d2a30;box-shadow:0 24px 70px rgba(0,0,0,.45);overflow:hidden;animation:hvUp .3s cubic-bezier(.2,.7,.2,1) both}
.sk-head{display:flex;align-items:flex-start;gap:12px;padding:20px 22px 6px}
.sk-head b{display:block;font-family:var(--font-heading);font-size:24px;color:var(--c-main)}
.sk-head p{margin:4px 0 0;font-size:14.5px;line-height:1.45;color:#56636a;max-width:70ch}
.sk-x{margin-left:auto;flex:none;width:34px;height:34px;border:0;border-radius:50%;background:#f1f2f3;font-size:20px;line-height:1;cursor:pointer;color:#1d2a30}
.sk-bar{display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px;padding:8px 22px 12px;border-bottom:1px solid #eceeef}
.sk-perioder{display:inline-flex;padding:3px;border-radius:12px;background:#f1f2f3}
.sk-perioder button{display:flex;align-items:baseline;gap:6px;border:0;background:none;padding:7px 13px;border-radius:9px;font:inherit;font-weight:700;font-size:14px;color:#56636a;cursor:pointer}
.sk-perioder button.on{background:#fff;color:var(--c-main);box-shadow:0 1px 4px rgba(0,0,0,.12)}
.sk-perioder small{font-size:11.5px;opacity:.7}
.sk-tal{font-size:13.5px;font-weight:600;color:#56636a}
.sk-ryd{border:0;background:none;font:inherit;font-size:13px;color:#8a969b;text-decoration:underline;cursor:pointer}
.sk-body{flex:1;min-height:0;display:grid;grid-template-columns:290px minmax(0,1fr)}
.sk-liste{overflow-y:auto;overscroll-behavior:contain;padding:14px 16px 20px 22px;border-right:1px solid #eceeef;background:#fafafa}
.sk-liste section{margin-bottom:16px}
.sk-liste section>b{display:block;font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--c-main)}
.sk-liste section>small{display:block;font-size:12.5px;color:#6b7a80;margin:1px 0 7px}
.sk-liste section>div{display:flex;flex-direction:column;gap:5px}
.sk-chip{display:flex;align-items:stretch;border-radius:11px;background:#fff;box-shadow:inset 0 0 0 1px #e3e6e8;overflow:hidden}
.sk-chip button{border:0;background:none;font:inherit;cursor:pointer;color:#1d2a30}
.sk-chip>button:first-child{flex:1;text-align:left;padding:8px 11px;font-size:14px;font-weight:600}
.sk-chip.on{background:var(--c-soft);box-shadow:inset 0 0 0 1.5px var(--c-accent)}
.sk-chip.on>button:first-child{color:var(--c-main);font-weight:800}
.sk-mere{flex:none;width:36px;font-size:18px!important;color:#8a969b!important;border-left:1px solid #eceeef!important}
.sk-chip .sk-mere:hover,.sk-pop-row .sk-mere:hover{background:#f3f4f5}
.sk-uge{min-width:0;overflow:auto;overscroll-behavior:contain;padding:14px 18px 20px}
.sk-dage{display:none}
.sk-daglig{display:flex;flex-wrap:wrap;gap:6px 14px;margin-bottom:12px;padding:9px 12px;border-radius:12px;background:#f5f6f7;font-size:13px;color:#56636a}
.sk-daglig time{font-weight:800;color:var(--c-main);font-variant-numeric:tabular-nums}
.sk-grid{display:grid;grid-template-columns:repeat(var(--sk-days),minmax(150px,1fr));gap:10px}
.sk-dag h4{margin:0 0 8px;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#6b7a80}
.sk-slot{position:relative;margin-bottom:8px;padding:10px 11px;border-radius:13px;background:#f5f6f7}
.sk-slot small{display:block;font-size:11px;font-weight:700;letter-spacing:.03em;color:#6b7a80;text-transform:uppercase}
.sk-fast b{display:block;margin-top:3px;font-size:14px}
.sk-fast p{margin:3px 0 0;font-size:12.5px;line-height:1.4;color:#56636a}
.sk-valg{background:#fff;box-shadow:inset 0 0 0 1.5px #e3e6e8}
.sk-valg.sk-har{background:var(--c-soft);box-shadow:inset 0 0 0 1.5px var(--c-accent)}
.sk-slot button{border:0;background:none;font:inherit;cursor:pointer;padding:0;color:inherit;text-align:left}
.sk-vaelg{display:block;width:100%;margin-top:6px;padding:9px 10px!important;border-radius:10px;border:1.5px dashed #c9cfd3!important;font-weight:700!important;font-size:13.5px;color:var(--c-main)!important;text-align:center!important}
.sk-vaelg:hover{border-color:var(--c-accent)!important}
.sk-fag{display:flex;align-items:center;justify-content:space-between;gap:6px;width:100%;margin-top:4px;font-weight:800!important;font-size:15px;color:var(--c-main)!important}
.sk-skift{margin-top:4px;font-size:12px!important;color:#6b7a80!important;text-decoration:underline!important}
.sk-se{margin-top:5px;font-size:12.5px!important;font-weight:700!important;color:var(--c-accent)!important}
.sk-note{margin:12px 0 0;font-size:12.5px;color:#8a969b}
.sk-cta{display:flex;align-items:center;justify-content:flex-end;gap:14px;padding:12px 22px;border-top:1px solid #eceeef}
.sk-cta span{font-weight:800;color:var(--c-main)}
.sk-klar{background:var(--c-soft)}
.sk-pop{position:absolute;inset:0;z-index:2;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.35);animation:hvFade .15s ease}
.sk-pop-in{width:min(460px,100%);max-height:100%;overflow-y:auto;border-radius:20px;background:#fff;padding:14px;box-shadow:0 20px 50px rgba(0,0,0,.35);animation:hvUp .25s ease both}
.sk-pop-head{display:flex;align-items:flex-start;gap:8px;padding:4px 4px 10px;flex-wrap:wrap}
.sk-pop-head b{font-size:18px;color:var(--c-main);font-family:var(--font-heading)}
.sk-pop-head small{flex-basis:100%;order:3;font-size:13px;color:#6b7a80}
.sk-pop-row{display:flex;align-items:stretch;margin-top:6px;border-radius:13px;box-shadow:inset 0 0 0 1px #e3e6e8;overflow:hidden}
.sk-pop-row.on{background:var(--c-soft);box-shadow:inset 0 0 0 1.5px var(--c-accent)}
.sk-pop-row button{border:0;background:none;font:inherit;cursor:pointer;color:#1d2a30;text-align:left}
.sk-pop-row>button:first-child{flex:1;padding:11px 13px}
.sk-pop-row b{display:block;font-size:15px}
.sk-pop-row small{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin-top:2px;font-size:12.5px;line-height:1.4;color:#56636a}
.sk-kort{position:relative;width:min(520px,100%);max-height:100%;overflow-y:auto;border-radius:20px;background:#fff;box-shadow:0 20px 50px rgba(0,0,0,.35);animation:hvUp .25s ease both}
.sk-kort-x{position:absolute;right:10px;top:10px;z-index:1;background:rgba(255,255,255,.92)}
.sk-media{position:relative;aspect-ratio:16/9;background:#0d1b20}
.sk-media img,.sk-media video,.sk-media iframe{display:block;width:100%;height:100%;object-fit:cover;border:0}
.sk-media img{cursor:zoom-in}
.sk-prikker{position:absolute;left:0;right:0;bottom:10px;display:flex;justify-content:center;gap:6px}
.sk-prikker button{width:8px;height:8px;padding:0;border:0;border-radius:50%;background:rgba(255,255,255,.55);cursor:pointer}
.sk-prikker button.on{background:#fff}
.sk-kort-txt{padding:16px 18px 18px}
.sk-kort-txt>small{display:block;font-size:11.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#6b7a80}
.sk-kort-txt>b{display:block;margin-top:4px;font-family:var(--font-heading);font-size:22px;color:var(--c-main)}
.sk-kort-txt>p{margin:8px 0 0;font-size:14.5px;line-height:1.55;color:#3d4a50}
.sk-folk{display:flex;flex-wrap:wrap;gap:10px;margin-top:12px}
.sk-folk>span{display:flex;align-items:center;gap:8px}
.sk-folk img{width:36px;height:36px;border-radius:50%;object-fit:cover}
.sk-folk b{display:block;font-size:13px}
.sk-folk small{display:block;font-size:12px;color:#6b7a80}
.sk-kort-knapper{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}
.sk-kort-knapper .hv-btn{padding:11px 16px;font-size:14px}
@media (max-width:760px){
  .sk{align-items:flex-end}
  .sk-sheet{width:100%;height:calc(100% - 12px);border-radius:22px 22px 0 0;padding-bottom:env(safe-area-inset-bottom,0px)}
  .sk-head{padding:16px 16px 4px}
  .sk-head b{font-size:21px}
  .sk-bar{padding:6px 16px 10px}
  .sk-body{grid-template-columns:1fr}
  .sk-liste{display:none}
  .sk-uge{padding:10px 14px 16px}
  .sk-dage{display:flex;gap:4px;margin-bottom:10px;position:sticky;top:-10px;z-index:1;padding:4px 0;background:#fff}
  .sk-dage button{flex:1;border:0;padding:8px 0;border-radius:10px;background:#f1f2f3;font:inherit;font-weight:800;font-size:13px;color:#56636a;cursor:pointer}
  .sk-dage button.on{background:var(--c-main);color:#fff}
  .sk-grid{grid-template-columns:1fr}
  .sk-dag{display:none}
  .sk-dag.on{display:block}
  .sk-dag h4{display:none}
  .sk-cta{padding:10px 16px}
  .sk-cta .hv-btn{flex:1}
  .sk-pop{align-items:flex-end;padding:0}
  .sk-pop-in,.sk-kort{width:100%;max-height:90%;border-radius:20px 20px 0 0}
}
`;
