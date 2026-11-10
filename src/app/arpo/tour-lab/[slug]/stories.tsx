"use client";

import { useT } from "../tours/i18n-react";
import { useEffect, useRef, useState } from "react";
import { mouseScroll } from "./mouse-scroll";

export type StoryRoom = { name: string; href: string; image?: string };

/** How long each room is shown when the stories play by themselves. */
const STORY_MS = 7000;

/**
 * "Historier": the tour's rooms as Instagram-style story cards along the
 * bottom - a picture of each room, a ring that shows which ones you haven't
 * seen yet, and "Afspil", which walks you through them one by one with
 * progress bars at the top, like stories do.
 */
export function Stories({
  rooms,
  current,
  devices,
  leading,
  onGo,
  onEvent,
}: {
  rooms: StoryRoom[];
  current: string | null;
  devices: { mobile: boolean; desktop: boolean; scroll?: { mobile?: false; desktop?: false }; closed?: true };
  /** An extra first card, e.g. "Fra luften" back to the drone scene. */
  leading?: { label: string; onClick: () => void };
  onGo: (room: StoryRoom) => unknown;
  onEvent: (name: string, params: Record<string, string | number>) => void;
}) {
  const tr = useT();
  const [seen, setSeen] = useState<string[]>([]);
  const [playing, setPlaying] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  // Folded in from the start when the tour says so ("Start skjult") - the visitor opens it with its button.
  const [collapsed, setCollapsed] = useState(devices.closed === true);
  /** Phone: once a story is picked (or they play), the row folds into a small player - the place card gets the room. ▴ opens it again. */
  const [mini, setMini] = useState(false);
  /** On the way to the story's room: its time doesn't run until the tour stands there (a slow room still gets its full time). */
  const [arriving, setArriving] = useState(false);
  const cards = useRef<Record<string, HTMLButtonElement | null>>({});
  const row = useRef<HTMLDivElement | null>(null);
  /** The story being flown to (its time starts when it's there). */
  const goingTo = useRef<number | null>(null);

  // The row's real height, for what stands above it (a place card, Find vej) - two-line names or a wrapped row are taller.
  useEffect(() => {
    const el = row.current;
    const root = el?.closest<HTMLElement>(".hv");
    if (!el || !root || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => root.style.setProperty("--st-h", `${Math.round(el.getBoundingClientRect().height)}px`));
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--st-h");
    };
  }, []);

  // A room counts as seen once the visitor has been there, however they got there.
  if (current && !seen.includes(current)) setSeen([...seen, current]);

  useEffect(() => {
    // Only the row scrolls to the room's card - scrollIntoView would also scroll the whole tour sideways
    // (it's scrollable from code even with overflow hidden), and the hidden menu would peek in from the right.
    const card = current ? cards.current[current] : null;
    const row = card?.parentElement;
    if (card && row)
      row.scrollTo({
        left:
          card.offsetLeft -
          row.offsetLeft -
          (row.clientWidth - card.clientWidth) / 2,
        behavior: "smooth",
      });
    // Also when the row opens again after the small player (folded away, it couldn't scroll) - or after "Historier ▾".
  }, [current, mini, collapsed]);

  // Something else wants the visitor's attention (e.g. writing feedback): the story waits.
  useEffect(() => {
    const pause = () => setPaused(true);
    window.addEventListener("hv-pause", pause);
    return () => window.removeEventListener("hv-pause", pause);
  }, []);
  // Something else takes over (Vis mig rundt, Find vej): the stories stop - never two at once.
  useEffect(() => {
    const stop = () => {
      goingTo.current = null;
      setPlaying(null);
    };
    window.addEventListener("hv-stop-stories", stop);
    return () => window.removeEventListener("hv-stop-stories", stop);
  }, []);

  function play(index: number) {
    // The stories take over: a guided tour or a Find vej walk in progress stops.
    if (playing == null) window.dispatchEvent(new Event("hv-story-start"));
    setPlaying(index);
    setPaused(false);
    setArriving(true);
    goingTo.current = index;
    // A moment after arriving, so the room's sharp pictures are in before its time starts.
    Promise.resolve(onGo(rooms[index]))
      .catch(() => {})
      .then(() => new Promise((r) => setTimeout(r, 600)))
      .then(() => goingTo.current === index && setArriving(false));
  }

  function next(how: "auto" | "tap") {
    if (playing == null) return;
    if (playing + 1 >= rooms.length) {
      onEvent("story_complete", { rooms: rooms.length });
      setPlaying(null);
      return;
    }
    onEvent("story_next", {
      how,
      room_name: rooms[playing + 1].name,
      index: playing + 2,
    });
    play(playing + 1);
  }

  // While they play: → next, ← previous, space pauses - not while typing somewhere.
  const keys = useRef({ next, play, playing });
  useEffect(() => {
    keys.current = { next, play, playing };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = keys.current;
      if (k.playing == null || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        k.next("tap");
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (k.playing > 0) k.play(k.playing - 1);
      } else if (e.key === " ") {
        e.preventDefault();
        setPaused((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const visible = `${devices.mobile ? "hv-st-m" : ""} ${devices.desktop ? "hv-st-d" : ""}`;
  /** The room the small player shows: the story playing, or else the room the visitor is in. */
  const now = playing != null ? rooms[playing] : rooms.find((r) => r.name === current);
  const folded = mini && !collapsed && Boolean(now);

  return (
    <>
      {playing != null && (
        <div className={`hv-story-play ${visible} ${folded ? "hv-st-mini-on" : ""}`}>
          <div className="hv-story-bars">
            {rooms.map((r, i) => (
              <span key={r.name} className={i < playing ? "done" : ""}>
                {i === playing && (
                  <i
                    key={playing}
                    style={{
                      animationDuration: `${STORY_MS}ms`,
                      animationPlayState: paused || arriving ? "paused" : "running",
                    }}
                    onAnimationEnd={() => next("auto")}
                  />
                )}
              </span>
            ))}
          </div>
          <div className="hv-story-head">
            {rooms[playing].image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={rooms[playing].image} alt="" />
            )}
            <b>{rooms[playing].name}</b>
            <span>
              {playing + 1}/{rooms.length}
            </span>
            <button
              type="button"
              aria-label={paused ? tr("Fortsæt") : tr("Pause")}
              onClick={() => setPaused((p) => !p)}
            >
              {paused ? (
                <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden fill="currentColor">
                  <path d="M7 4.5v15l12.5-7.5z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden fill="currentColor">
                  <rect x="6" y="5" width="4" height="14" rx="1" />
                  <rect x="14" y="5" width="4" height="14" rx="1" />
                </svg>
              )}
            </button>
            <button
              type="button"
              aria-label={tr("Næste")}
              onClick={() => next("tap")}
            >
              {/* Drawn, not the ⏭ character: Apple's devices show that as a blue emoji. */}
              {/* One triangle and a bar, apart - "next" as on every player. */}
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden fill="currentColor">
                <path d="M5.5 5v14l10.5-7z" />
                <rect x="16.5" y="5" width="3" height="14" rx="1" />
              </svg>
            </button>
            <button
              type="button"
              aria-label={tr("Luk")}
              onClick={() => {
                onEvent("story_close", {
                  room_name: rooms[playing].name,
                  index: playing + 1,
                });
                setPlaying(null);
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <div
        ref={row}
        className={`hv-stories ${visible} ${collapsed ? "hv-st-lukket" : ""} ${folded ? "hv-st-mini-on" : ""} ${devices.scroll?.mobile === false ? "hv-st-wrap-m" : ""} ${devices.scroll?.desktop === false ? "hv-st-wrap-d" : ""}`}
      >
        {folded && now && (
          <div className="hv-st-mini">
            <span className="hv-st-mini-pic">
              {now.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={now.image} alt="" />
              ) : (
                <em>{now.name.slice(0, 1)}</em>
              )}
              {playing != null && (
                <svg viewBox="0 0 40 40" aria-hidden>
                  <circle cx="20" cy="20" r="18" pathLength={100} className="bg" />
                  <circle
                    key={playing}
                    cx="20"
                    cy="20"
                    r="18"
                    pathLength={100}
                    className="fg"
                    style={{ animationDuration: `${STORY_MS}ms`, animationPlayState: paused || arriving ? "paused" : "running" }}
                  />
                </svg>
              )}
            </span>
            <b>{now.name}</b>
            {playing != null && (
              <>
                <button type="button" aria-label={paused ? tr("Fortsæt") : tr("Pause")} onClick={() => setPaused((p) => !p)}>
                  {paused ? (
                    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden fill="currentColor">
                      <path d="M7 4.5v15l12.5-7.5z" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden fill="currentColor">
                      <rect x="6" y="5" width="4" height="14" rx="1" />
                      <rect x="14" y="5" width="4" height="14" rx="1" />
                    </svg>
                  )}
                </button>
                <button type="button" aria-label={tr("Næste")} onClick={() => next("tap")}>
                  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden fill="currentColor">
                    <path d="M5.5 5v14l10.5-7z" />
                    <rect x="16.5" y="5" width="3" height="14" rx="1" />
                  </svg>
                </button>
              </>
            )}
            <button
              type="button"
              aria-label={tr("Historier")}
              className="hv-st-mini-open"
              onClick={() => {
                onEvent("stories_toggle", { open: 1, from: "mini" });
                setMini(false);
              }}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 15l6-6 6 6" />
              </svg>
            </button>
          </div>
        )}
        <button
          type="button"
          className="hv-st-toggle"
          onClick={() => {
            onEvent("stories_toggle", { open: collapsed ? 1 : 0 });
            setCollapsed((c) => !c);
          }}
        >
          {tr("Historier")} {collapsed ? "▴" : "▾"}
        </button>
        {!collapsed && (
          <div className="hv-st-strip">
            <button
              type="button"
              className="hv-st-card hv-st-play"
              onClick={() => {
                const start = Math.max(
                  0,
                  rooms.findIndex((r) => !seen.includes(r.name)),
                );
                onEvent("story_play", { from: rooms[start].name });
                setMini(true);
                play(start);
              }}
            >
              <span className="hv-st-pic">▶</span>
              <b>{tr("Afspil")}</b>
            </button>
            <div className="hv-st-row" ref={mouseScroll}>
              {leading && (
                <button
                  type="button"
                  className="hv-st-card hv-st-extra"
                  onClick={leading.onClick}
                >
                  <span className="hv-st-pic">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M5 5l4 4M19 5l-4 4M5 19l4-4M19 19l-4-4M9 9h6v6H9z" />
                    </svg>
                  </span>
                  <b>{leading.label}</b>
                </button>
              )}
              {rooms.map((r, i) => (
                <button
                  key={r.name}
                  ref={(el) => {
                    cards.current[r.name] = el;
                  }}
                  type="button"
                  className={`hv-st-card ${r.name === current ? "nu" : seen.includes(r.name) ? "set" : ""}`}
                  onClick={() => {
                    onEvent("story_tap", {
                      room_name: r.name,
                      index: i + 1,
                      seen: seen.includes(r.name) ? 1 : 0,
                    });
                    if (playing != null) setPlaying(i);
                    setMini(true);
                    onGo(r);
                  }}
                >
                  <span className="hv-st-pic">
                    {r.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.image} alt="" loading="lazy" />
                    ) : (
                      <em>{r.name.slice(0, 1)}</em>
                    )}
                  </span>
                  <b>{r.name}</b>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

/** Turns a screenshot into a small portrait JPEG for a story card (cropped to fill). */
export async function storyJpeg(
  src: string,
  width = 300,
  height = 400,
): Promise<string> {
  const img = new Image();
  img.src = src;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const scale = Math.max(width / img.naturalWidth, height / img.naturalHeight);
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  canvas
    .getContext("2d")!
    .drawImage(img, (width - w) / 2, (height - h) / 2, w, h);
  return canvas.toDataURL("image/jpeg", 0.78);
}

export const STORIES_CSS = `
.hv-stories{position:absolute;left:0;right:0;bottom:0;z-index:6;display:none;flex-direction:column;align-items:flex-start;padding:0 0 calc(10px + env(safe-area-inset-bottom,0px));background:linear-gradient(to top,rgba(0,0,0,.55),rgba(0,0,0,0));pointer-events:none}
.hv-stories>*{pointer-events:auto}
.hv-st-toggle{margin:0 0 6px 12px;border:0;border-radius:999px;background:rgba(0,0,0,.45);color:#fff;font-family:inherit;font-weight:800;font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;padding:5px 11px;cursor:pointer;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
.hv-st-lukket{background:none}
.hv-st-row{display:flex;gap:9px;width:100%;overflow-x:auto;touch-action:pan-x;overscroll-behavior-x:contain;padding:4px 12px 2px;scroll-snap-type:x proximity;scrollbar-width:none}
.hv-st-row::-webkit-scrollbar{display:none}
@media (hover:hover) and (pointer:fine){.hv-st-row{cursor:grab;scroll-snap-type:none}.hv-st-row:active{cursor:grabbing}}
.hv-st-card{flex:none;width:74px;display:flex;flex-direction:column;align-items:center;gap:5px;border:0;background:none;padding:0;cursor:pointer;scroll-snap-align:center;font-family:inherit;animation:hvUp .45s cubic-bezier(.2,.7,.2,1) both}
.hv-st-pic{position:relative;width:74px;height:98px;border-radius:14px;padding:2.5px;background:linear-gradient(160deg,var(--c-accent),var(--c-main));display:flex;align-items:center;justify-content:center;color:#fff;box-shadow:0 6px 16px rgba(0,0,0,.35);transition:transform .2s}
.hv-st-pic img,.hv-st-pic em{width:100%;height:100%;border-radius:11.5px;object-fit:cover;border:2px solid rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:26px;font-style:normal;background:var(--c-main)}
.hv-st-card b{max-width:84px;font-size:10.5px;font-weight:700;line-height:1.15;color:#fff;text-align:center;text-shadow:0 1px 4px rgba(0,0,0,.7);hyphens:auto;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.hv-st-card.set .hv-st-pic{background:rgba(255,255,255,.45)}
.hv-st-card.set .hv-st-pic img{opacity:.8}
.hv-st-card.nu .hv-st-pic{background:#fff;transform:translateY(-4px) scale(1.04)}
.hv-st-card.nu b{font-weight:900}
.hv-st-card:active .hv-st-pic{transform:scale(.95)}
.hv-st-play .hv-st-pic,.hv-st-extra .hv-st-pic{background:rgba(255,255,255,.16);border:1.5px solid rgba(255,255,255,.6);font-size:26px;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.hv-st-play .hv-st-pic{background:var(--c-accent);border:0}
/* "Afspil" stands still beside the row (the one button that starts it all); only the stories scroll, fading in at the row's left edge. */
.hv-st-strip{display:flex;align-items:flex-start;width:100%;min-width:0;padding-left:12px}
.hv-st-strip>.hv-st-play{padding-top:4px}
.hv-st-strip .hv-st-row{flex:1;min-width:0;margin-left:8px;padding-left:14px;-webkit-mask-image:linear-gradient(90deg,transparent,#000 22px);mask-image:linear-gradient(90deg,transparent,#000 22px)}
.hv-st-extra svg{width:28px;height:28px}
.hv-story-play{position:absolute;top:0;left:0;right:0;z-index:8;display:none;flex-direction:column;gap:8px;padding:8px 10px 26px;background:linear-gradient(rgba(0,0,0,.5),rgba(0,0,0,0));color:#fff;pointer-events:none}
.hv-story-play>*{pointer-events:auto}
/* The bars keep clear of the menu button in the corner, like the head under them. */
.hv-story-bars{display:flex;gap:3px;width:calc(100% - 100px)}
.hv-story-bars span{flex:1;height:3px;border-radius:2px;background:rgba(255,255,255,.35);overflow:hidden}
.hv-story-bars span.done{background:#fff}
.hv-story-bars i{display:block;height:100%;background:#fff;transform-origin:left;animation:hvStory linear forwards}
@keyframes hvStory{from{transform:scaleX(0)}to{transform:scaleX(1)}}
/* The buttons keep their place whatever the room's name: the name takes the room left (shortened with …), the count has a fixed width. */
.hv-story-head{display:flex;align-items:center;gap:8px;width:calc(100% - 100px)}
.hv-story-head img{flex:none;width:30px;height:30px;border-radius:50%;object-fit:cover;border:2px solid #fff}
.hv-story-head b{flex:1;min-width:0;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 1px 4px rgba(0,0,0,.6)}
.hv-story-head span{flex:none;min-width:38px;text-align:right;font-size:12px;opacity:.8;font-variant-numeric:tabular-nums}
.hv-story-head button{display:grid;place-items:center;padding:0;border:0;background:rgba(0,0,0,.4);color:#fff;width:30px;height:30px;border-radius:50%;font-size:12px;line-height:1;cursor:pointer;flex:none}
@media (max-width:760px){
  .hv-stories.hv-st-m,.hv-story-play.hv-st-m{display:flex}
  .hv-st-m~.hv-room,.hv-st-on-m .hv-room,.hv-st-on-m .hv-luften{display:none}
  /* A place card stands above the stories, not on them. */
  /* (.pc and Find vej are drawn at the phone's zoom, so their distance is too.) */
  .hv-st-on-m .pc{bottom:calc((var(--st-h,150px) + 8px) / var(--ui-zoom,1))}
  .hv-st-on-m .hv-dev{bottom:calc(var(--st-h,150px) + 8px)}
  /* Find vej (and anything else at the bottom) stands above the stories too. */
  .hv-st-on-m.hv-i-tour .rt-knap{bottom:calc((var(--st-h,150px) + 8px) / var(--ui-zoom,1))}
  .hv-st-on-m .hv-logo{transition:opacity .2s}
  .hv-st-on-m:has(.hv-story-play) .hv-logo{opacity:0}
}
/* The small player (phone only): the picked story in a pill - its picture with the time running round it, the name, pause, next and ▴ for the whole row. */
.hv-st-mini{display:none}
@media (max-width:760px){
  .hv-stories.hv-st-mini-on{background:none}
  .hv-st-mini-on>.hv-st-toggle,.hv-st-mini-on>.hv-st-strip{display:none}
  .hv-st-mini{display:flex;align-items:center;gap:8px;margin:0 0 2px 12px;max-width:calc(100% - 24px);padding:5px 6px 5px 5px;border-radius:999px;background:rgba(0,0,0,.55);color:#fff;box-shadow:0 6px 18px rgba(0,0,0,.3);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);animation:hvUp .3s cubic-bezier(.2,.7,.2,1) both}
  .hv-st-mini-pic{position:relative;flex:none;width:36px;height:36px;display:grid;place-items:center}
  .hv-st-mini-pic img,.hv-st-mini-pic em{width:30px;height:30px;border-radius:50%;object-fit:cover;display:grid;place-items:center;font-style:normal;font-weight:800;font-size:13px;background:var(--c-main)}
  .hv-st-mini-pic svg{position:absolute;inset:0;width:36px;height:36px;transform:rotate(-90deg)}
  .hv-st-mini-pic circle{fill:none;stroke-width:3}
  .hv-st-mini-pic .bg{stroke:rgba(255,255,255,.3)}
  .hv-st-mini-pic .fg{stroke:#fff;stroke-dasharray:100;stroke-dashoffset:100;stroke-linecap:round;animation:hvStoryRing linear forwards}
  .hv-st-mini b{min-width:0;flex:0 1 auto;font-size:13px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .hv-st-mini button{flex:none;display:grid;place-items:center;width:30px;height:30px;padding:0;border:0;border-radius:50%;background:rgba(255,255,255,.16);color:#fff;cursor:pointer}
  .hv-st-mini .hv-st-mini-open{background:rgba(255,255,255,.28)}
  /* Pause and next are in the small player - the top keeps the bars, the name and ✕. */
  .hv-story-play.hv-st-mini-on .hv-story-head button:not(:last-child){display:none}
}
@keyframes hvStoryRing{from{stroke-dashoffset:100}to{stroke-dashoffset:0}}
/* No sideways scroll on this device: every story shown, wrapped onto more rows. */
@media (max-width:760px){
  .hv-st-wrap-m .hv-st-row{flex-wrap:wrap;overflow:visible;justify-content:center;row-gap:8px;-webkit-mask-image:none;mask-image:none}
}
@media (min-width:761px){
  .hv-st-wrap-d .hv-st-row{flex-wrap:wrap;overflow:visible;justify-content:center;row-gap:8px;-webkit-mask-image:none;mask-image:none}
}
@media (min-width:761px){
  .hv-stories.hv-st-d,.hv-story-play.hv-st-d{display:flex}
  .hv-stories.hv-st-d{left:50%;right:auto;transform:translateX(-50%);max-width:min(860px,calc(100vw - 340px));background:none;align-items:center}
  .hv-st-d .hv-st-row{justify-content:safe center}
  .hv-st-d .hv-st-strip{justify-content:center}
  .hv-st-d .hv-st-strip .hv-st-row{flex:0 1 auto}
  .hv-stories.hv-st-d{transition:left .3s ease}
  .hv-st-d~.hv-room,.hv-st-on-d .hv-room,.hv-st-on-d .hv-luften{display:none}
  .hv-st-on-d .pc{bottom:calc(var(--st-h,148px) + 8px)}
  /* Computer: the dark fade goes the whole width (no hard edges) - only the bars and the head keep to the middle. */
.hv-story-play.hv-st-d{align-items:center}
.hv-story-play.hv-st-d>*{width:min(620px,100%)}
.hv-story-play.hv-st-d .hv-story-head{width:min(620px,100%)}
}
`;
