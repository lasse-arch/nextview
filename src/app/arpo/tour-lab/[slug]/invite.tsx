"use client";

import { useEffect, useState } from "react";
import { useT } from "../tours/i18n-react";
import type { TourConfig } from "../tours/types";

/*
 * "Invitation til rundvisning" (TourConfig.invite): when the tour starts
 * straight in (no welcome), a small card asks "Skal jeg vise dig rundt?" -
 * with the face of someone from the place (a person from Personer), how long
 * the guided tour is, "Vis mig rundt" and "Jeg kigger selv rundt". It comes a
 * moment after the tour is there, once a visit, and goes by itself the moment
 * the visitor starts on their own (a tap or drag in the 3D view).
 */

const seenKey = (slug: string) => `hv-invite:${slug}`;

export function InviteCard({
  T,
  stops,
  seconds,
  onStart,
  onSkip,
  everyTime = false,
}: {
  T: TourConfig;
  /** Shown every time (the editor's preview) - not only once a visit. */
  everyTime?: boolean;
  /** How many stops the guided tour has, and seconds per stop - for "10 steder · ca. 2 min". */
  stops: number;
  seconds: number;
  onStart: () => void;
  /** Gone without starting: "skip" (the button) or "self" (they started looking around). */
  onSkip: (how: "skip" | "self") => void;
}) {
  const tr = useT();
  const inv = T.invite!;
  const [show, setShow] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    // Once a visit - not again after a reload.
    try {
      if (!everyTime && sessionStorage.getItem(seenKey(T.slug))) return;
    } catch {}
    const t = window.setTimeout(() => {
      setShow(true);
      try {
        sessionStorage.setItem(seenKey(T.slug), "1");
      } catch {}
    }, Math.max(0, (inv.delaySeconds ?? 1.5) * 1000));
    return () => window.clearTimeout(t);
  }, [T.slug, inv.delaySeconds, everyTime]);

  useEffect(() => {
    if (!show || gone) return;
    // A tap or drag in the 3D view moves the focus into Matterport's frame: they're looking around on their own.
    const blurred = () =>
      window.setTimeout(() => {
        if (document.activeElement?.tagName === "IFRAME" && document.hasFocus()) {
          setGone(true);
          onSkip("self");
        }
      }, 0);
    window.addEventListener("blur", blurred);
    return () => window.removeEventListener("blur", blurred);
  }, [show, gone, onSkip]);

  if (!show || gone) return null;
  const person = inv.person ? T.team?.people.find((p) => p.id === inv.person && p.image) : undefined;
  const min = Math.max(1, Math.ceil((stops * seconds) / 60));
  const title = inv.title ? tr(inv.title) : tr("Skal jeg vise dig rundt?");
  return (
    <section className="iv-kort" aria-label={title}>
      <div className="iv-top">
        {person && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="iv-foto" src={person.image} alt="" />
        )}
        <div className="iv-hvem">
          {person && <span className="iv-navn">{[person.name, person.role].filter(Boolean).join(" · ")}</span>}
          <b>{title}</b>
        </div>
        <button
          type="button"
          className="iv-x"
          aria-label={tr("Luk")}
          onClick={() => {
            setGone(true);
            onSkip("skip");
          }}
        >
          ×
        </button>
      </div>
      {inv.text && <p className="iv-tekst">{tr(inv.text)}</p>}
      <div className="iv-knapper">
        <button
          type="button"
          className="iv-start"
          onClick={() => {
            setGone(true);
            onStart();
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M7 4v16l13-8z" />
          </svg>
          {inv.button ? tr(inv.button) : tr("Vis mig rundt")}
        </button>
        <span className="iv-tid">{tr("{n} steder · ca. {min} min", { n: String(stops), min: String(min) })}</span>
      </div>
      <button
        type="button"
        className="iv-selv"
        onClick={() => {
          setGone(true);
          onSkip("skip");
        }}
      >
        {inv.skip ? tr(inv.skip) : tr("Jeg kigger selv rundt")}
      </button>
    </section>
  );
}

export const INVITE_CSS = `
.iv-kort{position:absolute;left:24px;bottom:24px;z-index:12;width:min(380px,calc(100% - 48px));box-sizing:border-box;padding:18px 18px 14px;border-radius:22px;background:#fff;color:#1d2a30;box-shadow:0 18px 48px rgba(0,0,0,.32);display:flex;flex-direction:column;gap:12px;animation:hvUp .45s cubic-bezier(.2,.7,.2,1) both}
.iv-top{display:flex;align-items:center;gap:12px}
.iv-foto{flex:none;width:56px;height:56px;border-radius:50%;object-fit:cover;object-position:50% 20%;box-shadow:0 0 0 3px #fff,0 0 0 5px var(--c-accent)}
.iv-hvem{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.iv-navn{font-size:11.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#5d7177}
.iv-hvem b{font-size:19px;line-height:1.2;color:var(--c-main);font-family:var(--font-heading,inherit)}
.iv-x{align-self:flex-start;flex:none;width:30px;height:30px;margin:-6px -6px 0 0;border:0;border-radius:50%;background:rgba(0,0,0,.06);color:#1d2a30;font-size:18px;line-height:1;cursor:pointer}
.iv-tekst{margin:0;font-size:14px;line-height:1.5;color:#3a4d52}
.iv-knapper{display:flex;align-items:center;flex-wrap:wrap;gap:10px}
.iv-start{display:inline-flex;align-items:center;gap:8px;border:0;border-radius:999px;padding:12px 20px;background:var(--c-accent);color:var(--c-on-accent,#fff);font:inherit;font-weight:800;font-size:15px;cursor:pointer;box-shadow:0 6px 16px color-mix(in srgb,var(--c-accent) 40%,transparent)}
.iv-start svg{width:13px;height:13px;fill:currentColor}
.iv-tid{font-size:12.5px;color:#5d7177}
.iv-selv{align-self:flex-start;border:0;background:none;padding:2px 0;font:inherit;font-size:13.5px;font-weight:700;color:var(--c-main);text-decoration:underline;text-underline-offset:3px;cursor:pointer}
/* Above the stories when they sit at the bottom. */
.hv-st-on-d .iv-kort{bottom:calc(var(--st-h,148px) + 12px)}
@media (max-width:760px){
  .hv-menu-aaben .iv-kort{opacity:0;pointer-events:none}
  .iv-kort{left:12px;right:12px;bottom:calc(14px + env(safe-area-inset-bottom,0px));width:auto}
  .iv-start{flex:1;justify-content:center;padding:14px 18px}
  .iv-tid{display:none}
  .iv-selv{align-self:center}
  .iv-kort,.hv-st-on-d .iv-kort{bottom:calc(14px + env(safe-area-inset-bottom,0px))}
  .hv-st-on-m .iv-kort{bottom:calc(var(--st-h,150px) + 10px)}
}
`;
