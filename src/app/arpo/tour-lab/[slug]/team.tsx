"use client";

import type { CardPerson, TeamPerson, TourConfig } from "../tours/types";
import { useT } from "../tours/i18n-react";

/*
 * "Mød os" (TourConfig.team): the people behind the place, in the tour. A
 * list (photo, name, role) and each one's profile - a big photo, a few words,
 * their own quote, "Spørg Per, når …" and "Se hvor du møder Per", which takes
 * the tour to where they're found. Opened by "#mod" / "#mod:<id>" (menu,
 * tiles, buttons) and by a tap on the same person on a place card.
 */

/** The team member a place card's person is (same name, or same photo) - their profile can open from the card. */
export function teamIdOf(T: TourConfig, p: CardPerson): string | null {
  const people = T.team?.people ?? [];
  const name = p.name?.trim().toLowerCase();
  return people.find((x) => (name && x.name.trim().toLowerCase() === name) || x.image === p.image)?.id ?? null;
}

export function TeamSheet({
  T,
  open,
  setOpen,
  onGo,
}: {
  T: TourConfig;
  /** "" = everyone, else one person's id. */
  open: string;
  setOpen: (v: string | null) => void;
  /** "Se hvor du møder …": the tour goes to that place. */
  onGo: (href: string, label: string) => void;
}) {
  const tr = useT();
  const people = (T.team?.people ?? []).filter((p) => p.image && p.name);
  const person = open ? people.find((p) => p.id === open) : people.length === 1 ? people[0] : undefined;
  const title = T.team?.title || tr("Mød os");
  if (!people.length) return null;
  return (
    <div className="tm-bg" onClick={() => setOpen(null)}>
      <div className={`tm-ark ${person ? "tm-profil" : ""}`} role="dialog" aria-modal="true" aria-label={person ? person.name : title} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="tm-x" aria-label={tr("Luk")} onClick={() => setOpen(null)}>
          ×
        </button>
        {person ? <Profile p={person} back={people.length > 1 ? () => setOpen("") : undefined} onGo={onGo} /> : (
          <>
            <h2 className="tm-titel">{title}</h2>
            <div className="tm-liste">
              {people.map((p) => (
                <button key={p.id} type="button" onClick={() => setOpen(p.id)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.image} alt="" loading="lazy" />
                  <b>{p.name}</b>
                  {p.role && <span>{p.role}</span>}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Profile({ p, back, onGo }: { p: TeamPerson; back?: () => void; onGo: (href: string, label: string) => void }) {
  const tr = useT();
  const first = p.name.split(/\s+/)[0];
  return (
    <div className="tm-p">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="tm-foto" src={p.image} alt={p.name} />
      <div className="tm-tekst">
        {back && (
          <button type="button" className="tm-tilbage" onClick={back}>
            ← {tr("Alle")}
          </button>
        )}
        <h2>{p.name}</h2>
        {p.role && <div className="tm-rolle">{p.role}</div>}
        {(p.bio ?? "")
          .split(/\n\s*\n/)
          .map((t) => t.trim())
          .filter(Boolean)
          .map((t, i) => (
            <p key={i}>{t}</p>
          ))}
        {p.quote && (
          <blockquote>
            {p.quote}
            <cite>{p.name}</cite>
          </blockquote>
        )}
        {p.ask && (
          <div className="tm-spoerg">
            <b>{tr("Spørg {navn}", { navn: first })}</b> {p.ask}
          </div>
        )}
        {p.href && (
          <button type="button" className="tm-knap" onClick={() => onGo(p.href!, p.name)}>
            {tr("Se hvor du møder {navn}", { navn: first })}
          </button>
        )}
      </div>
    </div>
  );
}

export const TEAM_CSS = `
.tm-bg{position:absolute;inset:0;z-index:40;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.4);animation:hvFade .25s ease}
.tm-ark{position:relative;width:min(560px,calc(100% - 32px));max-height:calc(100% - 48px);overflow-y:auto;box-sizing:border-box;padding:24px;border-radius:24px;background:#fff;color:#1d2a30;box-shadow:0 20px 60px rgba(0,0,0,.35);animation:hvUp .35s cubic-bezier(.2,.7,.2,1) both}
.tm-ark.tm-profil{width:min(860px,calc(100% - 32px));padding:0;overflow:hidden auto}
.tm-x{position:absolute;top:12px;right:12px;z-index:2;width:34px;height:34px;border:0;border-radius:50%;background:rgba(0,0,0,.55);color:#fff;font-size:20px;line-height:1;cursor:pointer}
.tm-titel{margin:0 44px 16px 0;font-size:24px;font-weight:900;color:var(--c-main);font-family:var(--font-heading,inherit)}
.tm-liste{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px}
.tm-liste button{display:flex;flex-direction:column;align-items:center;gap:6px;border:0;border-radius:18px;padding:16px 10px;background:var(--c-soft,#f4f4f2);font:inherit;color:inherit;cursor:pointer;text-align:center}
.tm-liste button:hover{background:color-mix(in srgb,var(--c-accent) 12%,#fff)}
.tm-liste img{width:84px;height:84px;border-radius:50%;object-fit:cover;object-position:50% 25%;box-shadow:0 0 0 3px #fff,0 0 0 5px color-mix(in srgb,var(--c-accent) 55%,transparent)}
.tm-liste b{font-size:15px;color:var(--c-main)}
.tm-liste span{font-size:12.5px;color:#5d7177}
.tm-p{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr)}
.tm-foto{display:block;width:100%;height:100%;min-height:420px;max-height:640px;object-fit:cover;object-position:50% 20%}
.tm-tekst{padding:28px 30px 30px;display:flex;flex-direction:column;gap:10px;font-size:15px;line-height:1.55}
.tm-tekst h2{margin:0;font-size:30px;line-height:1.1;font-weight:800;color:var(--c-main);font-family:var(--font-heading,inherit)}
.tm-rolle{margin-top:-4px;font-size:12.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--c-accent)}
.tm-tekst p{margin:0;color:#33474d}
.tm-tekst blockquote{margin:6px 0;padding:4px 0 4px 16px;border-left:3px solid var(--c-accent);font-size:19px;line-height:1.35;color:var(--c-main)}
.tm-tekst cite{display:block;margin-top:6px;font-size:12.5px;font-style:normal;color:#6b7a80}
.tm-spoerg{padding:12px 14px;border-radius:14px;background:var(--c-soft,#f4f4f2);font-size:14px}
.tm-spoerg b{color:var(--c-main)}
.tm-tilbage{align-self:flex-start;border:0;background:none;padding:0;font:inherit;font-size:13.5px;font-weight:700;color:var(--c-main);cursor:pointer}
.tm-knap{align-self:flex-start;margin-top:4px;border:0;border-radius:999px;padding:12px 20px;background:var(--c-accent);color:var(--c-on-accent,#fff);font:inherit;font-weight:800;font-size:14.5px;cursor:pointer}
@media (max-width:760px){
  .tm-bg{align-items:flex-end}
  .tm-ark,.tm-ark.tm-profil{width:100%;max-height:92%;border-radius:22px 22px 0 0;padding-bottom:env(safe-area-inset-bottom,0px)}
  .tm-ark{padding:20px 16px calc(20px + env(safe-area-inset-bottom,0px))}
  .tm-p{grid-template-columns:1fr}
  .tm-foto{min-height:0;height:min(48vh,380px)}
  .tm-tekst{padding:18px 18px 24px}
  .tm-tekst h2{font-size:25px}
  .tm-liste{grid-template-columns:repeat(2,minmax(0,1fr))}
}
`;
