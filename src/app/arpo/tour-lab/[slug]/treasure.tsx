"use client";

import { textOn } from "../tours/contrast";
import { useState } from "react";
import { createPortal } from "react-dom";
import type { StagingItem, TourConfig } from "../tours/types";
import { useT } from "../tours/i18n-react";
import { apiUrl } from "../tours/api";

/*
 * "Skattejagt": a treasure chest put on a surface in the tour (Virtual
 * staging, kind "treasure"). Found and tapped, it opens a box where the
 * visitor enters the draw (name, e-mail, phone, class - and the yes to the
 * school keeping it for the draw). Sent to /api/tour-contest; the school sees
 * the entries on its customer page. The chest is drawn here (no file to
 * fetch - it works on every copy of the tour).
 */

export const CHEST_IMAGE = "data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22512%22 height=%22420%22 viewBox=%220 0 512 420%22%3E%3Cdefs%3E%3ClinearGradient id=%22w%22 x1=%220%22 y1=%220%22 x2=%220%22 y2=%221%22%3E%3Cstop offset=%220%22 stop-color=%22%23a5622b%22/%3E%3Cstop offset=%221%22 stop-color=%22%236b3a16%22/%3E%3C/linearGradient%3E%3ClinearGradient id=%22l%22 x1=%220%22 y1=%220%22 x2=%220%22 y2=%221%22%3E%3Cstop offset=%220%22 stop-color=%22%23c07a3a%22/%3E%3Cstop offset=%221%22 stop-color=%22%238a4c1e%22/%3E%3C/linearGradient%3E%3ClinearGradient id=%22g%22 x1=%220%22 y1=%220%22 x2=%220%22 y2=%221%22%3E%3Cstop offset=%220%22 stop-color=%22%23ffe27a%22/%3E%3Cstop offset=%22.5%22 stop-color=%22%23f2b631%22/%3E%3Cstop offset=%221%22 stop-color=%22%23b9780f%22/%3E%3C/linearGradient%3E%3CradialGradient id=%22glow%22 cx=%22.5%22 cy=%22.55%22 r=%22.5%22%3E%3Cstop offset=%220%22 stop-color=%22%23fff3a6%22 stop-opacity=%22.75%22/%3E%3Cstop offset=%221%22 stop-color=%22%23fff3a6%22 stop-opacity=%220%22/%3E%3C/radialGradient%3E%3CclipPath id=%22c%22%3E%3Cpath d=%22M86 200 Q256 70 426 200 L426 384 L86 384 Z%22/%3E%3C/clipPath%3E%3C/defs%3E%3Cellipse cx=%22256%22 cy=%22232%22 rx=%22250%22 ry=%22190%22 fill=%22url(%23glow)%22/%3E%3Cellipse cx=%22256%22 cy=%22392%22 rx=%22190%22 ry=%2218%22 fill=%22%23000%22 opacity=%22.28%22/%3E%3Cpath d=%22M86 200 Q256 70 426 200 L426 222 L86 222 Z%22 fill=%22url(%23l)%22 stroke=%22%234a2509%22 stroke-width=%226%22 stroke-linejoin=%22round%22/%3E%3Cpath d=%22M120 178 Q256 92 392 178%22 fill=%22none%22 stroke=%22%234a2509%22 stroke-width=%224%22 opacity=%22.45%22/%3E%3Crect x=%2276%22 y=%22214%22 width=%22360%22 height=%22170%22 rx=%2214%22 fill=%22url(%23w)%22 stroke=%22%234a2509%22 stroke-width=%226%22/%3E%3Cpath d=%22M90 262 H422 M90 314 H422%22 stroke=%22%234a2509%22 stroke-width=%224%22 opacity=%22.35%22/%3E%3Cg clip-path=%22url(%23c)%22%3E%3Crect x=%22104%22 y=%22100%22 width=%2234%22 height=%22284%22 fill=%22url(%23g)%22 stroke=%22%237a4a07%22 stroke-width=%224%22/%3E%3Crect x=%22374%22 y=%22100%22 width=%2234%22 height=%22284%22 fill=%22url(%23g)%22 stroke=%22%237a4a07%22 stroke-width=%224%22/%3E%3C/g%3E%3Cpath d=%22M86 200 Q256 70 426 200%22 fill=%22none%22 stroke=%22%234a2509%22 stroke-width=%226%22 stroke-linejoin=%22round%22/%3E%3Crect x=%2276%22 y=%22206%22 width=%22360%22 height=%2224%22 rx=%226%22 fill=%22url(%23g)%22 stroke=%22%237a4a07%22 stroke-width=%224%22/%3E%3Crect x=%22222%22 y=%22196%22 width=%2268%22 height=%2284%22 rx=%2212%22 fill=%22url(%23g)%22 stroke=%22%237a4a07%22 stroke-width=%225%22/%3E%3Ccircle cx=%22256%22 cy=%22232%22 r=%2211%22 fill=%22%235a3205%22/%3E%3Cpath d=%22M251 238 L247 262 H265 L261 238 Z%22 fill=%22%235a3205%22/%3E%3Cpath d=%22M150 70 l8 18 l18 8 l-18 8 l-8 18 l-8 -18 l-18 -8 l18 -8 Z%22 fill=%22%23fff6c2%22/%3E%3Cpath d=%22M372 46 l6 13 l13 6 l-13 6 l-6 13 l-6 -13 l-13 -6 l13 -6 Z%22 fill=%22%23fff6c2%22/%3E%3Cpath d=%22M424 118 l5 10 l10 5 l-10 5 l-5 10 l-5 -10 l-10 -5 l10 -5 Z%22 fill=%22%23fff6c2%22/%3E%3C/svg%3E";

const SEEN = "tour-skat-med";
const entered = (id: string) => {
  try {
    return (JSON.parse(localStorage.getItem(SEEN) ?? "[]") as string[]).includes(id);
  } catch {
    return false;
  }
};
const remember = (id: string) => {
  try {
    const list = JSON.parse(localStorage.getItem(SEEN) ?? "[]") as string[];
    localStorage.setItem(SEEN, JSON.stringify([...new Set([...list, id])].slice(-50)));
  } catch {}
};

/** "1. december" (the draw's day, as people say it). */
const dayName = (ymd: string, lang: string) => {
  const d = new Date(`${ymd}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? ymd : d.toLocaleDateString(lang === "da" ? "da-DK" : lang, { day: "numeric", month: "long" });
};

export function ContestBox({ T, slug, item, lang, onClose, onEvent }: { T: TourConfig; slug: string; item: StagingItem; lang: string; onClose: () => void; onEvent: (name: string, params?: Record<string, string>) => void }) {
  const tr = useT();
  const c = item.contest!;
  const school = T.brand || T.title;
  const day = dayName(c.ends, lang);
  const fill = (s: string) => s.replace("{præmie}", c.prize || tr("en startpakke")).replace(/\{skole\}/g, school).replace("{dato}", day);
  const [state, setState] = useState<"form" | "sending" | "done" | "already">(() => (entered(item.id) ? "already" : "form"));
  const [error, setError] = useState<string | null>(null);
  const [opened] = useState(() => Date.now());
  const [f, setF] = useState({ name: "", email: "", phone: "", grade: "", consent: false, infoOk: false, website: "" });

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!f.consent) return setError(tr("Sæt flueben ved, at oplysningerne må gemmes til lodtrækningen."));
    setState("sending");
    setError(null);
    try {
      const r = await fetch(apiUrl(`/api/tour-contest/${encodeURIComponent(slug)}`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId: item.id, name: f.name, email: f.email, phone: f.phone, grade: f.grade || null, consent: f.consent, infoOk: f.infoOk, website: f.website, ms: Date.now() - opened }),
      });
      const d = (await r.json().catch(() => ({}))) as { ok?: boolean; already?: boolean; error?: string };
      if (!r.ok || !d.ok) {
        setState("form");
        return setError(d.error ?? tr("Det kunne ikke sendes lige nu - prøv igen om lidt."));
      }
      remember(item.id);
      setState(d.already ? "already" : "done");
      onEvent("contest_entry", { item: item.title ?? item.id });
    } catch {
      setState("form");
      setError(tr("Det kunne ikke sendes lige nu - prøv igen om lidt."));
    }
  }

  return createPortal(
    // Laid over the whole page (outside the tour's own element): the tour's colours given along.
    <div
      className="sk"
      role="dialog"
      aria-modal="true"
      aria-label={tr("Du fandt skatten! 🎉")}
      onClick={onClose}
      style={{ "--c-main": T.colors.main, "--c-accent": T.colors.accent, "--c-on-accent": textOn(T.colors.accent, T.colors.main), "--font-heading": `'${T.fontHeading ?? T.font}', '${T.font}', sans-serif`, fontFamily: `'${T.font}', sans-serif` } as React.CSSProperties}
    >
      <div className="sk-box" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="sk-luk" aria-label={tr("Luk")} onClick={onClose}>
          ×
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="sk-kiste" src={item.src || CHEST_IMAGE} alt="" />
        {state === "done" ? (
          <>
            <h2>{tr("Du er med!")}</h2>
            <p>{fill(tr("Vi trækker en vinder {dato} og kontakter vedkommende direkte."))}</p>
            <button type="button" className="sk-knap" onClick={onClose}>
              {tr("Gå videre i touren")}
            </button>
          </>
        ) : state === "already" ? (
          <>
            <h2>{tr("Du er allerede med i lodtrækningen 👍")}</h2>
            <p>{fill(tr("Vi trækker en vinder {dato} og kontakter vedkommende direkte."))}</p>
            <button type="button" className="sk-knap" onClick={onClose}>
              {tr("Gå videre i touren")}
            </button>
          </>
        ) : (
          <form onSubmit={send}>
            <h2>{tr("Du fandt skatten! 🎉")}</h2>
            <p>{fill(tr("Skriv dig op og vær med i lodtrækningen om {præmie} til {skole}. Vinderen trækkes {dato}."))}</p>
            <label>
              <span>{tr("Navn")}</span>
              <input required autoComplete="name" maxLength={100} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            </label>
            <label>
              <span>{tr("E-mail")}</span>
              <input required type="email" autoComplete="email" maxLength={200} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
            </label>
            <label>
              <span>{tr("Telefon")}</span>
              <input required type="tel" inputMode="tel" autoComplete="tel" maxLength={30} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
            </label>
            <label>
              <span>{tr("Klassetrin (valgfrit)")}</span>
              <select value={f.grade} onChange={(e) => setF({ ...f, grade: e.target.value })}>
                <option value="">-</option>
                <option value="9">{tr("9. klasse")}</option>
                <option value="10">{tr("10. klasse")}</option>
              </select>
            </label>
            {/* Only robots fill this in. */}
            <input className="sk-skjult" tabIndex={-1} autoComplete="off" aria-hidden value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} />
            <label className="sk-flueben">
              <input type="checkbox" checked={f.consent} onChange={(e) => setF({ ...f, consent: e.target.checked })} />
              <span>{fill(tr("Jeg er indforstået med, at {skole} gemmer mine oplysninger til lodtrækningen og kontakter vinderen. Oplysningerne slettes, når vinderen er fundet."))}</span>
            </label>
            <label className="sk-flueben">
              <input type="checkbox" checked={f.infoOk} onChange={(e) => setF({ ...f, infoOk: e.target.checked })} />
              <span>{fill(tr("Skolen må gerne sende mig information om at gå på {skole}."))}</span>
            </label>
            {error && <p className="sk-fejl">{error}</p>}
            <button type="submit" className="sk-knap" disabled={state === "sending"}>
              {state === "sending" ? tr("Sender …") : tr("Vær med i lodtrækningen")}
            </button>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
}

export const CONTEST_CSS = `
.sk{position:fixed;inset:0;z-index:2147482000;display:grid;place-items:center;padding:16px;background:rgba(10,14,18,.55);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);animation:hvFade .25s ease;font-family:var(--font-body, inherit)}
.sk-box{position:relative;width:min(420px,100%);max-height:calc(100dvh - 32px);overflow-y:auto;overscroll-behavior:contain;padding:22px 22px 20px;border-radius:22px;background:#fff;color:#1d2a30;box-shadow:0 24px 70px rgba(0,0,0,.45);animation:skPop .5s cubic-bezier(.2,1.3,.4,1) both;text-align:center}
@keyframes skPop{from{transform:scale(.8) translateY(20px);opacity:0}to{transform:none;opacity:1}}
.sk-kiste{display:block;width:120px;height:auto;margin:-6px auto 4px;animation:skHop 1.2s ease .2s both}
@keyframes skHop{0%{transform:scale(.6) rotate(-8deg)}40%{transform:scale(1.12) rotate(4deg)}70%{transform:scale(.97)}100%{transform:none}}
.sk-box h2{margin:2px 0 6px;font-family:var(--font-heading);font-size:22px;line-height:1.2;color:var(--c-main)}
.sk-box p{margin:0 0 14px;font-size:14.5px;line-height:1.45;color:#3d4a50}
.sk-box form{text-align:left}
.sk-box form h2,.sk-box form>p{text-align:center}
.sk-box label{display:block;margin-bottom:9px}
.sk-box label>span{display:block;margin:0 0 3px 2px;font-size:12.5px;font-weight:700;color:#56636a}
.sk-box input:not([type=checkbox]),.sk-box select{width:100%;box-sizing:border-box;padding:11px 12px;border:1.5px solid #dfe5e7;border-radius:12px;background:#f7f9f9;font:inherit;font-size:16px;color:#1d2a30;outline:none}
.sk-box input:focus,.sk-box select:focus{border-color:var(--c-accent);background:#fff}
.sk-box .sk-flueben{display:flex;gap:9px;align-items:flex-start;margin:10px 0}
.sk-box .sk-flueben input{flex:none;width:20px;height:20px;margin:1px 0 0;accent-color:var(--c-accent)}
.sk-box .sk-flueben span{margin:0;font-size:12.5px;font-weight:500;line-height:1.4;color:#3d4a50}
.sk-skjult{position:absolute!important;left:-9999px!important;width:1px!important;height:1px!important;opacity:0}
.sk-fejl{color:#c4314b!important;font-weight:600}
.sk-knap{display:block;width:100%;margin-top:6px;padding:13px 16px;border:0;border-radius:999px;background:var(--c-accent);color:var(--c-on-accent,#fff);font:inherit;font-weight:800;font-size:15px;cursor:pointer}
.sk-knap:disabled{opacity:.6}
.sk-luk{position:absolute;top:10px;right:10px;width:32px;height:32px;border:0;border-radius:50%;background:#f1f4f4;color:#1d2a30;font-size:20px;line-height:1;cursor:pointer}
`;
