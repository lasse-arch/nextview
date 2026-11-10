"use client";

import { useMemo, useState } from "react";
import { useT } from "../tours/i18n-react";
import { apiUrl } from "../tours/api";
import { safeHref } from "../tours/safe";
import type { SiteUnit, TourConfig } from "../tours/types";
import { unitCatKey, unitGroups, unitTour } from "../tours/site-units";
import { quadPoint, quadSolve } from "./staging";

/*
 * "Pladskort" on the flat start picture: the campsite's own site plan laid
 * see-through over the drone photo (bent onto four points of it, so it fits
 * a photo that isn't quite straight down), switched on and off by the
 * visitor. With the plan on, the visitor picks dates and the pitches and
 * cabins free for them light up green (live from the booking, asked only
 * when they press "Vis ledige") - a tap shows "Ledig · Plads 145" and Book.
 */

/** The plan is laid out as a 1000 x 1000 box (stretched to its corners) - units are % of it. */
const BOX = 1000;

export type SitePlanState = {
  on: boolean;
  free: Set<string> | null;
  picked: SiteUnit | null;
  stay: { from: string; to: string } | null;
  /** The kinds the visitor switched off in the filter (sitePlan.unitCats keys). */
  off?: string[];
};

/** The free units the visitor shows (their kind not switched off), each with its kind's colour. */
export function shownUnits(T: TourConfig, state: SitePlanState): { u: SiteUnit; color: string }[] {
  const plan = T.sitePlan;
  if (!state.on || !state.free || !plan?.units) return [];
  const colors = new Map(unitGroups(plan).map((g) => [g.key, g.color]));
  return plan.units.filter((u) => state.free!.has(u.id) && !state.off?.includes(unitCatKey(u))).map((u) => ({ u, color: colors.get(unitCatKey(u)) ?? "#34c759" }));
}

/**
 * The filter while the free units are shown: their kinds (pitches, cabins,
 * rooms, the motel …) in their colours, with how many are free - in place of
 * the drone points' categories (rendered inside .hv-filtre).
 */
export function SitePlanLegend({ T, state, setState }: { T: TourConfig; state: SitePlanState; setState: (fn: (s: SitePlanState) => SitePlanState) => void }) {
  const plan = T.sitePlan;
  if (!plan?.units || !state.free) return null;
  const free = plan.units.filter((u) => state.free!.has(u.id));
  return (
    <div className="hv-chips pk-legend">
      {unitGroups(plan)
        .map((g) => ({ g, n: free.filter((u) => unitCatKey(u) === g.key).length }))
        .filter((x) => x.n > 0)
        .map(({ g, n }) => (
          <button
            key={g.key}
            type="button"
            className={state.off?.includes(g.key) ? "fra" : ""}
            onClick={() => setState((s) => ({ ...s, picked: null, off: s.off?.includes(g.key) ? s.off.filter((k) => k !== g.key) : [...(s.off ?? []), g.key] }))}
          >
            <i style={{ background: g.color }} />
            <span>
              {g.label} <b>{n}</b>
            </span>
          </button>
        ))}
    </div>
  );
}

export const sitePlanReady = (T: TourConfig) => Boolean(T.map && !T.map.panorama && T.sitePlan?.overlay?.corners?.length === 4);

/** The plan's transform onto the picture (px of the picture), and where a unit lands on it. */
export function usePlanGeometry(T: TourConfig) {
  const M = T.map;
  const corners = T.sitePlan?.overlay?.corners;
  return useMemo(() => {
    if (!M || !corners || corners.length !== 4) return null;
    const pts = corners.map(([x, y]) => ({ x: (x / 100) * M.w, y: (y / 100) * M.h }));
    const c = quadSolve(BOX, BOX, pts);
    if (!c) return null;
    const [a0, a1, a2, b0, b1, b2, c0, c1] = c;
    return {
      matrix: `matrix3d(${a0},${b0},0,${c0},${a1},${b1},0,${c1},0,0,1,0,${a2},${b2},0,1)`,
      at: (u: { x: number; y: number }) => quadPoint(c, (u.x / 100) * BOX, (u.y / 100) * BOX),
    };
  }, [M, corners]);
}

/** Inside the picture (moves and zooms with it): the plan itself and the free units. */
export function SitePlanLayer({ T, scale, state, onPick }: { T: TourConfig; scale: number; state: SitePlanState; onPick: (u: SiteUnit) => void }) {
  const geo = usePlanGeometry(T);
  const plan = T.sitePlan;
  if (!geo || !plan) return null;
  const opacity = Math.min(1, Math.max(0.2, plan.overlay?.opacity ?? 0.55));
  return (
    <>
      <div className="pk-plan" aria-hidden style={{ width: BOX, height: BOX, transform: geo.matrix, opacity: state.on ? opacity : 0, visibility: state.on ? "visible" : "hidden" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={plan.image} alt="" draggable={false} />
      </div>
      {shownUnits(T, state).map(({ u, color }) => {
            const p = geo.at(u);
            return (
              <button
                key={u.id}
                type="button"
                className={`pk-unit ${state.picked?.id === u.id ? "valgt" : ""}`}
                style={{ left: p.x, top: p.y, transform: `translate(-50%, -50%) scale(${1 / scale})`, background: color }}
                aria-label={u.name}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onPick(u);
                }}
              >
                {state.picked?.id === u.id && <span>{u.name}</span>}
              </button>
            );
          })}
    </>
  );
}

const shortDay = (d: string, lang: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(lang === "da" ? "da-DK" : lang, { day: "numeric", month: "short" });

/** Over the picture: the switch, the dates and the picked unit's card. */
export function SitePlanControls({
  T,
  state,
  setState,
  lang = "da",
  onBook,
  onWalk,
}: {
  T: TourConfig;
  state: SitePlanState;
  setState: (fn: (s: SitePlanState) => SitePlanState) => void;
  lang?: string;
  onBook?: (label: string, href: string) => void;
  /** "Gå rundt": into the tour, at the place inside the picked cabin or room. */
  onWalk?: (href: string, label: string) => void;
}) {
  const tr = useT();
  const plan = T.sitePlan!;
  const live = Boolean(plan.nextStay && plan.units?.length);
  const [from, setFrom] = useState(state.stay?.from ?? "");
  const [to, setTo] = useState(state.stay?.to ?? "");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  /** The dates' box folded away (×) - a small button brings it back; what's shown stays. */
  const [folded, setFolded] = useState(false);
  const book = safeHref(plan.nextStay?.book) ?? (plan.nextStay ? `https://online.next-stay-booking.dk/search/${plan.nextStay.tenantId}` : null);

  async function look() {
    if (!from || !to) return setNote(tr("Vælg ankomst og afrejse."));
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch(apiUrl(`/api/tour-sites/${encodeURIComponent(T.slug)}?${new URLSearchParams({ fra: from, til: to })}`));
      const data = (await res.json().catch(() => ({}))) as { free?: string[]; error?: string };
      if (!res.ok || !data.free) throw new Error(data.error ?? tr("Bookingen svarer ikke lige nu - prøv igen om lidt."));
      setState((s) => ({ ...s, free: new Set(data.free), picked: null, stay: { from, to } }));
      setNote(data.free.length ? tr("{n} ledige").replace("{n}", String(data.free.length)) : tr("Ingen ledige i perioden."));
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    }
    setBusy(false);
  }

  return (
    <>
      {/* The switch stays where it is, on or off - the dates' box stands above it, never on it. */}
      <button
        type="button"
        className={`pk-skift ${state.on ? "til" : ""}`}
        aria-pressed={state.on}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => setState((s) => ({ ...s, on: !s.on, picked: null }))}
      >
        <i aria-hidden />
        {tr("Pladskort")}
      </button>
      {/* The picked place's card, then the dates' box (or its button): one stack at the bottom - the card always just above the box, never on it. */}
      {state.on && (state.picked || live) && (
        <div className="pk-bund">
          {state.on && state.picked && state.stay && (
            <div className="pk-kort" onPointerDown={(e) => e.stopPropagation()}>
              <span>
                <b>{tr("Ledig")}</b> · {state.picked.name} · {shortDay(state.stay.from, lang)}–{shortDay(state.stay.to, lang)}
              </span>
              {(() => {
                const walk = unitTour(plan, state.picked!);
                return walk && onWalk ? (
                  <a
                    href={walk}
                    className="pk-gaa"
                    onClick={(e) => {
                      e.preventDefault();
                      onWalk(walk, state.picked!.name);
                    }}
                  >
                    {tr("Gå rundt")}
                  </a>
                ) : null;
              })()}
              {book && (
                <a
                  href={book}
                  target="_blank"
                  rel="noopener"
                  onClick={(e) => {
                    // The tour opens the booking itself (inside the tour); without it, a new tab.
                    if (onBook) {
                      e.preventDefault();
                      onBook(`${tr("Book")} ${state.picked!.name}`, book);
                    }
                  }}
                >
                  {tr("Book")}
                </a>
              )}
              <button type="button" aria-label={tr("Luk")} onClick={() => setState((s) => ({ ...s, picked: null }))}>
                ×
              </button>
            </div>
          )}
          {state.on && live && folded && (
            <button type="button" className="pk-datoer-aaben" onPointerDown={(e) => e.stopPropagation()} onClick={() => setFolded(false)}>
              📅 {state.stay ? `${shortDay(state.stay.from, lang)}–${shortDay(state.stay.to, lang)}` : tr("Vælg datoer")}
            </button>
          )}
          {state.on && live && !folded && (
            <div className="pk-datoer" onPointerDown={(e) => e.stopPropagation()}>
              <button type="button" className="pk-fold" aria-label={tr("Skjul")} onClick={() => setFolded(true)}>
                ×
              </button>
              <label>
                <span>{tr("Ankomst")}</span>
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </label>
              <label>
                <span>{tr("Afrejse")}</span>
                <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
              </label>
              <button type="button" onClick={look} disabled={busy}>
                {busy ? tr("Henter …") : tr("Vis ledige")}
              </button>
              {(busy || note || state.free) && (
                <p aria-live="polite">
                  <span>{busy ? tr("Henter ledige pladser …") : note}</span>
                  {state.free && !busy && (
                    <button
                      type="button"
                      className="pk-ryd"
                      onClick={() => {
                        setNote(null);
                        setState((s) => ({ ...s, free: null, picked: null, stay: null, off: [] }));
                      }}
                    >
                      {tr("Fjern ledige")} ×
                    </button>
                  )}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}

export const SITE_PLAN_CSS = `
.pk-plan{position:absolute;left:0;top:0;transform-origin:0 0;pointer-events:none;transition:opacity .35s ease}
.pk-plan img{display:block;width:100%;height:100%}
.pk-unit{position:absolute;width:16px;height:16px;padding:0;border-radius:50%;border:2px solid #fff;background:#34c759;box-shadow:0 1px 6px rgba(0,0,0,.35);cursor:pointer;animation:pkPop .35s cubic-bezier(.3,1.6,.5,1) both}
.pk-unit::after{content:"";position:absolute;inset:-12px}
.pk-unit.valgt{width:22px;height:22px;background:#248a3d}
.pk-unit span{position:absolute;left:50%;bottom:calc(100% + 6px);translate:-50% 0;white-space:nowrap;padding:3px 8px;border-radius:999px;background:#fff;color:#1d2a30;font-size:12px;font-weight:800;box-shadow:0 3px 10px rgba(0,0,0,.25)}
@keyframes pkPop{from{opacity:0;scale:.4}to{opacity:1;scale:1}}
.pk-skift{position:absolute;right:16px;top:calc(68px + env(safe-area-inset-top,0px));z-index:6;display:flex;align-items:center;gap:8px;height:38px;padding:0 14px 0 8px;border:0;border-radius:999px;background:rgba(255,255,255,.95);color:#1d2a30;font:inherit;font-size:14px;font-weight:700;box-shadow:0 6px 18px rgba(0,0,0,.2);cursor:pointer}
.pk-skift i{position:relative;width:30px;height:18px;border-radius:999px;background:#c7c7cc;transition:background .2s}
.pk-skift i::after{content:"";position:absolute;left:2px;top:2px;width:14px;height:14px;border-radius:50%;background:#fff;transition:transform .2s}
.pk-skift.til i{background:#34c759}
.pk-skift.til i::after{transform:translateX(12px)}
.pk-bund{position:absolute;left:50%;bottom:calc(20px + env(safe-area-inset-bottom,0px));translate:-50% 0;z-index:7;display:flex;flex-direction:column;align-items:center;gap:8px;max-width:calc(100% - 24px);pointer-events:none}
.pk-bund>*{pointer-events:auto}
.hv:has(.hv-filtre) .pk-bund{bottom:calc(var(--filtre-h,56px) + 26px + env(safe-area-inset-bottom,0px))}
.pk-datoer{position:relative;display:flex;flex-wrap:wrap;align-items:flex-end;gap:8px;padding:10px 12px;border-radius:16px;background:rgba(255,255,255,.96);box-shadow:0 8px 26px rgba(0,0,0,.22);max-width:100%}
.pk-datoer label{display:flex;flex-direction:column;gap:2px;font-size:11px;font-weight:700;color:#6e6e73;text-transform:uppercase;letter-spacing:.04em}
.pk-datoer input{height:34px;border:1px solid #e5e5ea;border-radius:9px;padding:0 8px;font:inherit;font-size:14px;color:#1d2a30;background:#fff}
.pk-datoer button{height:34px;padding:0 14px;border:0;border-radius:9px;background:var(--c-accent);color:var(--c-on-accent,#fff);font:inherit;font-size:14px;font-weight:700;cursor:pointer}
.pk-datoer button:disabled{opacity:.6}
.pk-datoer p{flex-basis:100%;margin:0;display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px;color:#3a3a3c}

.pk-datoer .pk-fold{position:absolute;top:6px;right:6px;width:26px;height:26px;padding:0;border-radius:50%;background:#f2f2f7;color:#6e6e73;font-size:17px;line-height:26px}
.pk-datoer{padding-right:40px}
.pk-datoer-aaben{height:36px;padding:0 14px;border:0;border-radius:999px;background:rgba(255,255,255,.96);color:#1d2a30;font:inherit;font-size:14px;font-weight:700;box-shadow:0 6px 18px rgba(0,0,0,.22);cursor:pointer}
.pk-datoer .pk-ryd{flex:none;height:28px;padding:0 12px;background:#f2f2f7;color:#1d2a30;font-size:12.5px}
.pk-kort .pk-gaa{background:#1d2a30}
.pk-legend b{font-weight:900;margin-left:2px}
.pk-kort{display:flex;align-items:center;gap:10px;padding:8px 8px 8px 14px;border-radius:999px;background:#fff;color:#1d2a30;font-size:14px;box-shadow:0 8px 26px rgba(0,0,0,.25);white-space:nowrap;max-width:100%}
.pk-kort b{color:#248a3d}
.pk-kort span{overflow:hidden;text-overflow:ellipsis}
.pk-kort a{padding:7px 14px;border-radius:999px;background:var(--c-accent);color:var(--c-on-accent,#fff);font-weight:700;text-decoration:none}
.pk-kort button{width:28px;height:28px;border:0;border-radius:50%;background:#f2f2f7;color:#6e6e73;font-size:18px;line-height:1;cursor:pointer}
.hv-punkt .pk-skift,.hv-punkt .pk-bund,.hv-welcome .pk-skift,.hv-welcome .pk-bund{opacity:0;pointer-events:none}
.hv-punkt .pk-bund>*,.hv-welcome .pk-bund>*{pointer-events:none}
@media (max-width:760px){
  .pk-til .km-soeg{display:none}
  /* The switch in one place on a phone - just above the filter - and the dates' box above the switch. */
  .pk-skift,.pk-til .pk-skift{top:auto;right:auto;bottom:calc(var(--filtre-h,56px) + 20px + env(safe-area-inset-bottom,0px));left:10px;height:34px;font-size:13px}
  /* The stack: the dates' box over the switch; folded, its button beside the switch (right) - the card above either. */
  .pk-bund,.hv:has(.hv-filtre) .pk-bund{left:10px;right:10px;translate:none;max-width:none;align-items:stretch;bottom:calc(var(--filtre-h,56px) + 62px + env(safe-area-inset-bottom,0px))}
  .pk-bund:has(.pk-datoer-aaben),.hv:has(.hv-filtre) .pk-bund:has(.pk-datoer-aaben),.pk-bund:not(:has(.pk-datoer,.pk-datoer-aaben)){bottom:calc(var(--filtre-h,56px) + 20px + env(safe-area-inset-bottom,0px))}
  .pk-datoer-aaben{align-self:flex-end;height:34px;font-size:13px}
  .pk-kort{align-self:center}
  .pk-datoer{padding:8px 40px 8px 8px;gap:6px}
  .pk-datoer label{flex:1 1 0;min-width:0}
  .pk-datoer input{width:100%;min-width:0;padding:0 4px;font-size:13px}
  .pk-kort{font-size:13px}
}
`;
