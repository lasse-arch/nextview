"use client";

import { useState } from "react";
import type { PlaceCard as Card, TourConfig } from "../tours/types";
import { TourLink } from "./links";

/**
 * A place card: comes up when the visitor arrives at its scan point, bottom
 * left, and goes by itself when the thin bar has run out - unless they read
 * on ("Læs mere", or just touching the card stops it).
 */
export function PlaceCard({
  card,
  onClose,
  onRoom,
  onLink,
}: {
  card: Card;
  onClose: (how: "timer" | "close" | "button") => void;
  onRoom: (name: string) => void;
  onLink: (label: string, href: string) => void;
}) {
  const [stopped, setStopped] = useState(false);
  const [page, setPage] = useState<1 | 2>(1);
  const [open, setOpen] = useState(false); // phones: the text unfolded
  const seconds = card.seconds ?? 15;
  return (
    <div className="pc" onPointerDown={() => setStopped(true)}>
      <div className="pc-bar">
        <i style={{ animationDuration: `${seconds}s`, animationPlayState: stopped ? "paused" : "running" }} onAnimationEnd={() => onClose("timer")} />
      </div>
      <button type="button" className="pc-luk" aria-label="Luk" onClick={() => onClose("close")}>
        ×
      </button>
      {page === 1 ? (
        <>
          <h3>{card.title}</h3>
          <p className={open ? "" : "pc-klip"}>{card.text}</p>
          {!open && (
            <button type="button" className="pc-mere-mobil" onClick={() => setOpen(true)}>
              Læs mere
            </button>
          )}
          <div className="pc-btns">
            {card.more && (
              <button type="button" className="pc-btn" onClick={() => (setStopped(true), setPage(2))}>
                {card.more.label}
              </button>
            )}
            {card.buttons?.map((b) =>
              "room" in b ? (
                <button key={b.label} type="button" className="pc-btn pc-fly" onClick={() => (onClose("button"), onRoom(b.room))}>
                  {b.label} →
                </button>
              ) : (
                <TourLink key={b.label} className="pc-btn pc-fly" href={b.href} label={b.label} onClick={() => onLink(b.label, b.href)}>
                  {b.label}
                </TourLink>
              )
            )}
          </div>
        </>
      ) : (
        <>
          <h3>{card.title}</h3>
          <p>{card.more?.text}</p>
          <div className="pc-btns">
            <button type="button" className="pc-btn" onClick={() => setPage(1)}>
              ← Tilbage
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** The card that comes by itself after a while, with the tour's next step. */
export function NudgeCard({ T, onClose, onLink }: { T: TourConfig; onClose: () => void; onLink: (label: string, href: string) => void }) {
  const n = T.nudge!;
  return (
    <div className="pc pc-nudge">
      <button type="button" className="pc-luk" aria-label="Luk" onClick={onClose}>
        ×
      </button>
      <h3>{n.title}</h3>
      <p>{n.text}</p>
      <div className="pc-btns">
        {n.buttons.map((b) => (
          <TourLink key={b.label} className={`pc-btn ${b.primary ? "pc-primary" : "pc-fly"}`} href={b.href} label={b.label} onClick={() => onLink(b.label, b.href)}>
            {b.label}
          </TourLink>
        ))}
      </div>
    </div>
  );
}

export const CARDS_CSS = `
.pc{position:absolute;left:24px;bottom:96px;z-index:7;width:min(380px,calc(100% - 24px));padding:18px 22px 18px;border-radius:14px;background:#fff;color:var(--c-main);box-shadow:0 10px 30px rgba(0,0,0,.2);overflow:hidden;animation:hvUp .4s cubic-bezier(.2,.7,.2,1) both}
.pc-bar{position:absolute;left:0;right:0;top:0;height:3px;background:color-mix(in srgb,var(--c-accent) 18%,transparent)}
.pc-bar i{display:block;height:100%;background:var(--c-accent);transform-origin:left;animation:pcTael linear forwards}
@keyframes pcTael{from{transform:scaleX(1)}to{transform:scaleX(0)}}
.pc-luk{position:absolute;top:10px;right:10px;width:30px;height:30px;border:0;border-radius:50%;background:#f1f4f4;color:var(--c-main);font-size:18px;line-height:30px;cursor:pointer}
.pc h3{margin:0 34px 8px 0;font-family:var(--font-heading);font-size:21px;font-weight:800;line-height:1.2}
.pc p{margin:0 0 12px;font-size:15px;line-height:1.55;color:#33494f}
.pc-mere-mobil{display:none}
.pc-btns{display:flex;flex-wrap:wrap;gap:6px}
.pc-btn{display:inline-block;border:2px solid var(--c-main);background:#fff;color:var(--c-main);border-radius:999px;padding:7px 14px;font:inherit;font-size:14px;font-weight:800;cursor:pointer;text-decoration:none}
.pc-btn:hover{background:var(--c-main);color:#fff}
.pc-primary{background:var(--c-accent);border-color:var(--c-accent);color:#fff}
.pc-primary:hover{background:var(--c-accent-dark);border-color:var(--c-accent-dark)}
.pc-nudge{z-index:8}
.hv-menu-aaben .pc,.hv-welcome .pc,.hv-guiding .pc,.hv-routing .pc{display:none}
@media (max-width:760px){
  .pc{left:10px;bottom:calc(76px + env(safe-area-inset-bottom,0px));width:min(300px,calc(100% - 20px));padding:13px 16px 14px;max-height:45vh;overflow-y:auto}
  .pc h3{font-size:18px}
  .pc p{font-size:13.5px;margin-bottom:8px}
  .pc p.pc-klip{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
  .pc-mere-mobil{display:block;margin:-4px 0 6px;padding:6px 0;border:0;background:none;font:inherit;font-size:14px;font-weight:800;color:var(--c-accent);cursor:pointer}
  .pc-btn{font-size:13px;padding:6px 12px}
}
@media (min-width:761px){.pc p.pc-klip{display:block}}
`;
