"use client";

import { useT } from "../tours/i18n-react";
import { createContext, useContext } from "react";
import type { LinkOpen, PopupSize, TourConfig } from "../tours/types";

/*
 * Every link out of a tour (book, menu card, webshop…) opens the way the tour
 * is set up to: in a popup over the tour, in a new tab, or in the same tab.
 * One default per tour, and any single link can be set differently.
 */

const LinkCtx = createContext<{ modeFor: (href: string) => LinkOpen; tag: (href: string) => string; popup: (href: string, label: string) => void }>({
  modeFor: () => "tab",
  tag: (href) => href,
  popup: () => {},
});

/**
 * A link to the customer's own pages (booking, order, contact form) carries
 * where the visitor came from - utm_source=nextview360 - so the customer's own
 * analytics and booking system can count the bookings the tour brought.
 * Maps, social media and our own links are left as they are.
 */
export function tagged(T: TourConfig, href: string): string {
  if (T.utm === false || !/^https?:\/\//i.test(href)) return href;
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return href;
  }
  if (/(^|\.)(nextview360\.dk|google\.[a-z.]+|goo\.gl|instagram\.com|facebook\.com|youtube\.com|drive\.google\.com)$/.test(url.hostname) || url.searchParams.has("utm_source")) return href;
  url.searchParams.set("utm_source", "nextview360");
  url.searchParams.set("utm_medium", "virtuel-tour");
  url.searchParams.set("utm_campaign", T.slug);
  return url.toString();
}

/** How a link opens: its own setting, otherwise the tour's default (new tab if none). Phone and mail always open normally. */
export function linkMode(T: TourConfig, href: string): LinkOpen {
  if (/^(tel|mailto):/.test(href)) return "same";
  const mode = T.linkOpen?.byUrl?.[href] ?? T.linkOpen?.default ?? "tab";
  // Sites that refuse to be shown inside another site (a popup would just be blank) always get a new tab.
  return mode === "popup" && NEVER_FRAMED.test(href) ? "tab" : mode;
}

/** Social media, maps and the like - they forbid being shown in a frame. */
const NEVER_FRAMED = /^https?:\/\/([a-z0-9-]+\.)*(facebook\.com|fb\.com|fb\.me|instagram\.com|linkedin\.com|tiktok\.com|twitter\.com|x\.com|threads\.net|pinterest\.[a-z.]+|google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl|wa\.me|whatsapp\.com|m\.me|messenger\.com)(\/|$)/i;

/** Google Drive's /view pages refuse to be shown inside other sites - its /preview page is made for it. */
function embeddable(href: string) {
  return href.replace(/(drive\.google\.com\/file\/d\/[^/]+)\/view.*$/, "$1/preview");
}

export type LinkPopupState = { href: string; label: string } | null;

/** A popup's size: the tour's own, else "stor". */
export function popupSize(T: TourConfig): PopupSize {
  return T.linkOpen?.size ?? "stor";
}

/** The site a link goes to, as people write it: "boxdepotet.dk". */
export function siteOf(href: string): string | null {
  try {
    return new URL(href).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Gives every TourLink below it the tour's opening rule; `popup` shows a link over the tour. */
export function LinkProvider({ T, popup, children }: { T: TourConfig; popup: (href: string, label: string) => void; children: React.ReactNode }) {
  return <LinkCtx.Provider value={{ modeFor: (href) => linkMode(T, href), tag: (href) => tagged(T, href), popup }}>{children}</LinkCtx.Provider>;
}

/** The popup: the page over the tour, with a way out to a new tab (some sites refuse to be shown inside others). */
/** `site`: the site the popup shows, as people write it ("claude.ai") - null leaves it out. */
export function LinkPopup({ open, onClose, size = "stor", custom, site }: { open: NonNullable<LinkPopupState>; onClose: () => void; size?: PopupSize; custom?: { w: number; h: number }; site: string | null }) {
  const tr = useT();
  return (
    <div className={`lk-overlay lk-${size}`} onClick={onClose}>
      <div className="lk-popup" style={size === "egen" && custom ? ({ "--lk-w": `${custom.w}px`, "--lk-h": `${custom.h}px` } as React.CSSProperties) : undefined} onClick={(e) => e.stopPropagation()}>
        <div className="lk-head">
          <div className="lk-title">
            <b>{open.label}</b>
            {/* So visitors know the page is the customer's own site, not ours - shown over the tour. */}
            {site && (
              <span className="lk-site">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(site) && <img src={`https://${site}/favicon.ico`} alt="" width={14} height={14} onError={(e) => (e.currentTarget.style.display = "none")} />}
                {tr("Fra {side}", { side: site })}
              </span>
            )}
          </div>
          <a href={open.href} target="_blank" rel="noopener" onClick={onClose}>
            {tr("Åbn i ny fane ↗")}
          </a>
          <button type="button" aria-label={tr("Luk")} onClick={onClose}>
            ×
          </button>
        </div>
        <iframe src={embeddable(open.href)} title={open.label} allow="payment; clipboard-write" />
      </div>
    </div>
  );
}

/** Links that open something inside the tour rather than a page: the contact form and the live data list. */
const IN_TOUR: Record<string, string> = { "#kontakt": "hv-kontakt", "#live": "hv-live", "#find": "hv-find" };

/** Opens a link from code (a button rather than an <a>) the tour's way. */
export function openLink(T: TourConfig, href: string, label: string, popup: (href: string, label: string) => void) {
  if (IN_TOUR[href]) return void window.dispatchEvent(new Event(IN_TOUR[href]));
  const mode = linkMode(T, href);
  const url = tagged(T, href);
  if (mode === "popup") popup(url, label);
  else if (mode === "same") window.location.assign(url);
  else window.open(url, "_blank", "noopener");
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
  const { modeFor, tag, popup } = useContext(LinkCtx);
  const mode = modeFor(href);
  const url = tag(href);
  return (
    <a
      href={url}
      className={className}
      target={mode === "tab" ? "_blank" : undefined}
      rel={mode === "tab" ? "noopener" : undefined}
      onClick={(e) => {
        onClick?.();
        if (IN_TOUR[href]) {
          // Opens inside the tour (the contact form, the live data list).
          e.preventDefault();
          window.dispatchEvent(new Event(IN_TOUR[href]));
          return;
        }
        if (mode === "popup") {
          e.preventDefault();
          popup(url, label);
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
.lk-title{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
.lk-head b{font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lk-site{display:flex;align-items:center;gap:5px;font-size:12px;color:#6b777d;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lk-site img{width:14px;height:14px;border-radius:3px;flex:none}
.lk-lille .lk-popup{width:min(560px,100%);height:min(640px,100%)}
.lk-mellem .lk-popup{width:min(820px,100%);height:min(760px,100%)}
.lk-egen .lk-popup{width:min(var(--lk-w,1200px),100%);height:min(var(--lk-h,900px),100%)}
.lk-fuld{padding:12px}
.lk-fuld .lk-popup{width:100%;height:100%}
.lk-head a{font-size:13px;color:#56636a;text-decoration:none;white-space:nowrap}
.lk-head a:hover{color:#1d2a30}
.lk-head button{width:36px;height:36px;border:0;border-radius:10px;background:#f1f2f3;font-size:22px;cursor:pointer;color:#1d2a30}
.lk-popup iframe{flex:1;width:100%;border:0;background:#fafafa}
@media (max-width:760px){
  .lk-overlay{padding:0;align-items:flex-end}
  .lk-popup,.lk-egen .lk-popup{width:100%;height:94%;border-radius:18px 18px 0 0}
}
`;
