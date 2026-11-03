"use client";

import { useState } from "react";
import { LANGUAGES } from "../tours/i18n";

/**
 * A language's flag, drawn (3:2) - not the flag emoji, which every phone draws
 * differently (on Apple's, it sits off-centre in its box). Unknown: a globe.
 */
export function Flag({ code }: { code: string }) {
  const cross = (bg: string, fg: string, inner?: string) => (
    <>
      <rect width="30" height="20" fill={bg} />
      <rect x="8" width="4" height="20" fill={fg} />
      <rect y="8" width="30" height="4" fill={fg} />
      {inner && <rect x="9" width="2" height="20" fill={inner} />}
      {inner && <rect y="9" width="30" height="2" fill={inner} />}
    </>
  );
  const bands = (dir: "h" | "v", colors: string[]) =>
    colors.map((c, i) =>
      dir === "h" ? <rect key={i} y={(20 / colors.length) * i} width="30" height={20 / colors.length} fill={c} /> : <rect key={i} x={(30 / colors.length) * i} width={30 / colors.length} height="20" fill={c} />
    );
  const body: Record<string, React.ReactNode> = {
    da: cross("#c8102e", "#fff"),
    sv: cross("#006aa7", "#fecc00"),
    nb: cross("#ba0c2f", "#fff", "#00205b"),
    de: bands("h", ["#000", "#dd0000", "#ffce00"]),
    nl: bands("h", ["#ae1c28", "#fff", "#21468b"]),
    pl: bands("h", ["#fff", "#dc143c"]),
    fr: bands("v", ["#002395", "#fff", "#ed2939"]),
    it: bands("v", ["#009246", "#fff", "#ce2b37"]),
    es: bands("h", ["#aa151b", "#f1bf00", "#f1bf00", "#aa151b"]),
    kl: (
      <>
        <rect width="30" height="10" fill="#fff" />
        <rect y="10" width="30" height="10" fill="#c8102e" />
        <path d="M5 10a6 6 0 0 1 12 0z" fill="#c8102e" />
        <path d="M5 10a6 6 0 0 0 12 0z" fill="#fff" />
      </>
    ),
    en: (
      <>
        <rect width="30" height="20" fill="#012169" />
        <path d="M0 0 30 20M30 0 0 20" stroke="#fff" strokeWidth="4" />
        <path d="M0 0 30 20M30 0 0 20" stroke="#c8102e" strokeWidth="1.6" />
        <path d="M15 0v20M0 10h30" stroke="#fff" strokeWidth="6" />
        <path d="M15 0v20M0 10h30" stroke="#c8102e" strokeWidth="3.4" />
      </>
    ),
  };
  return (
    <svg className="ls-flag" viewBox="0 0 30 20" aria-hidden>
      {body[code] ?? (
        <>
          <rect width="30" height="20" fill="#cfd8dc" />
          <circle cx="15" cy="10" r="6" fill="none" stroke="#546e7a" strokeWidth="1.5" />
        </>
      )}
    </svg>
  );
}

/** The language button (only when the tour has more than Danish): a flag and the code, opening the list. */
export function LangSwitch({ langs, lang, onPick, label }: { langs: string[]; lang: string; onPick: (lang: string) => void; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="ls">
      <button type="button" className="ls-btn" aria-label={label} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Flag code={lang} />
        <b>{lang.toUpperCase()}</b>
      </button>
      {open && (
        <ul className="ls-list" role="listbox" aria-label={label}>
          {langs.map((code) => {
            const l = LANGUAGES.find((x) => x.code === code);
            return (
              <li key={code}>
                <button
                  type="button"
                  role="option"
                  aria-selected={code === lang}
                  onClick={() => {
                    setOpen(false);
                    onPick(code);
                  }}
                >
                  <Flag code={code} />
                  {l?.name ?? code}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export const LANG_CSS = `
.ls{position:absolute;top:calc(14px + env(safe-area-inset-top,0px));left:50%;translate:-50% 0;z-index:41}
/* Out of the way of what opens over the tour (a link, the day, feedback; the phone's full-screen menu). */
.hv:has(.lk-overlay) .ls,.hv:has(.dy) .ls,.hv:has(.fb-sheet) .ls{display:none}
.ls-btn{display:flex;align-items:center;gap:6px;height:36px;padding:0 12px;border:0;border-radius:999px;background:rgba(15,20,24,.62);color:#fff;font:inherit;font-size:13px;cursor:pointer;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);box-shadow:0 4px 14px rgba(0,0,0,.25)}
.ls-btn b{font-weight:800;letter-spacing:.06em;line-height:1}
.ls-flag{flex:none;display:block;width:20px;height:13.3px;border-radius:2.5px;box-shadow:0 0 0 .5px rgba(0,0,0,.18)}
.ls-list{position:absolute;top:calc(44px + env(safe-area-inset-top,0px));left:50%;translate:-50% 0;min-width:170px;margin:0;padding:6px;list-style:none;border-radius:14px;background:#fff;box-shadow:0 14px 40px rgba(0,0,0,.3);animation:hvFade .15s ease}
.ls-list button{display:flex;align-items:center;gap:10px;width:100%;padding:9px 10px;border:0;border-radius:9px;background:none;color:#1d2a30;font:inherit;font-size:14px;font-weight:600;text-align:left;cursor:pointer}
.ls-list button:hover,.ls-list button[aria-selected=true]{background:#f1f3f4}
.hv:has(.fb-bar) .ls{top:64px}
/* Where the language button stands is set per device (langSwitch): top, corner (by the menu button), menu (in the side menu) or hidden. */
.hv-menu-sprog{display:none;flex-wrap:wrap;gap:6px;padding:12px 16px 4px}
.hv-menu-sprog button{display:flex;align-items:center;gap:6px;height:34px;padding:0 12px;border:1px solid rgba(0,0,0,.1);border-radius:999px;background:#fff;color:#1d2a30;font:inherit;font-size:13px;font-weight:600;cursor:pointer}
.hv-menu-sprog button[aria-pressed=true]{background:var(--c-main);border-color:var(--c-main);color:#fff}
@media (min-width:761px){
  .hv-sprog-d-hidden .ls,.hv-sprog-d-menu:not(.hv-welcome) .ls{display:none}
  .hv-sprog-d-menu .hv-menu-sprog{display:flex}
  .hv-sprog-d-corner .ls{left:auto;right:150px;translate:none}.hv-sprog-d-corner .ls-list{left:auto;right:0;translate:none}
}
@media (max-width:760px){
  .hv-menu-aaben .ls{display:none}.ls{top:12px}.ls-btn{width:38px;height:38px;padding:0;justify-content:center}.ls-btn b{display:none}.ls-btn span{font-size:18px}
  .hv-sprog-m-hidden .ls,.hv-sprog-m-menu:not(.hv-welcome) .ls{display:none}
  .hv-sprog-m-menu .hv-menu-sprog{display:flex}
  /* Next to the menu button, clear of the logo and the drone scene's welcome box. */
  .hv-sprog-m-corner:not(.hv-logo-h) .ls{left:auto;right:100px;translate:none}.hv-sprog-m-corner:not(.hv-logo-h) .ls-list{left:auto;right:-60px;translate:none}
  /* The welcome fills the top - the button waits at the bottom, its list opening upwards. */
  .hv.hv-welcome .ls{top:auto;left:auto;right:14px;bottom:calc(14px + env(safe-area-inset-bottom,0px));translate:none}.hv.hv-welcome .ls-list{top:auto;bottom:46px;left:auto;right:0;translate:none}}
`;
