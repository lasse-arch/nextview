"use client";

import { useEffect, useState } from "react";

/*
 * Kundegennemsyn: on the review link (/p/<token>) the tour gets a "Giv
 * feedback" button - a text field and Send, nothing else. Where they stand
 * and what they see is kept by itself (the view, to fly back to, and a
 * picture of it). What others have said is listed, with "Gå hertil".
 */

export type ReviewView = { href: string; ss: number; room: string | null };
type Note = { id: string; kind: string; text: string; author: string | null; href: string | null; room: string | null; status: string };

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
  const [step, setStep] = useState<null | "write" | "list">(null);
  const [text, setText] = useState("");
  const [here, setHere] = useState<{ view: ReviewView | null; image: string | null } | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = () =>
    fetch(`/api/tour-feedback?token=${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setNotes)
      .catch(() => {});
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  /** Straight to writing - where they stand and what they see is kept by itself. */
  async function open() {
    setStep("write");
    const [v, pic] = await Promise.all([view(), shot()]);
    setHere({ view: v, image: pic });
  }

  async function send() {
    if (!text.trim()) return;
    setBusy(true);
    const r = await fetch("/api/tour-feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, text, href: here?.view?.href, ss: here?.view?.ss, room: here?.view?.room, image: here?.image, device: `${window.innerWidth}×${window.innerHeight} · ${navigator.userAgent.slice(0, 80)}` }),
    }).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setMsg((await r?.json().catch(() => null))?.error ?? "Det kunne ikke sendes - prøv igen.");
    setText("");
    setHere(null);
    setStep(null);
    setMsg("Tak! Vi har fået det.");
    setTimeout(() => setMsg(null), 3000);
    load();
  }

  return (
    <>
      <div className="fb-bar">
        <span className="fb-tag">Gennemsyn</span>
        <button type="button" className="fb-main" onClick={open}>
          Giv feedback
        </button>
        <button type="button" className="fb-list" onClick={() => setStep(step === "list" ? null : "list")}>
          {notes.length ? `${notes.length} indtil nu` : "Ingen endnu"}
        </button>
      </div>

      {step === "write" && (
        <div className="fb-sheet" role="dialog" aria-label="Feedback">
          <div className="fb-card">
            <div className="fb-head">
              <b>Din feedback</b>
              <button type="button" aria-label="Luk" onClick={() => setStep(null)}>
                ×
              </button>
            </div>
            <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Skriv det, du gerne vil have ændret - eller noget, der ikke virker." />
            <button type="button" className="fb-send" disabled={busy || !text.trim()} onClick={send}>
              {busy ? "Sender…" : "Send"}
            </button>
          </div>
        </div>
      )}

      {step === "list" && (
        <div className="fb-panel">
          <div className="fb-head">
            <b>Feedback indtil nu</b>
            <button type="button" aria-label="Luk" onClick={() => setStep(null)}>
              ×
            </button>
          </div>
          {notes.length === 0 && <p className="fb-empty">Ingen har skrevet noget endnu.</p>}
          <ul>
            {notes.map((n) => (
              <li key={n.id} className={n.status === "done" ? "done" : ""}>
                {n.status === "done" && <span className="fb-k fixed">Løst</span>}
                <p>{n.text}</p>
                <small>
                  {n.room}
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
.fb-bar{position:absolute;top:14px;left:50%;translate:-50% 0;z-index:40;display:flex;align-items:center;gap:6px;padding:5px;border-radius:999px;background:rgba(20,22,24,.86);color:#fff;box-shadow:0 8px 24px rgba(0,0,0,.3);backdrop-filter:blur(8px)}
.fb-tag{padding:0 8px 0 10px;font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#ffcc00}
.fb-bar button{border:0;border-radius:999px;font:inherit;font-weight:700;font-size:13px;cursor:pointer;padding:8px 14px}
.fb-main{background:#ffcc00;color:#1d1d1f}
.fb-list{background:rgba(255,255,255,.12);color:#fff}
.fb-sheet{position:absolute;inset:0;z-index:46;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.4)}
.fb-card,.fb-panel{width:min(440px,100%);max-height:100%;overflow-y:auto;border-radius:20px;background:#fff;color:#1d1d1f;padding:16px;box-shadow:0 20px 60px rgba(0,0,0,.4);display:flex;flex-direction:column;gap:10px}
.fb-head{display:flex;align-items:center;justify-content:space-between}
.fb-head b{font-size:17px}
.fb-head button{width:30px;height:30px;border:0;border-radius:50%;background:#f2f2f7;font-size:18px;cursor:pointer}
.fb-card textarea,.fb-card input{width:100%;border:0;border-radius:12px;background:#f2f2f7;font:inherit;font-size:15px;padding:10px 12px;outline:none}
.fb-card textarea{min-height:96px;resize:vertical}
.fb-send{border:0;border-radius:12px;background:#0071e3;color:#fff;font:inherit;font-weight:700;font-size:15px;padding:11px;cursor:pointer}
.fb-send:disabled{opacity:.4}
.fb-panel{position:absolute;top:64px;left:50%;translate:-50% 0;z-index:44;max-height:calc(100% - 90px)}
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
@media (max-width:760px){
  .fb-bar{top:auto;bottom:calc(84px + env(safe-area-inset-bottom,0px))}
  .fb-panel{top:auto;bottom:130px;max-height:60%}
}
`;
