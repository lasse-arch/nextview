"use client";

import { createContext, useContext } from "react";
import type { LinkOpen, TourConfig } from "../tours/types";

/*
 * Every link out of a tour (book, menu card, webshop…) opens the way the tour
 * is set up to: in a popup over the tour, in a new tab, or in the same tab.
 * One default per tour, and any single link can be set differently.
 */

const LinkCtx = createContext<{ modeFor: (href: string) => LinkOpen; popup: (href: string, label: string) => void }>({
  modeFor: () => "tab",
  popup: () => {},
});

/** How a link opens: its own setting, otherwise the tour's default (new tab if none). Phone and mail always open normally. */
export function linkMode(T: TourConfig, href: string): LinkOpen {
  if (/^(tel|mailto):/.test(href)) return "same";
  return T.linkOpen?.byUrl?.[href] ?? T.linkOpen?.default ?? "tab";
}

/** Google Drive's /view pages refuse to be shown inside other sites - its /preview page is made for it. */
function embeddable(href: string) {
  return href.replace(/(drive\.google\.com\/file\/d\/[^/]+)\/view.*$/, "$1/preview");
}

export type LinkPopupState = { href: string; label: string } | null;

/** Gives every TourLink below it the tour's opening rule; `popup` shows a link over the tour. */
export function LinkProvider({ T, popup, children }: { T: TourConfig; popup: (href: string, label: string) => void; children: React.ReactNode }) {
  return <LinkCtx.Provider value={{ modeFor: (href) => linkMode(T, href), popup }}>{children}</LinkCtx.Provider>;
}

/** The popup: the page over the tour, with a way out to a new tab (some sites refuse to be shown inside others). */
export function LinkPopup({ open, onClose }: { open: NonNullable<LinkPopupState>; onClose: () => void }) {
  return (
    <div className="lk-overlay" onClick={onClose}>
      <div className="lk-popup" onClick={(e) => e.stopPropagation()}>
        <div className="lk-head">
          <b>{open.label}</b>
          <a href={open.href} target="_blank" rel="noopener" onClick={onClose}>
            Åbn i ny fane ↗
          </a>
          <button type="button" aria-label="Luk" onClick={onClose}>
            ×
          </button>
        </div>
        <iframe src={embeddable(open.href)} title={open.label} allow="payment; clipboard-write" />
      </div>
    </div>
  );
}

/** Opens a link from code (a button rather than an <a>) the tour's way. */
export function openLink(T: TourConfig, href: string, label: string, popup: (href: string, label: string) => void) {
  const mode = linkMode(T, href);
  if (mode === "popup") popup(href, label);
  else if (mode === "same") window.location.assign(href);
  else window.open(href, "_blank", "noopener");
}

/** An <a> that opens the tour's way; onClick is for tracking. */
export function TourLink({
  href,
  label,
  onClick,
  className,
  children,
}: {
  href: string;
  label: string;
  onClick?: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  const { modeFor, popup } = useContext(LinkCtx);
  const mode = modeFor(href);
  return (
    <a
      href={href}
      className={className}
      target={mode === "tab" ? "_blank" : undefined}
      rel={mode === "tab" ? "noopener" : undefined}
      onClick={(e) => {
        onClick?.();
        if (mode === "popup") {
          e.preventDefault();
          popup(href, label);
        }
      }}
    >
      {children}
    </a>
  );
}

export const LINKS_CSS = `
.lk-overlay{position:absolute;inset:0;z-index:40;display:flex;align-items:center;justify-content:center;padding:28px;background:rgba(0,0,0,.55);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);animation:hvFade .25s ease}
.lk-popup{width:min(1000px,100%);height:min(860px,100%);display:flex;flex-direction:column;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 24px 70px rgba(0,0,0,.45);animation:hvUp .35s cubic-bezier(.2,.7,.2,1) both}
.lk-head{display:flex;align-items:center;gap:14px;padding:10px 12px 10px 20px;border-bottom:1px solid #eee;color:#1d2a30}
.lk-head b{flex:1;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lk-head a{font-size:13px;color:#56636a;text-decoration:none;white-space:nowrap}
.lk-head a:hover{color:#1d2a30}
.lk-head button{width:36px;height:36px;border:0;border-radius:10px;background:#f1f2f3;font-size:22px;cursor:pointer;color:#1d2a30}
.lk-popup iframe{flex:1;width:100%;border:0;background:#fafafa}
@media (max-width:760px){
  .lk-overlay{padding:0;align-items:flex-end}
  .lk-popup{height:94%;border-radius:18px 18px 0 0}
}
`;
