"use client";

import { useT } from "../tours/i18n-react";
import { useEffect, useRef, useState } from "react";
import type { PlaceCard as Card, TourConfig } from "../tours/types";
import { TourLink } from "./links";

/**
 * A place card: comes up when the visitor arrives at its scan point, bottom
 * left, and goes by itself when the thin bar has run out - unless they read
 * on ("Læs mere", or just touching the card stops it).
 */
export function PlaceCard({
  card,
  size = "mellem",
  onClose,
  onRoom,
  onLink,
  voice,
  onPhotos,
  extra,
}: {
  card: Card;
  /** Something more on the card's first page, under the text (e.g. "Næste rundvisninger"). */
  extra?: React.ReactNode;
  /** A tap on one of the card's photos: show them big, from that one. */
  onPhotos?: (images: string[], at: number) => void;
  size?: TourConfig["placeCardSize"];
  /** "Få det læst op" (TourConfig.placeCardVoice) - its button's words, or undefined for none. */
  voice?: string;
  onClose: (how: "timer" | "close" | "button") => void;
  onRoom: (name: string) => void;
  onLink: (label: string, href: string) => void;
}) {
  const tr = useT();
  const [stopped, setStopped] = useState(false);
  const [page, setPage] = useState<1 | 2>(1);
  const [open, setOpen] = useState(false); // phones: the text unfolded
  // "Læs mere" only when the text is actually cut off (a short text has nothing more to read).
  const textEl = useRef<HTMLParagraphElement>(null);
  const [clipped, setClipped] = useState(false);
  useEffect(() => {
    const el = textEl.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      // "Læs mere" only for more than a line and a half hidden - a few words more are simply shown.
      const line = parseFloat(getComputedStyle(el).lineHeight) || 20;
      const hidden = el.scrollHeight - el.clientHeight;
      setClipped(hidden > line * 1.5);
      if (hidden > 1 && hidden <= line * 1.5) setOpen(true);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [card.text, page]);
  // Read aloud: the card's own voice (ElevenLabs, made in the editor) - only while the card still says what it was read from.
  const voiceText = `${card.title}. ${card.text}`;
  const audio = card.audio && (card.audioText == null || card.audioText.replace(/\s+/g, " ").trim() === voiceText.replace(/\s+/g, " ").trim()) ? card.audio : null;
  const player = useRef<HTMLAudioElement | null>(null);
  const [reading, setReading] = useState(false);
  useEffect(() => () => player.current?.pause(), []);
  function readAloud() {
    if (!audio) return;
    if (reading) {
      player.current?.pause();
      return setReading(false);
    }
    setStopped(true); // the card stays while it's read
    player.current ??= new Audio(audio);
    player.current.currentTime = 0;
    player.current.onended = () => setReading(false);
    player.current.play().then(() => setReading(true), () => setReading(false));
  }
  const seconds = card.seconds ?? 15;
  // At most three, and only those with a photo (name and role are optional).
  const people = (card.people ?? []).filter((p) => p.image).slice(0, 3);
  return (
    <div className={`pc pc-${size}`} onPointerDown={() => setStopped(true)}>
      <div className="pc-bar">
        <i style={{ animationDuration: `${seconds}s`, animationPlayState: stopped ? "paused" : "running" }} onAnimationEnd={() => onClose("timer")} />
      </div>
      <button type="button" className="pc-luk" aria-label={tr("Luk")} onClick={() => onClose("close")}>
        ×
      </button>
      {page === 1 ? (
        <>
          <h3>{card.title}</h3>
          {voice && audio && (
            <button type="button" className={`pc-laes ${reading ? "aktiv" : ""}`} onClick={readAloud}>
              <svg viewBox="0 0 24 24" aria-hidden>
                {reading ? <rect x="7" y="7" width="10" height="10" rx="1.5" /> : <path d="M4 9v6h4l5 4V5L8 9zM16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" />}
              </svg>
              {reading ? tr("Stop oplæsningen") : voice}
            </button>
          )}
          <p ref={textEl} className={open ? "" : "pc-klip"}>
            {card.text}
          </p>
          {!open && clipped && (
            <button type="button" className="pc-mere-mobil" onClick={() => setOpen(true)}>
              {tr("Læs mere")}
            </button>
          )}
          {extra}
          {card.images?.length ? <CardPhotos images={card.images} onOpen={(at) => onPhotos?.(card.images!, at)} /> : null}
          {people.length > 0 && (
            <div className={`pc-folk pc-folk-${people.length}${people.some((p) => p.name?.trim() || p.role?.trim()) ? "" : " pc-folk-bare"}`}>
              {people.map((p, i) => (
                <figure key={i}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.image} alt="" loading="lazy" />
                  {(p.name?.trim() || p.role?.trim()) && (
                    <figcaption>
                      {p.name?.trim() && <b>{p.name}</b>}
                      {p.role?.trim() && <span>{p.role}</span>}
                    </figcaption>
                  )}
                </figure>
              ))}
            </div>
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
              ← {tr("Tilbage")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** The card that comes by itself after a while, with the tour's next step. */
export function NudgeCard({ T, onClose, onLink }: { T: TourConfig; onClose: () => void; onLink: (label: string, href: string) => void }) {
  const tr = useT();
  const n = T.nudge!;
  return (
    <div className={`pc pc-nudge pc-${T.placeCardSize ?? "mellem"}`}>
      <button type="button" className="pc-luk" aria-label={tr("Luk")} onClick={onClose}>
        ×
      </button>
      <h3>{n.title}</h3>
      <p>{n.text}</p>
      <div className="pc-btns">
        {(n.buttons.length ? n.buttons : T.cta.filter((c) => c.primary).map((c) => ({ ...c, primary: true }))).map((b) => (
          <TourLink key={b.label} className={`pc-btn ${b.primary ? "pc-primary" : "pc-fly"}`} href={b.href} label={b.label} onClick={() => onLink(b.label, b.href)}>
            {b.label}
          </TourLink>
        ))}
      </div>
    </div>
  );
}

/** A card's photos: a small row of thumbnails (scrolls sideways when there are many) - a tap shows them big. */
export function CardPhotos({ images, onOpen }: { images: string[]; onOpen: (at: number) => void }) {
  return (
    <div className="pc-fotos">
      {images.map((src, i) => (
        <button key={src + i} type="button" onClick={() => onOpen(i)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" loading="lazy" draggable={false} />
        </button>
      ))}
    </div>
  );
}

export const CARDS_CSS = `
.pc-fotos{display:flex;gap:6px;margin:0 0 10px;overflow-x:auto;scrollbar-width:none}
.pc-fotos::-webkit-scrollbar{display:none}
.pc-fotos button{flex:none;width:76px;height:56px;padding:0;border:0;border-radius:9px;overflow:hidden;background:#eef2f2;cursor:zoom-in}
.pc-fotos img{display:block;width:100%;height:100%;object-fit:cover}
@media (max-width:760px){.pc-fotos button{width:60px;height:44px;border-radius:7px}.pc-fotos{margin-bottom:7px}}
.pc-laes{display:inline-flex;align-items:center;gap:6px;margin:-2px 0 8px;padding:4px 10px 4px 8px;border:0;border-radius:999px;background:color-mix(in srgb,var(--c-accent) 12%,transparent);color:var(--c-main);font:inherit;font-size:12.5px;font-weight:700;cursor:pointer}
.pc-laes svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.pc-laes.aktiv{background:var(--c-accent);color:#fff}
.pc-laes.aktiv svg{fill:currentColor;stroke:none}
.pc{position:absolute;left:24px;bottom:96px;z-index:7;width:min(380px,calc(100% - 24px));padding:18px 22px 18px;border-radius:14px;background:#fff;color:var(--c-main);box-shadow:0 10px 30px rgba(0,0,0,.2);overflow:hidden;animation:hvUp .4s cubic-bezier(.2,.7,.2,1) both}
.pc-bar{position:absolute;left:0;right:0;top:0;height:3px;background:color-mix(in srgb,var(--c-accent) 18%,transparent)}
.pc-bar i{display:block;height:100%;background:var(--c-accent);transform-origin:left;animation:pcTael linear forwards}
@keyframes pcTael{from{transform:scaleX(1)}to{transform:scaleX(0)}}
.pc-luk{position:absolute;top:10px;right:10px;width:30px;height:30px;border:0;border-radius:50%;background:#f1f4f4;color:var(--c-main);font-size:18px;line-height:30px;cursor:pointer}
.pc h3{margin:0 34px 8px 0;font-family:var(--font-heading);font-size:21px;font-weight:800;line-height:1.2}
.pc p{margin:0 0 12px;font-size:15px;line-height:1.55;color:#33494f}
.pc-mere-mobil{display:none}
/* The people you meet here: small round photos with name and role - one beside its text, two or three side by side from the left. */
.pc-folk{display:flex;gap:14px;margin:2px 0 14px}
.pc-folk figure{margin:0;flex:0 1 92px;display:flex;flex-direction:column;align-items:center;gap:6px;min-width:0;text-align:center}
.pc-folk img{width:52px;height:52px;border-radius:50%;object-fit:cover;object-position:50% 20%;background:#eef2f2;box-shadow:0 0 0 2px #fff,0 0 0 3.5px color-mix(in srgb,var(--c-accent) 55%,transparent)}
.pc-folk figcaption{display:flex;flex-direction:column;min-width:0;max-width:100%;line-height:1.25}
.pc-folk b{font-size:13px;font-weight:800;color:var(--c-main);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pc-folk span{font-size:12px;color:#5d7177;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.pc-folk-1 figure{flex:1 1 auto;flex-direction:row;align-items:center;gap:12px;text-align:left}
/* Only photos, no names: close together. */
.pc-folk-bare{gap:8px}
.pc-folk-bare figure{flex:0 0 auto}
.pc-btns{display:flex;flex-wrap:wrap;gap:6px}
.pc-btn{display:inline-block;border:2px solid var(--c-main);background:#fff;color:var(--c-main);border-radius:999px;padding:7px 14px;font:inherit;font-size:14px;font-weight:800;cursor:pointer;text-decoration:none}
.pc-btn:hover{background:var(--c-main);color:#fff}
.pc-primary{background:var(--c-accent);border-color:var(--c-accent);color:#fff}
.pc-primary:hover{background:var(--c-accent-dark);border-color:var(--c-accent-dark)}
.pc-nudge{z-index:8}
.hv-menu-aaben .pc,.hv-welcome .pc,.hv-guiding .pc,.hv-routing .pc{display:none}
/* The cards on the right (placeCardSide), per device. */
@media (min-width:761px) and (min-height:501px){.hv-pc-h-d .pc{left:auto;right:24px}}
.pc-lille{width:min(320px,calc(100% - 24px));padding:14px 18px}
.pc-lille h3{font-size:18px}.pc-lille p{font-size:14px}
.pc-stor{width:min(440px,calc(100% - 24px))}
.pc-stor h3{font-size:23px}.pc-stor p{font-size:16px}
/* Phones: sized by the screen (an iPhone mini gets a smaller card than a Pro Max), never more than a third of the height. */
@media (max-width:760px){
  .pc{left:10px;bottom:calc(76px + env(safe-area-inset-bottom,0px));width:min(78vw,300px);padding:clamp(10px,3vw,13px) clamp(12px,3.6vw,16px);max-height:34dvh;overflow-y:auto;border-radius:12px}
  .pc h3{font-size:clamp(15px,4.3vw,17px);margin-bottom:5px}
  .pc p{font-size:clamp(12.5px,3.5vw,13.5px);line-height:1.45;margin-bottom:6px}
  .pc p.pc-klip{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
  .pc-mere-mobil{display:block;margin:-2px 0 4px;padding:4px 0;border:0;background:none;font:inherit;font-size:13px;font-weight:800;color:var(--c-accent);cursor:pointer}
  /* People in one low row: a small photo with the name and role beside it - not a tall column. */
  .pc-folk{gap:10px;margin:2px 0 8px}
  .pc-folk figure,.pc-folk-1 figure{flex:1 1 0;min-width:0;flex-direction:row;align-items:center;gap:7px;text-align:left}
  .pc-folk img{width:30px;height:30px;flex:none}
  .pc-folk figcaption{min-width:0}
  .pc-folk span{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .pc-folk-1 figure{gap:9px}
  .pc-folk b{font-size:11.5px}
  .pc-folk span{font-size:10.5px}
  .pc-btn{font-size:12.5px;padding:5px 11px;border-width:1.5px}
  .pc-luk{top:7px;right:7px;width:26px;height:26px;line-height:26px;font-size:16px}
  .pc-lille{width:min(66vw,250px);max-height:26dvh}
  .pc-lille h3{font-size:clamp(14px,3.9vw,15.5px)}
  .pc-lille p{font-size:clamp(12px,3.3vw,13px)}
  .pc-lille p.pc-klip{-webkit-line-clamp:2}
  .pc-stor{width:min(88vw,340px);max-height:42dvh}
  .pc-stor p.pc-klip{-webkit-line-clamp:4}
}
/* A phone on its side: low and wide - the card to the left, small, never higher than the screen. */
@media (max-height:500px) and (min-width:500px){
  .pc{left:max(12px,env(safe-area-inset-left,0px));bottom:12px;width:min(36vw,300px);max-height:calc(100dvh - 90px);overflow-y:auto;padding:10px 14px}
  .pc h3{font-size:16px;margin-bottom:4px}
  .pc p{font-size:13px;line-height:1.4;margin-bottom:6px}
  .pc p.pc-klip{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .pc-mere-mobil{display:block;margin:-2px 0 4px;padding:2px 0;border:0;background:none;font:inherit;font-size:13px;font-weight:800;color:var(--c-accent);cursor:pointer}
  .pc-btn{font-size:12.5px;padding:4px 10px}
  .pc-folk{gap:6px;margin:0 0 6px}
  .pc-folk img{width:32px;height:32px}
  .pc-folk span{display:none}
  .pc-stor{width:min(42vw,340px)}.pc-lille{width:min(30vw,250px)}
}
@media (min-width:761px) and (min-height:501px){.pc p.pc-klip{display:block}}
@media (max-width:760px),(max-height:500px) and (min-width:500px){.hv-pc-h-m .pc{left:auto;right:max(10px,env(safe-area-inset-right,0px))}}
`;
