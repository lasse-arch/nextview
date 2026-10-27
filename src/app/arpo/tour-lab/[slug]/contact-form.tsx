"use client";

import { useRef, useState } from "react";
import { useT } from "../tours/i18n-react";
import type { TourConfig } from "../tours/types";

/** The link that opens the tour's contact form - in the menu, on a button, anywhere a link goes. */
export const CONTACT_HREF = "#kontakt";

const EMAIL = /^[^\s@<>",;?&]+@[^\s@<>",;?&]+\.[^\s@<>",;?&]+$/;

/**
 * "Skriv til os": the customer's contact form inside the tour - name, e-mail,
 * phone and message. Nothing goes through us: the finished mail opens in the
 * visitor's own mail (Gmail, Outlook, the device's mail app) or is copied, and
 * the visitor presses Send there. In the editor's preview nothing is opened.
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
  const [v, setV] = useState({ name: "", email: "", phone: "", message: "" });
  const [state, setState] = useState<"edit" | "send">("edit");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((x) => ({ ...x, [k]: e.target.value }));

  function next(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!v.name.trim() || !v.email.trim() || !v.message.trim()) return setError(tr("Udfyld navn, e-mail og besked."));
    if (!preview && !EMAIL.test(F.to)) return setError(tr("Formularen virker ikke lige nu."));
    setState("send");
  }

  // The finished mail - sent by the visitor's own mail, never through us.
  const subject = `${F.title || tr("Skriv til os")} - ${T.title || T.slug}`;
  const phone = v.phone.trim() ? [`${tr("Telefon")}: ${v.phone.trim()}`] : [];
  const body = [v.message.trim(), "", `${tr("Navn")}: ${v.name.trim()}`, `${tr("E-mail")}: ${v.email.trim()}`, ...phone, "", tr("Sendt fra den virtuelle tour")].join("\r\n");
  const q = (k: string, x: string) => `${k}=${encodeURIComponent(x)}`;
  const ways = [
    { key: "gmail", label: "Gmail", href: `https://mail.google.com/mail/?view=cm&fs=1&${q("to", F.to)}&${q("su", subject)}&${q("body", body)}` },
    { key: "outlook", label: "Outlook", href: `https://outlook.live.com/mail/0/deeplink/compose?${q("to", F.to)}&${q("subject", subject)}&${q("body", body)}` },
    { key: "app", label: tr("Mail på enheden"), href: `mailto:${F.to}?${q("subject", subject)}&${q("body", body)}` },
  ];
  // Counted once as an action (lead), however many ways they try.
  const counted = useRef(false);
  const chosen = () => {
    if (preview || counted.current) return;
    counted.current = true;
    onSent();
  };
  async function copy() {
    try {
      await navigator.clipboard.writeText(`${F.to}\n${subject}\n\n${body}`);
      setCopied(true);
      chosen();
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="cf-bg" onClick={onClose}>
      <form className="cf" onClick={(e) => e.stopPropagation()} onSubmit={next}>
        <button type="button" className="cf-luk" aria-label={tr("Luk")} onClick={onClose}>
          ×
        </button>
        {state === "send" ? (
          <div className="cf-send-med">
            <h3>{tr("Send beskeden")}</h3>
            <p className="cf-lead">{tr("Din besked er skrevet færdig. Vælg, hvordan du vil sende den - så trykker du bare Send.")}</p>
            <div className="cf-ways">
              {ways.map((w) => (
                <a
                  key={w.key}
                  href={w.href}
                  target={w.key === "app" ? undefined : "_blank"}
                  rel="noopener"
                  className="cf-way"
                  onClick={(e) => {
                    if (preview) return e.preventDefault();
                    chosen();
                  }}
                >
                  {w.label}
                  <span aria-hidden>›</span>
                </a>
              ))}
              <button type="button" className="cf-way" onClick={copy}>
                {copied ? tr("Kopieret") : tr("Kopiér beskeden")}
                <span aria-hidden>{copied ? "✓" : "›"}</span>
              </button>
            </div>
            <p className="cf-til">
              {copied ? tr("Indsæt den i en mail til") : tr("Mailen går til")} <b>{F.to}</b>
            </p>
            {preview && <p className="cf-til">Forhåndsvisning - knapperne åbner ikke noget her.</p>}
            <button type="button" className="cf-tilbage" onClick={() => setState("edit")}>
              ‹ {tr("Ret beskeden")}
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
              <textarea value={v.message} onChange={set("message")} rows={4} maxLength={2000} required />
            </label>
            {error && <p className="cf-fejl">{error}</p>}
            <button type="submit" className="hv-btn hv-primary cf-send">
              {tr("Fortsæt")}
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
.cf-fejl{margin:10px 0 0;font-size:13px;color:#c4271d}
.cf-send{width:100%;justify-content:center;margin-top:16px}
.cf-luk{position:absolute;top:12px;right:12px;width:32px;height:32px;border:0;border-radius:50%;background:#eef1f2;font-size:20px;line-height:1;cursor:pointer;color:#1d2a30}
.cf-ways{display:flex;flex-direction:column;gap:8px;margin-top:6px}
.cf-way{display:flex;align-items:center;justify-content:space-between;width:100%;box-sizing:border-box;padding:13px 16px;border:1px solid #e3e7e8;border-radius:12px;background:#fff;color:var(--c-main);font:inherit;font-size:15px;font-weight:700;text-decoration:none;cursor:pointer;transition:border-color .15s,background .15s}
.cf-way:hover{border-color:var(--c-accent);background:#f8faf9}
.cf-way span{font-size:20px;line-height:1;color:#9aa5a9}
.cf-til{margin:12px 0 0;font-size:13px;color:#56636a;overflow-wrap:anywhere}
.cf-tilbage{margin-top:14px;padding:0;border:0;background:none;font:inherit;font-size:13px;font-weight:700;color:#7a8589;cursor:pointer}
.hv-contact-form{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;margin-top:10px;border:0;border-radius:12px;background:var(--c-main);color:#fff;padding:11px 14px;font:inherit;font-weight:800;font-size:14px;cursor:pointer}
`;
