"use client";

import { useState } from "react";
import { demoSmsSetup, removeDemoSms, resendDemoSms, sendDemoSms, type DemoSmsSetup } from "@/lib/actions/demo-sms";

const when = (iso: string) => new Date(iso).toLocaleString("da-DK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function SendExample({ initial }: { initial: DemoSmsSetup }) {
  const [setup, setSetup] = useState(initial);
  const [tour, setTour] = useState(initial.tours[0]?.slug ?? "");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [text, setText] = useState(initial.text);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const first = name.trim().split(/\s+/)[0] ?? "";
  const preview = text.replaceAll("{navn}", first).replace(/^Hej \n/, "Hej\n").replaceAll("{link}", "nextview360.dk/vis/…");

  /** Sent from Arpo - or, without SureSMS set up, opened on the seller's own phone (the link is tracked all the same). */
  function done(r: { sent: boolean; text: string; phone: string }) {
    if (r.sent) return setNote({ text: `Sendt til ${r.phone}. Du får besked i klokken, når de åbner touren.` });
    navigator.clipboard?.writeText(r.text).catch(() => {});
    window.location.assign(`sms:${r.phone}${/iPhone|iPad|Mac/i.test(navigator.userAgent) ? "&" : "?"}body=${encodeURIComponent(r.text)}`);
    setNote({ text: "SMS'en er åbnet på din telefon (og kopieret) - tryk send dér. Du får besked i klokken, når de åbner touren." });
  }

  const [again, setAgain] = useState<string | null>(null);
  async function sendAgain(id: string) {
    setAgain(id);
    setNote(null);
    const r = await resendDemoSms(id).catch((err: unknown) => ({ ok: false as const, error: err instanceof Error ? err.message : String(err) }));
    setAgain(null);
    if (!r.ok) return setNote({ text: r.error, error: true });
    done(r);
  }

  async function remove(id: string, to: string) {
    if (!window.confirm(`Fjern SMS'en til ${to}? Linket holder op med at virke, og det de har set, slettes.`)) return;
    setAgain(id);
    const r = await removeDemoSms(id).catch(() => ({ ok: false }));
    setAgain(null);
    if (!r.ok) return setNote({ text: "Den kunne ikke fjernes.", error: true });
    setSetup((x) => ({ ...x, sent: x.sent.filter((y) => y.id !== id) }));
  }

  async function send() {
    setBusy(true);
    setNote(null);
    const r = await sendDemoSms({ tourSlug: tour, phone, name, text, consent }).catch((err: unknown) => ({ ok: false as const, error: err instanceof Error ? err.message : String(err) }));
    setBusy(false);
    if (!r.ok) return setNote({ text: r.error, error: true });
    done(r);
    setName("");
    setPhone("");
    setConsent(false);
    setSetup(await demoSmsSetup().catch(() => setup));
  }

  const field = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200";
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Send et eksempel på SMS</h1>
        <p className="mt-1 text-sm text-slate-500">Send en af vores tours på SMS, mens du snakker med kunden. De får deres eget link: touren åbner med en gennemgang af funktionerne og slutter med din kontakt - og du får besked, når de kigger.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {setup.tours.length ? (
            <label className="block text-xs font-medium text-slate-600">
              Tour
              <select value={tour} onChange={(e) => setTour(e.target.value)} className={field}>
                {setup.tours.map((t) => (
                  <option key={t.slug} value={t.slug}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Ingen tours kan sendes endnu. Slå &quot;Kan sendes som eksempel&quot; til under Del og udgiv på en tour.</p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs font-medium text-slate-600">
              Navn
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Fx Anna Jensen" className={field} />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Mobilnummer
              <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="12 34 56 78" className={field} />
            </label>
          </div>
          <label className="block text-xs font-medium text-slate-600">
            Tekst <span className="font-normal text-slate-400">· {"{navn}"} bliver kundens fornavn, {"{link}"} linket til touren</span>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={7} className={field} />
          </label>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 accent-violet-600" />
            <span>Kunden har sagt ja til at få en SMS</span>
          </label>
          <button type="button" disabled={busy || !consent || !tour || !phone.trim()} onClick={send} className="w-full rounded-xl bg-violet-600 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-40">
            {busy ? "Sender …" : setup.direct ? "Send SMS" : "Åbn SMS på min telefon"}
          </button>
          {!setup.direct && <p className="text-xs text-slate-400">SMS fra Arpo er ikke sat op endnu - den åbnes på din egen telefon i stedet. Linket spores på samme måde.</p>}
          {note && <p className={`text-sm ${note.error ? "text-rose-600" : "text-emerald-700"}`}>{note.text}</p>}
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Sådan ser den ud</p>
          <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-4">
            <div className="ml-auto max-w-[260px] whitespace-pre-wrap rounded-2xl rounded-br-md bg-[#34c759] px-3.5 py-2.5 text-[14px] leading-snug text-white shadow-sm">{preview}</div>
            <p className="mt-2 text-right text-[11px] text-slate-400">Fra {setup.direct ? "Nextview360" : "dit nummer"}</p>
          </div>
        </div>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Sendt</h2>
        {setup.sent.length ? (
          <ul className="mt-3 divide-y divide-slate-100">
            {setup.sent.map((s) => (
              <li key={s.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5 text-sm">
                <span className="min-w-0">
                  <b className="font-medium text-slate-900">{s.to}</b>
                  <span className="text-slate-500">
                    {" "}
                    · {s.tour} · {when(s.at)}
                    {s.by ? ` · ${s.by}` : ""}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                {s.again && (
                  <button type="button" disabled={again != null} onClick={() => sendAgain(s.id)} className="rounded-full px-2.5 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-inset ring-violet-200 hover:bg-violet-50 disabled:opacity-40">
                    {again === s.id ? "Vent …" : "Send igen"}
                  </button>
                )}
                {s.mine && (
                  <button type="button" disabled={again != null} onClick={() => remove(s.id, s.to)} className="rounded-full px-2 py-0.5 text-xs font-medium text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40" title="Fjern">
                    Fjern
                  </button>
                )}
                {s.visits ? (
                  <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/15">
                    Åbnet {s.visits} gang{s.visits === 1 ? "" : "e"} · startet {s.started} gang{s.started === 1 ? "" : "e"}
                    {s.lastSeen ? ` · sidst ${when(s.lastSeen)}` : ""}
                    {s.where ? ` · ${s.where}` : ""}
                  </span>
                ) : (
                  <span className="text-xs text-slate-400">Ikke åbnet endnu</span>
                )}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-slate-500">Ingen sendt endnu.</p>
        )}
        <p className="mt-3 text-xs text-slate-400">Hvad de så (steder, gennemgang, hvor længe), står på touren under Del og udgiv → Fremvisning til nye kunder.</p>
      </div>
    </div>
  );
}
