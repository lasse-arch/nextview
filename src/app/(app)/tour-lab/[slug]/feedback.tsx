"use client";

import { useEffect, useState } from "react";

/*
 * Kundegennemsyn: on the review link (/p/<token>) the tour gets a "Giv
 * feedback" button. The customer points at the spot (or writes something
 * general), says whether it's a suggestion or a bug, and sends. We keep the
 * view they stood in (to fly back to it) and a picture of it with a ring
 * where they pointed. What others have said is listed, with "Gå hertil".
 */

export type ReviewView = { href: string; ss: number; room: string | null };
type Note = { id: string; kind: string; text: string; author: string | null; href: string | null; room: string | null; status: string };

const NAME_KEY = "tour-review-name";

/** The view's picture with a ring where they pointed (x, y in 0-1). */
async function markPicture(src: string, x: number, y: number): Promise<string> {
  const img = new Image();
  img.src = src;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext("2d")!;
  g.drawImage(img, 0, 0);
  const r = Math.max(18, c.width * 0.025);
  g.lineWidth = Math.max(4, r * 0.22);
  g.strokeStyle = "#ff3b30";
  g.shadowColor = "rgba(0,0,0,.5)";
  g.shadowBlur = 6;
  g.beginPath();
  g.arc(x * c.width, y * c.height, r, 0, Math.PI * 2);
  g.stroke();
  return c.toDataURL("image/jpeg", 0.82);
}

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
  const [step, setStep] = useState<null | "point" | "write" | "list">(null);
  const [kind, setKind] = useState<"forslag" | "fejl">("forslag");
  const [text, setText] = useState("");
  const [name, setName] = useState("");
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

  /** Where they pointed: the view and its picture with a ring there - or just the view (general). */
  async function capture(at: { x: number; y: number } | null) {
    setBusy(true);
    const [v, pic] = await Promise.all([view(), shot()]);
    const image = pic ? (at ? await markPicture(pic, at.x, at.y).catch(() => pic) : pic) : null;
    setHere({ view: v, image });
    // Their name from last time, so they only type it once.
    try {
      setName((n) => n || (localStorage.getItem(NAME_KEY) ?? ""));
    } catch {}
    setBusy(false);
    setStep("write");
  }

  async function send() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      localStorage.setItem(NAME_KEY, name);
    } catch {}
    const r = await fetch("/api/tour-feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, kind, text, author: name, href: here?.view?.href, ss: here?.view?.ss, room: here?.view?.room, image: here?.image, device: `${window.innerWidth}×${window.innerHeight} · ${navigator.userAgent.slice(0, 80)}` }),
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
        <button type="button" className="fb-main" onClick={() => setStep("point")}>
          Giv feedback
        </button>
        <button type="button" className="fb-list" onClick={() => setStep(step === "list" ? null : "list")}>
          {notes.length ? `${notes.length} indtil nu` : "Ingen endnu"}
        </button>
      </div>

      {step === "point" && (
        <div
          className="fb-point"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            capture({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height });
          }}
        >
          <div className="fb-hint" onClick={(e) => e.stopPropagation()}>
            <b>{busy ? "Et øjeblik…" : "Tryk på det sted, det handler om"}</b>
            <span>Eller:</span>
            <button type="button" onClick={() => capture(null)}>
              Det gælder det hele / noget andet
            </button>
            <button type="button" className="fb-x" onClick={() => setStep(null)}>
              Annullér
            </button>
          </div>
        </div>
      )}

      {step === "write" && (
        <div className="fb-sheet" role="dialog" aria-label="Feedback">
          <div className="fb-card">
            <div className="fb-head">
              <b>Din feedback</b>
              <button type="button" aria-label="Luk" onClick={() => setStep(null)}>
                ×
              </button>
            </div>
            {here?.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={here.image} alt="" className="fb-pic" />
            )}
            {here?.view?.room && <div className="fb-room">Ved: {here.view.room}</div>}
            <div className="fb-kind">
              {(["forslag", "fejl"] as const).map((k) => (
                <button key={k} type="button" className={kind === k ? "on" : ""} onClick={() => setKind(k)}>
                  {k === "forslag" ? "Forslag til ændring" : "Noget virker ikke"}
                </button>
              ))}
            </div>
            <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={kind === "fejl" ? "Hvad skete der? Hvad trykkede du på?" : "Hvad skal ændres? Fx en anden tekst, et andet billede, flyt knappen…"} />
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Dit navn" />
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
                <span className={`fb-k ${n.kind}`}>{n.kind === "fejl" ? "Fejl" : "Forslag"}</span>
                {n.status === "done" && <span className="fb-k fixed">Løst</span>}
                <p>{n.text}</p>
                <small>
                  {[n.author, n.room].filter(Boolean).join(" · ")}
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
.fb-point{position:absolute;inset:0;z-index:45;cursor:crosshair;background:rgba(0,0,0,.08);box-shadow:inset 0 0 0 4px #ffcc00}
.fb-hint{position:absolute;left:50%;bottom:24px;translate:-50% 0;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px;max-width:calc(100% - 24px);padding:10px 14px;border-radius:16px;background:#fff;color:#1d1d1f;font-size:14px;box-shadow:0 10px 30px rgba(0,0,0,.3);cursor:default}
.fb-hint span{color:#6e6e73}
.fb-hint button{border:0;border-radius:999px;background:#f2f2f7;font:inherit;font-weight:600;font-size:13px;padding:7px 12px;cursor:pointer}
.fb-hint .fb-x{background:none;color:#6e6e73}
.fb-sheet{position:absolute;inset:0;z-index:46;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.4)}
.fb-card,.fb-panel{width:min(440px,100%);max-height:100%;overflow-y:auto;border-radius:20px;background:#fff;color:#1d1d1f;padding:16px;box-shadow:0 20px 60px rgba(0,0,0,.4);display:flex;flex-direction:column;gap:10px}
.fb-head{display:flex;align-items:center;justify-content:space-between}
.fb-head b{font-size:17px}
.fb-head button{width:30px;height:30px;border:0;border-radius:50%;background:#f2f2f7;font-size:18px;cursor:pointer}
.fb-pic{width:100%;border-radius:12px}
.fb-room{font-size:12px;color:#6e6e73}
.fb-kind{display:flex;gap:6px}
.fb-kind button{flex:1;border:0;border-radius:12px;background:#f2f2f7;font:inherit;font-size:13px;font-weight:600;padding:9px;cursor:pointer}
.fb-kind button.on{background:#1d1d1f;color:#fff}
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
.fb-k.fejl{background:#ffe5e3;color:#c4271d}
.fb-k.fixed{background:#e3f5e8;color:#248a3d}
.fb-empty{font-size:14px;color:#6e6e73}
.fb-toast{position:absolute;left:50%;bottom:24px;translate:-50% 0;z-index:47;padding:10px 16px;border-radius:999px;background:#1d1d1f;color:#fff;font-weight:600;font-size:14px}
@media (max-width:760px){
  .fb-bar{top:auto;bottom:calc(84px + env(safe-area-inset-bottom,0px))}
  .fb-panel{top:auto;bottom:130px;max-height:60%}
}
`;
