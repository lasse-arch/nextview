"use client";

import { useState } from "react";
import { TourLink } from "./links";
import type { AvailableUnit } from "@/lib/availability/boxdepotet";
import type { DockIcon, TourConfig, TourPlace } from "../tours/types";

/*
 * Designs a tour can pick besides the classic ones (tile welcome, side menu):
 * the "cover" welcome - the place's own photo full-screen, its name big, and
 * its real spots to choose from - and the "dock" menu - a floating bar at the
 * bottom with what a guest actually came for (places, menu, book, order).
 */

const DOCK_ICONS: Record<DockIcon, string> = {
  places: '<path d="M6 19v-6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v6M6 15h12M8 11V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v5"/>',
  menu: '<path d="M4 5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2zM8 8h6M8 12h6M8 16h4"/>',
  book: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18M9 15l2 2 4-4"/>',
  order: '<path d="M6 7h12l-1 13H7zM9 7a3 3 0 0 1 6 0"/>',
  map: '<path d="M12 21s-7-6.3-7-11a7 7 0 0 1 14 0c0 4.7-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  play: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l5.5-3.5z"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
};

function Icon({ name }: { name: DockIcon }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: DOCK_ICONS[name] }} />
  );
}

function PlaceCards({ places, current, onPick }: { places: TourPlace[]; current?: string | null; onPick: (p: TourPlace) => void }) {
  return (
    <div className="dz-places">
      {places.map((p, i) => (
        <button key={p.name} type="button" className={`dz-place ${p.name === current ? "nu" : ""}`} style={{ animationDelay: `${0.25 + i * 0.07}s` }} onClick={() => onPick(p)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.image} alt="" loading="lazy" />
          <span>
            {p.kicker && <i>{p.kicker}</i>}
            <b>{p.name}</b>
          </span>
        </button>
      ))}
    </div>
  );
}

/** The cover welcome: the place's own photo, its name, and where you'd like to sit. */
export function CoverWelcome({
  T,
  onEnter,
  onPlace,
  onGuide,
  onCta,
  waiting,
}: {
  T: TourConfig;
  waiting?: boolean;
  onEnter: () => void;
  onPlace: (p: TourPlace) => void;
  onGuide?: () => void;
  onCta: (label: string, href: string) => void;
}) {
  const C = T.cover!;
  return (
    <div className="dz-cover" style={{ "--cover": `url(${C.image})`, "--cover-m": `url(${C.imageMobile ?? C.image})` } as React.CSSProperties}>
      <div className="dz-cover-text">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={T.logo} alt={T.brand} className="dz-cover-logo" />
        <div className="dz-kicker">{C.kicker}</div>
        <h1>{C.title}</h1>
        <p>{C.lead}</p>
        <div className="dz-cover-actions">
          <button type="button" className={`dz-btn dz-gold ${waiting ? "dz-venter" : ""}`} onClick={onEnter} disabled={waiting}>
            {waiting ? "Åbner…" : C.enter} <span aria-hidden>{waiting ? "" : "→"}</span>
          </button>
          {onGuide && (
            <button type="button" className="dz-btn dz-line" onClick={onGuide}>
              ▶ Vis mig rundt
            </button>
          )}
          {T.cta.map((c) => (
            <TourLink key={c.label} className="dz-btn dz-line" href={c.href} label={c.label} onClick={() => onCta(c.label, c.href)}>
              {c.label}
            </TourLink>
          ))}
        </div>
      </div>
      {T.places && T.places.length > 0 && (
        <div className="dz-cover-places">
          <div className="dz-kicker">{C.placesTitle}</div>
          <PlaceCards places={T.places} onPick={onPlace} />
        </div>
      )}
    </div>
  );
}

/** The dock menu: a floating bar at the bottom; "places" opens the photo cards above it. */
export function DockMenu({
  T,
  room,
  onPlace,
  onGuide,
  onItem,
}: {
  T: TourConfig;
  room: string | null;
  onGuide: () => void;
  onPlace: (p: TourPlace) => void;
  onItem: (label: string, href: string) => void;
}) {
  const [sheet, setSheet] = useState(false);
  const primary = T.dock?.find((d) => d.primary && typeof d.go !== "string");
  const atPlace = room && T.places?.some((p) => p.name === room);
  return (
    <>
      {sheet && T.places && (
        <div className="dz-sheet">
          <div className="dz-sheet-head">
            <span className="dz-kicker">{T.cover?.placesTitle ?? "Steder"}</span>
            <button type="button" aria-label="Luk" onClick={() => setSheet(false)}>
              ×
            </button>
          </div>
          <PlaceCards
            places={T.places}
            current={room}
            onPick={(p) => {
              setSheet(false);
              onPlace(p);
            }}
          />
        </div>
      )}
      {!sheet && atPlace && primary && typeof primary.go !== "string" && (
        <TourLink className="dz-here" href={primary.go.href} label={primary.label} onClick={() => onItem(`${primary.label} (${room})`, (primary.go as { href: string }).href)}>
          <span>{room}</span>
          <b>{primary.label} her →</b>
        </TourLink>
      )}
      <nav className="dz-dock">
        {T.dock?.map((d) =>
          d.go === "guide" ? (
            <button key={d.label} type="button" onClick={onGuide}>
              <Icon name={d.icon} />
              <span>{d.label}</span>
            </button>
          ) : d.go === "places" ? (
            <button key={d.label} type="button" className={sheet ? "aaben" : ""} onClick={() => setSheet((s) => !s)}>
              <Icon name={d.icon} />
              <span>{d.label}</span>
            </button>
          ) : (
            <TourLink key={d.label} className={d.primary ? "dz-primary" : ""} href={d.go.href} label={d.label} onClick={() => onItem(d.label, (d.go as { href: string }).href)}>
              <Icon name={d.icon} />
              <span>{d.label}</span>
            </TourLink>
          )
        )}
      </nav>
    </>
  );
}

/**
 * The room picker: the menu's groups on one row (e.g. the sizes), the chosen
 * group's rooms on the next (e.g. empty / with boxes) - for comparing rooms
 * side by side without walking. Starts on the room the tour starts in.
 */
export function PickerMenu({
  T,
  units = [],
  onGo,
  onCta,
}: {
  T: TourConfig;
  units?: AvailableUnit[];
  onGo: (name: string, group: string, href: string) => void;
  onCta: (label: string, href: string) => void;
}) {
  const groups = T.menu.filter((m): m is { title: string; items: [string, string][] } => "items" in m);
  const startSs = new URL(T.start).searchParams.get("ss");
  const ssOf = (href: string) => new URL(href).searchParams.get("ss");
  const first = groups.flatMap((g) => g.items.map((i) => [g.title, i[0]] as const)).find(([g, n]) => ssOf(groups.find((x) => x.title === g)!.items.find((i) => i[0] === n)![1]) === startSs);
  const [group, setGroup] = useState(first?.[0] ?? groups[0]?.title);
  const [item, setItem] = useState<string | null>(first?.[1] ?? null);
  const current = groups.find((g) => g.title === group);
  const cta = T.cta.find((c) => c.primary);
  const [showFree, setShowFree] = useState(false);
  const [open, setOpen] = useState(true);
  /** The live available rooms that fit a group's size range - available now first, then by price. */
  const freeIn = (title: string) => {
    const r = T.availability?.ranges[title];
    if (!r) return [];
    return units
      .filter((u) => u.m3 >= r[0] && u.m3 < r[1])
      .sort((a, b) => Number(a.from != null) - Number(b.from != null) || a.price - b.price);
  };
  const free = group ? freeIn(group) : [];
  const kr = (n: number) => n.toLocaleString("da-DK");
  function pick(g: string, name: string, href: string) {
    setGroup(g);
    setItem(name);
    onGo(name, g, href);
  }
  if (!open) {
    return (
      <button type="button" className="pk-mini" onClick={() => setOpen(true)}>
        <span>{group?.replace(/^[^:]*:\s*/, "")}</span>
        {item && <span className="pk-mini-item">{item}</span>}
        <b>Skift rum ▴</b>
      </button>
    );
  }
  return (
    <div className="pk">
      <button type="button" className="pk-luk" aria-label="Skjul rumvælgeren" onClick={() => (setOpen(false), setShowFree(false))}>
        ▾
      </button>
      {showFree && free.length > 0 && (
        <div className="pk-free">
          {free.map((u) => (
            <div key={u.no} className="pk-unit">
              <b>#{u.no}</b>
              <span>{u.m3.toLocaleString("da-DK")} m³</span>
              <span className={u.from ? "" : "nu"}>{u.from ? `Ledig fra ${u.from.slice(0, 5).replace("-", "/")}` : "Ledig nu"}</span>
              <span className="pk-pris">{kr(u.price)} kr./md.</span>
              <TourLink className="pk-book" href={u.bookUrl} label={`Book depotrum #${u.no}`} onClick={() => onCta(`Book #${u.no}`, u.bookUrl)}>
                Book
              </TourLink>
            </div>
          ))}
        </div>
      )}
      {T.availability && group && (
        <button type="button" className={`pk-ledige ${showFree ? "aaben" : ""}`} onClick={() => setShowFree((v) => !v)} disabled={!free.length}>
          {free.length
            ? `${free.length} ledige i denne størrelse · fra ${kr(Math.min(...free.map((u) => u.price)))} kr./md.`
            : "Ingen ledige i denne størrelse lige nu"}
          {free.length > 0 && <i>{showFree ? "▾" : "▴"}</i>}
        </button>
      )}
      <div className="pk-row pk-groups">
        {groups.map((g) => (
          <button
            key={g.title}
            type="button"
            className={g.title === group ? "nu" : ""}
            onClick={() => {
              // Same kind of room in the new size if there is one, otherwise its first.
              const same = g.items.find((i) => i[0] === item) ?? g.items[0];
              pick(g.title, same[0], same[1]);
            }}
          >
            {g.title.replace(/^[^:]*:\s*/, "")}
            {T.availability && <span className={`pk-badge ${freeIn(g.title).length ? "" : "tom"}`}>{freeIn(g.title).length}</span>}
          </button>
        ))}
      </div>
      {current && (
        <div className="pk-row pk-items">
          {current.items.map(([name, href]) => (
            <button key={name} type="button" className={name === item ? "nu" : ""} onClick={() => pick(current.title, name, href)}>
              {name}
            </button>
          ))}
          {cta && (
            <TourLink className="pk-cta" href={cta.href} label={cta.label} onClick={() => onCta(cta.label, cta.href)}>
              {cta.label}
            </TourLink>
          )}
        </div>
      )}
    </div>
  );
}

export const DESIGNS_CSS = `
/* ---- Room picker ---- */
.pk{position:absolute;left:50%;bottom:18px;translate:-50% 0;z-index:9;display:flex;flex-direction:column;gap:8px;max-width:calc(100% - 24px);padding:10px;border-radius:22px;background:rgba(255,255,255,.94);box-shadow:0 14px 40px rgba(0,0,0,.3);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);animation:hvUp .5s cubic-bezier(.2,.7,.2,1) both}
.pk-row{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none}
.pk-row::-webkit-scrollbar{display:none}
.pk-row button{flex:none;border:0;border-radius:999px;padding:9px 16px;font:inherit;font-weight:700;font-size:14px;cursor:pointer;background:#eef1f2;color:var(--c-main);transition:background .15s,color .15s}
.pk-groups button{font-size:16px;font-weight:800;padding:10px 18px}
.pk-items{flex-wrap:wrap;max-width:720px}
.pk-luk{position:absolute;top:-14px;right:14px;width:30px;height:30px;border:0;border-radius:50%;background:#fff;color:var(--c-main);font-size:14px;font-weight:800;cursor:pointer;box-shadow:0 3px 10px rgba(0,0,0,.25)}
.pk-mini{position:absolute;left:50%;bottom:18px;translate:-50% 0;z-index:9;display:flex;align-items:center;gap:10px;border:0;border-radius:999px;padding:8px 8px 8px 18px;background:rgba(255,255,255,.95);color:var(--c-main);font:inherit;font-weight:800;font-size:15px;cursor:pointer;box-shadow:0 10px 30px rgba(0,0,0,.3);white-space:nowrap;animation:hvUp .35s ease both}
.pk-mini-item{font-weight:600;color:#56636a}
.pk-mini b{padding:8px 14px;border-radius:999px;background:var(--c-accent);color:#fff;font-size:13px}
.pk-badge{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;margin-left:7px;padding:0 6px;border-radius:999px;background:var(--c-accent);color:#fff;font-size:11px;font-weight:800;vertical-align:2px}
.pk-groups button.nu .pk-badge{background:#fff;color:var(--c-main)}
.pk-badge.tom{background:#c9cfd2}
.pk-ledige{display:flex;align-items:center;justify-content:space-between;gap:10px;border:0;border-radius:12px;padding:10px 14px;background:color-mix(in srgb,var(--c-accent) 12%,#fff);color:var(--c-accent-dark);font:inherit;font-weight:800;font-size:14px;cursor:pointer;text-align:left}
.pk-ledige:disabled{background:#f1f2f3;color:#7b878c;cursor:default}
.pk-free{display:flex;flex-direction:column;gap:6px;max-height:min(46vh,360px);overflow-y:auto;padding:2px}
.pk-unit{display:grid;grid-template-columns:auto 1fr auto auto auto;align-items:center;gap:12px;padding:9px 10px 9px 14px;border-radius:12px;background:#f6f7f7;font-size:14px;color:#3d4a50}
.pk-unit b{color:var(--c-main);font-size:15px}
.pk-unit .nu{color:var(--c-accent-dark);font-weight:800}
.pk-pris{font-weight:800;color:var(--c-main);white-space:nowrap}
.pk-book{border-radius:999px;padding:7px 14px;background:var(--c-accent);color:#fff;font-weight:800;font-size:13px;text-decoration:none}
.pk-row button.nu{background:var(--c-main);color:#fff}
.pk-items button.nu{background:var(--c-accent);color:#fff}
.pk-cta{flex:none;margin-left:auto;border-radius:999px;padding:9px 16px;background:var(--c-accent);color:#fff;font-weight:800;font-size:14px;text-decoration:none;white-space:nowrap}
.hv:has(.pk) .hv-room{display:none} /* the picker already shows where you are */
@media (max-width:760px){
  .pk{left:8px;right:8px;translate:none;max-width:none;bottom:calc(8px + env(safe-area-inset-bottom,0px));border-radius:18px;padding:8px}
  .pk-mini{bottom:calc(10px + env(safe-area-inset-bottom,0px));max-width:calc(100% - 20px)}
  .pk-groups button{font-size:15px;padding:9px 14px}
  .pk-row button{font-size:13px;padding:8px 13px}
  .pk-cta{margin-left:0}
  .pk-unit{grid-template-columns:auto 1fr auto;gap:4px 10px;font-size:13px}
  .pk-unit .pk-pris{grid-column:2}
  .pk-unit .pk-book{grid-column:3;grid-row:1 / span 2}
}
.dz-kicker{font-size:11px;font-weight:600;letter-spacing:.22em;text-transform:uppercase;color:var(--c-accent)}
.hv h1,.dz-cover h1{font-family:var(--font-heading)}
/* ---- Cover welcome ---- */
.dz-cover{position:absolute;inset:0;z-index:12;display:flex;flex-direction:column;justify-content:space-between;padding:56px 64px 40px;background:linear-gradient(100deg,rgba(12,9,6,.92) 0%,rgba(12,9,6,.72) 38%,rgba(12,9,6,.12) 70%),var(--cover) center/cover;color:#f6efe2;animation:hvFade .6s ease;overflow-y:auto}
.dz-cover.ude{opacity:0;pointer-events:none;transition:opacity .6s}
.dz-cover-text{max-width:520px;animation:hvUp .8s cubic-bezier(.2,.7,.2,1) both}
.dz-cover-logo{width:150px;height:auto;margin-bottom:28px;filter:drop-shadow(0 4px 16px rgba(0,0,0,.5))}
.dz-cover h1{margin:12px 0 14px;font-size:68px;line-height:.98;font-weight:500;letter-spacing:-.01em;color:#fff}
.dz-cover p{margin:0 0 28px;font-size:17px;line-height:1.6;color:rgba(246,239,226,.82);max-width:440px}
.dz-cover-actions{display:flex;flex-wrap:wrap;gap:10px}
.dz-btn{display:inline-flex;align-items:center;gap:10px;border-radius:999px;padding:14px 24px;font:inherit;font-size:15px;font-weight:600;letter-spacing:.02em;cursor:pointer;text-decoration:none;transition:transform .15s,background .15s}
.dz-btn:hover{transform:translateY(-2px)}
.dz-gold{border:0;background:var(--c-accent);color:#1a1209;box-shadow:0 10px 30px rgba(0,0,0,.35)}
.dz-gold:hover{background:var(--c-accent-dark)}
.dz-venter{cursor:progress;animation:dzVent 1.2s ease-in-out infinite}
@keyframes dzVent{50%{opacity:.7}}
.dz-line{border:1px solid rgba(246,239,226,.45);background:rgba(0,0,0,.18);color:#f6efe2;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
.dz-line:hover{border-color:var(--c-accent);color:var(--c-accent)}
.dz-cover-places{align-self:flex-end;max-width:100%;display:flex;flex-direction:column;gap:12px}
.dz-places{display:flex;gap:12px;overflow-x:auto;scrollbar-width:none;padding:4px 2px 6px}
.dz-places::-webkit-scrollbar{display:none}
.dz-place{position:relative;flex:none;width:190px;height:136px;border:0;border-radius:16px;overflow:hidden;padding:0;cursor:pointer;background:#000;box-shadow:0 10px 26px rgba(0,0,0,.4);animation:hvUp .6s cubic-bezier(.2,.7,.2,1) both;transition:transform .2s}
.dz-place:hover{transform:translateY(-4px)}
.dz-place img{width:100%;height:100%;object-fit:cover;transition:transform .6s}
.dz-place:hover img{transform:scale(1.06)}
.dz-place span{position:absolute;inset:auto 0 0 0;display:flex;flex-direction:column;align-items:flex-start;padding:22px 12px 10px;background:linear-gradient(transparent,rgba(0,0,0,.78));text-align:left}
.dz-place i{font-style:normal;font-size:9.5px;letter-spacing:.18em;text-transform:uppercase;color:var(--c-accent)}
.dz-place b{font-family:var(--font-heading);font-size:19px;font-weight:600;color:#fff;line-height:1.1}
.dz-place.nu{outline:2px solid var(--c-accent);outline-offset:-2px}
/* ---- Dock menu ---- */
.dz-dock{position:absolute;left:50%;bottom:18px;translate:-50% 0;z-index:9;display:flex;gap:4px;padding:6px;border-radius:22px;background:rgba(16,12,8,.8);border:1px solid rgba(224,185,110,.28);box-shadow:0 14px 40px rgba(0,0,0,.4);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);animation:hvUp .5s cubic-bezier(.2,.7,.2,1) both}
.dz-dock>*{display:flex;flex-direction:column;align-items:center;gap:3px;min-width:76px;padding:9px 12px 7px;border:0;border-radius:16px;background:none;color:#f1e7d3;font:inherit;font-size:11.5px;font-weight:600;letter-spacing:.03em;text-decoration:none;cursor:pointer;transition:background .15s,color .15s}
.dz-dock>* svg{width:22px;height:22px}
.dz-dock>*:hover,.dz-dock>.aaben{background:rgba(255,255,255,.08);color:var(--c-accent)}
.dz-dock>.dz-primary{background:var(--c-accent);color:#1a1209}
.dz-dock>.dz-primary:hover{background:var(--c-accent-dark);color:#1a1209}
.dz-sheet{position:absolute;left:50%;bottom:104px;translate:-50% 0;z-index:9;width:min(1040px,calc(100vw - 32px));padding:14px 16px 12px;border-radius:22px;background:rgba(16,12,8,.82);border:1px solid rgba(224,185,110,.22);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);animation:hvUp .35s cubic-bezier(.2,.7,.2,1) both}
.dz-sheet-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
.dz-sheet-head button{border:0;background:rgba(255,255,255,.1);color:#fff;width:30px;height:30px;border-radius:50%;font-size:18px;cursor:pointer}
.dz-here{position:absolute;left:50%;bottom:104px;translate:-50% 0;z-index:8;display:flex;align-items:center;gap:12px;padding:8px 8px 8px 18px;border-radius:999px;background:rgba(16,12,8,.8);color:#f1e7d3;text-decoration:none;font-size:14px;white-space:nowrap;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);animation:hvUp .4s ease both}
.dz-here span{font-family:var(--font-heading);font-size:18px;font-weight:600}
.dz-here b{padding:7px 14px;border-radius:999px;background:var(--c-accent);color:#1a1209;font-size:13px}
.hv-dock .hv-room{display:none}
.hv-dock .hv-dev{bottom:auto;top:12px;right:12px}
@media (max-width:760px){
  .dz-cover{padding:28px 20px calc(18px + env(safe-area-inset-bottom,0px));background:linear-gradient(rgba(12,9,6,.55),rgba(12,9,6,.86) 55%,rgba(12,9,6,.95)),var(--cover-m) center/cover}
  .dz-cover-logo{width:96px;margin-bottom:14px}
  .dz-cover h1{font-size:42px}
  .dz-cover p{font-size:15px;margin-bottom:18px}
  .dz-cover-actions{flex-direction:column;align-items:stretch}
  .dz-btn{justify-content:center;padding:13px 18px}
  .dz-cover-places{align-self:stretch;margin:22px -20px 0}
  .dz-cover-places .dz-kicker{padding:0 20px}
  .dz-places{padding:4px 20px 6px}
  .dz-place{width:150px;height:112px}
  .dz-dock{left:8px;right:8px;bottom:calc(8px + env(safe-area-inset-bottom,0px));translate:none;justify-content:space-between}
  .dz-dock>*{min-width:0;flex:1;padding:8px 2px 6px;font-size:10.5px;white-space:nowrap}
  .dz-sheet{bottom:calc(86px + env(safe-area-inset-bottom,0px))}
  .dz-here{bottom:calc(86px + env(safe-area-inset-bottom,0px))}
}
`;
