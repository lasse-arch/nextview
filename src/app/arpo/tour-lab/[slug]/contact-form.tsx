"use client";

import { useState } from "react";
import { useT } from "../tours/i18n-react";
import { apiUrl } from "../tours/api";
import type { TourConfig } from "../tours/types";

/** The link that opens the tour's contact form - in the menu, on a button, anywhere a link goes. */
export const CONTACT_HREF = "#kontakt";

/**
 * "Skriv til os": the customer's contact form inside the tour - name, e-mail,
 * phone and message, sent to the customer (/api/tour-contact) without leaving
 * the tour. In the editor's preview nothing is sent.
 */
export function ContactForm({
  T,
  preview,
  onClose,
  onSent,
}: {
  T: TourConfig;
  /** The editor's preview: the form can be tried, but nothing is sent. */
  preview: boolean;
  onClose: () => void;
  onSent: () => void;
}) {
  const tr = useT();
  const F = T.contactForm!;
  const [v, setV] = useState({ name: "", email: "", phone: "", message: "", website: "" });
  const [state, setState] = useState<"edit" | "sending" | "sent">("edit");
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((x) => ({ ...x, [k]: e.target.value }));

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!v.name.trim() || !v.email.trim() || !v.message.trim()) return setError(tr("Udfyld navn, e-mail og besked."));
    if (preview) {
      setState("sent");
      return;
    }
    setState("sending");
    try {
      // Plain text, so the browser sends it straight (no extra check first) - also from the tour's own address.
      const res = await fetch(apiUrl("/api/tour-contact"), { method: "POST", headers: { "content-type": "text/plain" }, body: JSON.stringify({ tour: T.slug, ...v }) });
      const r = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !r.ok) throw new Error(r.error || tr("Beskeden kunne ikke sendes - prøv igen."));
      setState("sent");
      onSent();
    } catch (err) {
      setState("edit");
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="cf-bg" onClick={onClose}>
      <form className="cf" onClick={(e) => e.stopPropagation()} onSubmit={send}>
        <button type="button" className="cf-luk" aria-label={tr("Luk")} onClick={onClose}>
          ×
        </button>
        {state === "sent" ? (
          <div className="cf-tak">
            <div className="cf-ok">✓</div>
            <h3>{F.thanks || tr("Tak for din besked!")}</h3>
            <p>{preview ? "Forhåndsvisning - beskeden blev ikke sendt." : tr("Vi vender tilbage hurtigst muligt.")}</p>
            <button type="button" className="hv-btn hv-primary" onClick={onClose}>
              {tr("Tilbage til touren")}
            </button>
          </div>
        ) : (
          <>
            <h3>{F.title || tr("Skriv til os")}</h3>
            {F.lead && <p className="cf-lead">{F.lead}</p>}
            <label>
              <span>{tr("Navn")}</span>
              <input value={v.name} onChange={set("name")} autoComplete="name" maxLength={100} required />
            </label>
            <label>
              <span>{tr("E-mail")}</span>
              <input type="email" value={v.email} onChange={set("email")} autoComplete="email" maxLength={200} required />
            </label>
            {F.phone !== false && (
              <label>
                <span>{tr("Telefon")}</span>
                <input type="tel" value={v.phone} onChange={set("phone")} autoComplete="tel" maxLength={40} />
              </label>
            )}
            <label>
              <span>{tr("Besked")}</span>
              <textarea value={v.message} onChange={set("message")} rows={4} maxLength={4000} required />
            </label>
            {/* Hidden from people - a bot fills it in, and its message is dropped. */}
            <input className="cf-hp" tabIndex={-1} autoComplete="off" aria-hidden value={v.website} onChange={set("website")} name="website" />
            {error && <p className="cf-fejl">{error}</p>}
            <button type="submit" className="hv-btn hv-primary cf-send" disabled={state === "sending"}>
              {state === "sending" ? tr("Sender…") : tr("Send")}
            </button>
          </>
        )}
      </form>
    </div>
  );
}

export const CONTACT_CSS = `
.cf-bg{position:absolute;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(10,16,20,.55);backdrop-filter:blur(3px);animation:hvFade .25s both}
.cf{position:relative;width:min(440px,100%);max-height:calc(100% - 8px);overflow:auto;padding:22px 22px 20px;border-radius:20px;background:#fff;color:#1d2a30;box-shadow:0 24px 60px rgba(0,0,0,.35);font-family:var(--font-body,inherit);animation:hvUp .4s cubic-bezier(.2,.7,.2,1) both}
.cf h3{margin:0 28px 6px 0;font-family:var(--font-heading);font-size:24px;line-height:1.15;font-weight:800;color:var(--c-main)}
.cf-lead{margin:0 0 12px;font-size:14px;line-height:1.5;color:#56636a}
.cf label{display:block;margin-top:10px}
.cf label span{display:block;margin-bottom:4px;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#7a8589}
.cf input,.cf textarea{width:100%;box-sizing:border-box;border:0;border-bottom:2px solid #dfe4e6;background:#f6f8f8;border-radius:10px 10px 4px 4px;padding:10px 12px;font:inherit;font-size:16px;color:#1d2a30;outline:none;resize:vertical}
.cf input:focus,.cf textarea:focus{border-bottom-color:var(--c-accent);background:#fff}
.cf-hp{position:absolute!important;left:-9999px!important;width:1px!important;height:1px!important;opacity:0}
.cf-fejl{margin:10px 0 0;font-size:13px;color:#c4271d}
.cf-send{width:100%;justify-content:center;margin-top:16px}
.cf-luk{position:absolute;top:12px;right:12px;width:32px;height:32px;border:0;border-radius:50%;background:#eef1f2;font-size:20px;line-height:1;cursor:pointer;color:#1d2a30}
.cf-tak{text-align:center;padding:10px 4px 4px}
.cf-tak h3{margin:12px 0 6px}
.cf-tak p{margin:0 0 18px;color:#56636a;font-size:15px}
.cf-ok{width:52px;height:52px;margin:0 auto;border-radius:50%;background:var(--c-accent);color:#fff;font-size:26px;font-weight:800;display:flex;align-items:center;justify-content:center}
.hv-contact-form{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;margin-top:10px;border:0;border-radius:12px;background:var(--c-main);color:#fff;padding:11px 14px;font:inherit;font-weight:800;font-size:14px;cursor:pointer}
`;
