"use client";

import { useState } from "react";
import { LANGUAGES } from "../tours/i18n";

/** The language button (only when the tour has more than Danish): a flag and the code, opening the list. */
export function LangSwitch({ langs, lang, onPick, label }: { langs: string[]; lang: string; onPick: (lang: string) => void; label: string }) {
  const [open, setOpen] = useState(false);
  const cur = LANGUAGES.find((l) => l.code === lang);
  return (
    <div className="ls">
      <button type="button" className="ls-btn" aria-label={label} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span aria-hidden>{cur?.flag ?? "🌐"}</span>
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
                  <span aria-hidden>{l?.flag ?? "🌐"}</span>
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
.ls-btn b{font-weight:800;letter-spacing:.06em}
.ls-list{position:absolute;top:calc(44px + env(safe-area-inset-top,0px));left:50%;translate:-50% 0;min-width:170px;margin:0;padding:6px;list-style:none;border-radius:14px;background:#fff;box-shadow:0 14px 40px rgba(0,0,0,.3);animation:hvFade .15s ease}
.ls-list button{display:flex;align-items:center;gap:10px;width:100%;padding:9px 10px;border:0;border-radius:9px;background:none;color:#1d2a30;font:inherit;font-size:14px;font-weight:600;text-align:left;cursor:pointer}
.ls-list button:hover,.ls-list button[aria-selected=true]{background:#f1f3f4}
.hv:has(.fb-bar) .ls{top:64px}
/* Phones with the side menu: the languages are in the menu instead (see .hv-menu-sprog), out of the way of the top. */
.hv-menu-sprog{display:none}
@media (max-width:760px){.hv:has(.hv-menu-sprog):not(.hv-welcome) .ls{display:none}
  .hv-menu-sprog{display:flex;flex-wrap:wrap;gap:6px;padding:12px 16px 4px}
  .hv-menu-sprog button{display:flex;align-items:center;gap:6px;height:34px;padding:0 12px;border:1px solid rgba(0,0,0,.1);border-radius:999px;background:#fff;color:#1d2a30;font:inherit;font-size:13px;font-weight:600;cursor:pointer}
  .hv-menu-sprog button[aria-pressed=true]{background:var(--c-main);border-color:var(--c-main);color:#fff}
  .hv-menu-aaben .ls{display:none}.ls{top:12px}.ls-btn{width:38px;height:38px;padding:0;justify-content:center}.ls-btn b{display:none}.ls-btn span{font-size:18px}
  /* Next to the menu button, clear of the logo and the drone scene's welcome box. */
  .hv:not(.hv-logo-h) .ls{left:auto;right:100px;translate:none}.hv:not(.hv-logo-h) .ls-list{left:auto;right:-60px;translate:none}
  /* The welcome fills the top - the button waits at the bottom, its list opening upwards. */
  .hv.hv-welcome .ls{top:auto;left:auto;right:14px;bottom:calc(14px + env(safe-area-inset-bottom,0px));translate:none}.hv.hv-welcome .ls-list{top:auto;bottom:46px;left:auto;right:0;translate:none}}
`;
