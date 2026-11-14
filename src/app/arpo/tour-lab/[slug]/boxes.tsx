"use client";

import { RichText } from "./rich-text";
import { useEffect } from "react";
import { useT } from "../tours/i18n-react";
import type { TourBox } from "../tours/types";
import { TourLink } from "./links";

/*
 * "Infoboks" (TourConfig.boxes): a few words about something, over the tour -
 * opened from any link "#boks:<id>" (e.g. "Læs om Wave" on a stop of "Vis mig
 * rundt"). A tap outside, × or Esc closes it, and the tour is where it was.
 */
export function BoxSheet({ box, onClose, onLink }: { box: TourBox; onClose: () => void; onLink: (label: string, href: string) => void }) {
  const tr = useT();
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div className="bx-bg" onClick={onClose}>
      <div className={`bx-ark ${box.image ? "bx-med-foto" : ""}`} role="dialog" aria-modal="true" aria-label={tr(box.title)} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="bx-x" aria-label={tr("Luk")} onClick={onClose}>
          ×
        </button>
        {box.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="bx-foto" src={box.image} alt="" />
        )}
        <div className="bx-tekst">
          <h2>{tr(box.title)}</h2>
          <p>
            <RichText text={tr(box.text)} />
          </p>
          {box.link?.label && box.link.href && (
            <TourLink className="bx-knap" href={box.link.href} label={box.link.label} onClick={() => onLink(box.link!.label, box.link!.href)}>
              {tr(box.link.label)}
            </TourLink>
          )}
        </div>
      </div>
    </div>
  );
}

export const BOXES_CSS = `
.bx-bg{position:absolute;inset:0;z-index:45;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.4);animation:hvFade .25s ease}
.bx-ark{position:relative;width:min(460px,calc(100% - 32px));max-height:calc(100% - 48px);overflow-y:auto;overscroll-behavior:contain;box-sizing:border-box;border-radius:24px;background:#fff;color:#1d2a30;box-shadow:0 20px 60px rgba(0,0,0,.35);animation:hvUp .35s cubic-bezier(.2,.7,.2,1) both}
.bx-x{position:absolute;top:12px;right:12px;z-index:2;width:34px;height:34px;border:0;border-radius:50%;background:rgba(0,0,0,.08);color:#1d2a30;font-size:20px;line-height:1;cursor:pointer}
.bx-med-foto .bx-x{background:rgba(0,0,0,.55);color:#fff}
.bx-foto{display:block;width:100%;aspect-ratio:16/9;object-fit:cover}
.bx-tekst{padding:22px 24px 24px;display:flex;flex-direction:column;gap:10px}
.bx-tekst h2{margin:0 40px 2px 0;font-size:24px;line-height:1.15;font-weight:800;color:var(--c-main);font-family:var(--font-heading,inherit)}
.bx-med-foto .bx-tekst h2{margin-right:0}
.bx-tekst p{margin:0;font-size:15px;line-height:1.55;color:#33474d}
.bx-knap{align-self:flex-start;margin-top:6px;border-radius:999px;padding:11px 20px;background:var(--c-accent);color:var(--c-on-accent,#fff);font-weight:800;font-size:14.5px;text-decoration:none}
@media (max-width:760px){
  .bx-bg{align-items:flex-end}
  .bx-ark{width:100%;max-height:88%;border-radius:22px 22px 0 0;padding-bottom:env(safe-area-inset-bottom,0px)}
  .bx-tekst{padding:18px 18px 22px}
  .bx-tekst h2{font-size:21px}
}
`;
