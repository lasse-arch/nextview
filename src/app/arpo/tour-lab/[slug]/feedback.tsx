"use client";

import { useEffect, useState } from "react";
import { apiUrl } from "../tours/api";

/*
 * Kundegennemsyn: on the review link (/p/<token>) the tour gets a "Giv
 * feedback" button - a text field and Send, nothing else. Where they stand
 * and what they see is kept by itself (the view, to fly back to, and a
 * picture of it). What others have said is listed, with "Gå hertil".
 */

export type ReviewView = { href: string; ss: number; room: string | null };
type Note = {
  id: string;
  kind: string;
  text: string;
  author: string | null;
  href: string | null;
  room: string | null;
  topic?: string | null;
  status: string;
};

/** What a note can be about: the spot they stand at, or something general. */
const TOPICS: [string | null, string][] = [
  [null, "Dette sted"],
  ["menu", "Menuen"],
  ["funktioner", "Funktioner"],
  ["design", "Design"],
  ["andet", "Andet"],
];

export function FeedbackLayer({
  token,
  view,
  shot,
  onGo,
}: {
  token: string;
  /** Where the visitor stands and looks now (null before they're in the tour). */
  view: () => Promise<ReviewView | null>;
  /** A picture of what they see now (a data URL). */
  shot: () => Promise<string | null>;
  onGo: (href: string) => void;
}) {
  const [step, setStep] = useState<null | "write" | "list" | "approve">(null);
  /** "Godkend touren": done already (by them or us), and the name they sign with. */
  const [approved, setApproved] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  /** null = about the spot they stand at; else general feedback about the menu, the functions … */
  const [topic, setTopic] = useState<string | null>(null);
  const [here, setHere] = useState<{
    view: ReviewView | null;
    image: string | null;
  } | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // Starts folded into a small tab at the right edge, so it is not in the way of the tour (the welcome, "Vis mig rundt", menus) - a tap opens the bar.
  const [small, setSmall] = useState(() => {
    try {
      return typeof window === "undefined" || sessionStorage.getItem("fb-small") !== "0";
    } catch {
      return true;
    }
  });
  const fold = (v: boolean) => {
    setSmall(v);
    try {
      sessionStorage.setItem("fb-small", v ? "1" : "0");
    } catch {}
  };

  const load = () =>
    fetch(apiUrl(`/api/tour-feedback?token=${encodeURIComponent(token)}`))
      .then((r) => (r.ok ? r.json() : []))
      .then(setNotes)
      .catch(() => {});
  useEffect(() => {
    load();
    fetch(apiUrl(`/api/tour-review?token=${encodeURIComponent(token)}`))
      .then((r) => (r.ok ? r.json() : null))
      .then((r: { approvedAt: string | null } | null) => r?.approvedAt && setApproved(r.approvedAt))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function approve() {
    setBusy(true);
    const r = await fetch(apiUrl("/api/tour-review"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, name }) }).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setMsg((await r?.json().catch(() => null))?.error ?? "Det kunne ikke sendes - prøv igen.");
    setApproved(new Date().toISOString());
    setStep(null);
    setMsg("Tak! Touren er godkendt - vi har fået besked.");
    setTimeout(() => setMsg(null), 4000);
  }

  /** Straight to writing - where they stand and what they see is kept by itself. */
  async function open() {
    setStep("write");
    window.dispatchEvent(new Event("hv-pause")); // a playing story stops where it is, so the note is about what they see now
    const [v, pic] = await Promise.all([view(), shot()]);
    setHere({ view: v, image: pic });
  }

  async function send() {
    if (!text.trim()) return;
    setBusy(true);
    const r = await fetch(apiUrl("/api/tour-feedback"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        text,
        ...(topic
          ? { topic }
          : {
              href: here?.view?.href,
              ss: here?.view?.ss,
              room: here?.view?.room,
              image: here?.image,
            }),
        device: `${window.innerWidth}×${window.innerHeight} · ${navigator.userAgent.slice(0, 80)}`,
      }),
    }).catch(() => null);
    setBusy(false);
    if (!r?.ok)
      return setMsg(
        (await r?.json().catch(() => null))?.error ??
          "Det kunne ikke sendes - prøv igen.",
      );
    setText("");
    setTopic(null);
    setHere(null);
    setStep(null);
    setMsg("Tak! Vi har fået det.");
    setTimeout(() => setMsg(null), 3000);
    load();
  }

  return (
    <>
      {small ? (
        <button type="button" className="fb-tab" onClick={() => fold(false)}>
          Feedback{notes.length ? ` · ${notes.length}` : ""}
        </button>
      ) : (
        <div className="fb-bar">
          <span className="fb-tag">Gennemsyn</span>
          <button type="button" className="fb-main" onClick={open}>
            Giv feedback
          </button>
          {approved ? (
            <span className="fb-ok">Godkendt ✓</span>
          ) : (
            <button type="button" className="fb-godkend" onClick={() => setStep("approve")}>
              Godkend
            </button>
          )}
          <button
            type="button"
            className="fb-list"
            onClick={() => setStep(step === "list" ? null : "list")}
          >
            {notes.length ? `${notes.length} indtil nu` : "Ingen endnu"}
          </button>
          <button
            type="button"
            className="fb-fold"
            aria-label="Gør mindre"
            title="Gør mindre"
            onClick={() => fold(true)}
          >
            ›
          </button>
        </div>
      )}

      {step === "write" && (
        <div className="fb-sheet" role="dialog" aria-label="Feedback">
          <div className="fb-card">
            <div className="fb-head">
              <b>Din feedback</b>
              <button
                type="button"
                aria-label="Luk"
                onClick={() => setStep(null)}
              >
                ×
              </button>
            </div>
            <div className="fb-om" role="group" aria-label="Om">
              {TOPICS.map(([t, label]) => (
                <button key={label} type="button" aria-pressed={topic === t} className={topic === t ? "on" : ""} onClick={() => setTopic(t)}>
                  {label}
                </button>
              ))}
            </div>
            <textarea
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                topic === "menu"
                  ? "Hvad skal ændres i menuen? Fx et punkt, der mangler, eller en anden rækkefølge."
                  : topic === "funktioner"
                  ? "Hvad skal touren kunne? Fx en knap, en rundvisning eller noget, der ikke virker."
                  : topic === "design"
                  ? "Farver, skrift, logo eller billeder - hvad skal ændres?"
                  : topic
                  ? "Skriv din feedback."
                  : "Skriv det, du gerne vil have ændret her - eller noget, der ikke virker. Vi kan se, hvor du står."
              }
            />
            <button
              type="button"
              className="fb-send"
              disabled={busy || !text.trim()}
              onClick={send}
            >
              {busy ? "Sender…" : "Send"}
            </button>
          </div>
        </div>
      )}

      {step === "approve" && (
        <div className="fb-sheet" role="dialog" aria-label="Godkend touren">
          <div className="fb-card">
            <div className="fb-head">
              <b>Godkend touren?</b>
              <button type="button" aria-label="Luk" onClick={() => setStep(null)}>
                ×
              </button>
            </div>
            <p className="fb-tekst">
              Touren bliver godkendt og meldt færdig, og vi gør den klar til jer med det samme. I får linket på mail.
              {notes.some((n) => n.status !== "done") ? " Jeres rettelser, der ikke er løst endnu, retter vi stadig." : ""}
            </p>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jeres navn (valgfrit)" maxLength={80} />
            <button type="button" className="fb-send fb-send-ok" disabled={busy} onClick={approve}>
              {busy ? "Sender…" : "Ja, godkend touren"}
            </button>
            <button type="button" className="fb-ikke" disabled={busy} onClick={() => setStep(null)}>
              Ikke endnu
            </button>
          </div>
        </div>
      )}

      {step === "list" && (
        <div className="fb-panel">
          <div className="fb-head">
            <b>Feedback indtil nu</b>
            <button
              type="button"
              aria-label="Luk"
              onClick={() => setStep(null)}
            >
              ×
            </button>
          </div>
          {notes.length === 0 && (
            <p className="fb-empty">Ingen har skrevet noget endnu.</p>
          )}
          <ul>
            {notes.map((n) => (
              <li key={n.id} className={n.status === "done" ? "done" : ""}>
                {n.status === "done" && (
                  <span className="fb-k fixed">Løst</span>
                )}
                <p>{n.text}</p>
                <small>
                  {n.topic ? `Om ${TOPICS.find(([t]) => t === n.topic)?.[1].toLowerCase() ?? n.topic}` : n.room}
                  {n.href && (
                    <button
                      type="button"
                      onClick={() => {
                        setStep(null);
                        onGo(n.href!);
                      }}
                    >
                      Gå hertil ›
                    </button>
                  )}
                </small>
              </li>
            ))}
          </ul>
        </div>
      )}

      {msg && <div className="fb-toast">{msg}</div>}
    </>
  );
}

export const FEEDBACK_CSS = `
.fb-bar{position:absolute;top:calc(14px + env(safe-area-inset-top,0px));left:50%;translate:-50% 0;z-index:40;display:flex;align-items:center;gap:6px;padding:5px;border-radius:999px;background:rgba(20,22,24,.86);color:#fff;box-shadow:0 8px 24px rgba(0,0,0,.3);backdrop-filter:blur(8px)}
.fb-tag{padding:0 8px 0 10px;font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#ffcc00}
.fb-bar button{white-space:nowrap;border:0;border-radius:999px;font:inherit;font-weight:700;font-size:13px;cursor:pointer;padding:8px 14px}
.fb-main{background:#ffcc00;color:#1d1d1f}
.fb-list{background:rgba(255,255,255,.12);color:#fff}
.fb-godkend{background:#34c759;color:#fff}
.fb-ok{padding:8px 12px;font-size:13px;font-weight:700;color:#7ee29a;white-space:nowrap}
.fb-tekst{margin:0;font-size:14px;line-height:1.45;color:#3a3a3c}
.fb-send.fb-send-ok{background:#34c759}
.fb-ikke{display:block;width:100%;margin-top:8px;padding:12px;border:0;border-radius:999px;background:#f2f2f7;color:#1d1d1f;font:inherit;font-weight:700;font-size:15px;cursor:pointer}
.fb-sheet{position:absolute;inset:0;z-index:46;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.4)}
.fb-card,.fb-panel{width:min(440px,100%);max-height:100%;overflow-y:auto;border-radius:20px;background:#fff;color:#1d1d1f;padding:16px;box-shadow:0 20px 60px rgba(0,0,0,.4);display:flex;flex-direction:column;gap:10px}
.fb-head{display:flex;align-items:center;justify-content:space-between}
.fb-head b{font-size:17px}
.fb-head button{width:30px;height:30px;border:0;border-radius:50%;background:#f2f2f7;font-size:18px;cursor:pointer}
.fb-card textarea,.fb-card input{width:100%;border:0;border-radius:12px;background:#f2f2f7;font:inherit;font-size:15px;padding:10px 12px;outline:none}
.fb-card textarea{min-height:96px;resize:vertical}
.fb-om{display:flex;flex-wrap:wrap;gap:6px}
.fb-om button{border:0;border-radius:999px;background:#f2f2f7;color:#1d1d1f;font:inherit;font-size:13px;font-weight:600;padding:6px 12px;cursor:pointer}
.fb-om button.on{background:#1d1d1f;color:#fff}
.fb-send{border:0;border-radius:12px;background:#0071e3;color:#fff;font:inherit;font-weight:700;font-size:15px;padding:11px;cursor:pointer}
.fb-send:disabled{opacity:.4}
.fb-panel{position:absolute;top:calc(64px + env(safe-area-inset-top,0px));left:50%;translate:-50% 0;z-index:44;max-height:calc(100% - 90px)}
.fb-panel ul{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px}
.fb-panel li{padding:10px 12px;border-radius:12px;background:#f5f5f7}
.fb-panel li.done{opacity:.55}
.fb-panel p{margin:6px 0 4px;font-size:14px;line-height:1.4}
.fb-panel small{display:flex;align-items:center;gap:8px;font-size:12px;color:#6e6e73}
.fb-panel small button{margin-left:auto;border:0;background:none;color:#0071e3;font:inherit;font-weight:600;cursor:pointer}
.fb-k{display:inline-block;margin-right:4px;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;background:#e8f0fe;color:#0058b0}
.fb-k.fixed{background:#e3f5e8;color:#248a3d}
.fb-empty{font-size:14px;color:#6e6e73}
.fb-toast{position:absolute;left:50%;bottom:24px;translate:-50% 0;z-index:47;padding:10px 16px;border-radius:999px;background:#1d1d1f;color:#fff;font-weight:600;font-size:14px}
.fb-bar .fb-fold{padding:8px 11px;background:none;color:#fff;opacity:.7;font-size:16px;line-height:1}
.fb-tab{position:absolute;right:0;top:50%;z-index:40;translate:0 -50%;writing-mode:vertical-rl;rotate:180deg;border:0;border-radius:0 10px 10px 0;padding:12px 7px;background:#ffcc00;color:#1d1d1f;font:inherit;font-weight:800;font-size:12px;letter-spacing:.04em;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.3)}
/* While a story plays, its progress bars own the top of the screen - the bar steps down below them. */
.hv:has(.hv-story-play) .fb-bar{top:86px}
@media (max-width:760px){
  .fb-bar{top:auto;bottom:calc(84px + env(safe-area-inset-bottom,0px))}
  .fb-bar .fb-tag{display:none}
  .hv:has(.hv-story-play) .fb-bar{top:auto}
  .hv:has(.hv-st-m) .fb-bar{bottom:calc(182px + env(safe-area-inset-bottom,0px))}
  .fb-panel{top:auto;bottom:130px;max-height:60%}
  /* "Vis mig rundt" has its card at the bottom: an opened bar goes to the top instead, under the progress bars. */
  .hv-guiding .fb-bar{top:calc(30px + env(safe-area-inset-top,0px));bottom:auto}
  .hv-guiding .fb-panel{top:calc(84px + env(safe-area-inset-top,0px));bottom:auto}
}
`;
