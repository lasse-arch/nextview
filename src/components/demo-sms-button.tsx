"use client";

import { useState } from "react";
import { demoSmsSetup, sendDemoSms, type DemoSmsSetup } from "@/lib/actions/demo-sms";

/*
 * "💬 Send eksempel": while talking to a new customer, send them one of our
 * showcase tours on SMS - their own link, so we see if and when they look.
 * Sent from Arpo (GatewayAPI); not set up yet, it opens on the seller's phone.
 */

const when = (iso: string) => new Date(iso).toLocaleString("da-DK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function DemoSmsButton({ dealId, className }: { dealId: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [setup, setSetup] = useState<DemoSmsSetup | null>(null);
  const [tour, setTour] = useState("");
  const [phone, setPhone] = useState("");
  const [text, setText] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);

  async function show() {
    setOpen(true);
    setNote(null);
    setConsent(false);
    try {
      const s = await demoSmsSetup(dealId);
      setSetup(s);
      setTour((t) => t || s.tours[0]?.slug || "");
      setPhone(s.phone);
      setText(s.text);
    } catch (err) {
      setNote({ text: err instanceof Error ? err.message : String(err), error: true });
    }
  }

  async function send() {
    setBusy(true);
    setNote(null);
    const r = await sendDemoSms({ dealId, tourSlug: tour, phone, text, consent }).catch((err: unknown) => ({ ok: false as const, error: err instanceof Error ? err.message : String(err) }));
    setBusy(false);
    if (!r.ok) return setNote({ text: r.error, error: true });
    if (r.sent) {
      setNote({ text: `Sendt til ${r.phone}. Du får besked, når de åbner touren.` });
    } else {
      // Not set up to send from Arpo: the seller's own phone sends it (the link is made and tracked all the same).
      window.location.href = `sms:${r.phone}${/iPhone|iPad|Mac/i.test(navigator.userAgent) ? "&" : "?"}body=${encodeURIComponent(r.text)}`;
      navigator.clipboard?.writeText(r.text).catch(() => {});
      setNote({ text: "SMS'en er åbnet på din telefon (og kopieret) - tryk send dér. Du får besked, når de åbner touren." });
    }
    setSetup(await demoSmsSetup(dealId).catch(() => setup));
  }

  return (
    <>
      <button
        type="button"
        onClick={show}
        title="Send en af vores eksempel-tours på SMS - deres eget link, så vi kan se, om de kigger"
        className={className ?? "rounded-md border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-100"}
      >
        💬 Send eksempel
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !busy && setOpen(false)}>
          <div className="w-full max-w-md space-y-3 rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Send et eksempel på SMS</h3>
                <p className="text-xs text-slate-500">Kunden får sit eget link til touren - med gennemgangen af funktionerne og din kontakt til sidst.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="text-xl leading-none text-slate-400 hover:text-slate-600" aria-label="Luk">
                ×
              </button>
            </div>
            {!setup && !note && <p className="text-sm text-slate-500">Henter …</p>}
            {setup && (
              <>
                {setup.tours.length ? (
                  <label className="block text-xs font-medium text-slate-600">
                    Tour
                    <select value={tour} onChange={(e) => setTour(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm">
                      {setup.tours.map((t) => (
                        <option key={t.slug} value={t.slug}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">Ingen tours kan sendes som eksempel endnu. Slå &quot;Kan sendes som eksempel&quot; til under Del og udgiv på en tour.</p>
                )}
                <label className="block text-xs font-medium text-slate-600">
                  Mobilnummer
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
                </label>
                <label className="block text-xs font-medium text-slate-600">
                  Tekst <span className="font-normal text-slate-400">· {"{link}"} bliver til linket</span>
                  <textarea value={text} onChange={(e) => setText(e.target.value)} rows={7} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
                </label>
                <label className="flex items-start gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4" />
                  <span>Kunden har sagt ja til at få en SMS</span>
                </label>
                <button
                  type="button"
                  disabled={busy || !consent || !tour || !phone.trim()}
                  onClick={send}
                  className="w-full rounded-lg bg-violet-600 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-40"
                >
                  {busy ? "Sender …" : setup.direct ? "Send SMS" : "Åbn SMS på min telefon"}
                </button>
                {!setup.direct && <p className="text-[11px] text-slate-400">SMS fra Arpo er ikke sat op endnu - den åbnes på din egen telefon i stedet.</p>}
                {setup.sent.length > 0 && (
                  <div className="space-y-1 border-t border-slate-100 pt-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Sendt før</p>
                    {setup.sent.map((s, i) => (
                      <p key={i} className="text-xs text-slate-600">
                        {when(s.at)} · {s.tour} · {s.by} ·{" "}
                        {s.visits ? <b className="text-emerald-700">åbnet {s.visits} gang{s.visits === 1 ? "" : "e"}{s.lastSeen ? `, sidst ${when(s.lastSeen)}` : ""}</b> : "ikke åbnet endnu"}
                      </p>
                    ))}
                  </div>
                )}
              </>
            )}
            {note && <p className={`text-sm ${note.error ? "text-rose-600" : "text-emerald-700"}`}>{note.text}</p>}
          </div>
        </div>
      )}
    </>
  );
}
