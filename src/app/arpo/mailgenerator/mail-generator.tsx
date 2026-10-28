"use client";

import { useMemo, useState, useTransition } from "react";
import { INDUSTRIES } from "@/lib/industries";
import { MAIL_KINDS, type MailKind, type SalesMailInput } from "@/lib/sales-mail";
import { copiedSalesMail, draftSalesMail, sendSalesMail } from "@/lib/actions/sales-mail";

type Deal = { id: string; name: string; contact: string; email: string; industry: string };
type Tour = { key: string; name: string; url: string; industry: string };

const input = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none";
const label = "block text-[11px] font-semibold uppercase tracking-wide text-slate-500";
const toNum = (v: string) => (v.trim() === "" ? null : Number(v.replace(/\./g, "").replace(",", ".")));

/** Quick ways to make a draft over. */
const REDO = ["Kortere", "Mere personlig", "Lidt mere formel", "Mere om touren"];

export function MailGenerator({ deals, tours, signature, learned }: { deals: Deal[]; tours: Tour[]; signature: string[]; learned: number }) {
  const [kind, setKind] = useState<MailKind>("efter-moede");
  const [dealQuery, setDealQuery] = useState("");
  const [deal, setDeal] = useState<Deal | null>(null);
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [industry, setIndustry] = useState("");
  const [to, setTo] = useState("");
  const [notes, setNotes] = useState("");
  const [colleagues, setColleagues] = useState("");
  const [withPrice, setWithPrice] = useState(false);
  const [price, setPrice] = useState({ establishment: "", monthly: "", locations: "", bindingMonths: "", conditions: "" });
  const [delivery, setDelivery] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [tourQuery, setTourQuery] = useState("");

  const [draft, setDraft] = useState<{ id: string; subject: string; body: string } | null>(null);
  const [redo, setRedo] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();
  const [sending, startSend] = useTransition();

  function pickDeal(value: string) {
    setDealQuery(value);
    const d = deals.find((x) => x.name === value) ?? null;
    setDeal(d);
    if (d) {
      if (d.contact) setName(d.contact);
      setCompany(d.name);
      setIndustry(d.industry === "Andet" ? "" : d.industry);
      setTo(d.email);
    }
  }

  // The tours for the industry first, then the rest; the search looks at the names.
  const shown = useMemo(() => {
    const q = tourQuery.trim().toLowerCase();
    const list = q ? tours.filter((t) => t.name.toLowerCase().includes(q)) : tours;
    return [...list].sort((a, b) => Number(b.industry === industry) - Number(a.industry === industry) || a.name.localeCompare(b.name, "da")).slice(0, q ? 30 : 12);
  }, [tours, tourQuery, industry]);

  const data = (): SalesMailInput => ({
    kind,
    dealId: deal?.id ?? null,
    name,
    company,
    industry,
    notes,
    colleagues,
    delivery,
    price: withPrice
      ? { establishment: toNum(price.establishment), monthly: toNum(price.monthly), locations: toNum(price.locations), bindingMonths: toNum(price.bindingMonths), conditions: price.conditions }
      : null,
    tours: picked.map((k) => tours.find((t) => t.key === k)!).filter(Boolean).map((t) => ({ name: t.name, url: t.url })),
  });

  function write(ask?: string) {
    setMsg(null);
    start(async () => {
      const r = await draftSalesMail(data(), ask && draft ? { subject: draft.subject, body: draft.body, ask } : undefined).catch(() => ({ ok: false as const, error: "Der skete en fejl - prøv igen." }));
      if (r.ok) {
        setDraft({ id: r.id, subject: r.subject, body: r.body });
        setRedo("");
      } else setMsg({ ok: false, text: r.error });
    });
  }

  const recipient = deal ? deal.email : to;

  function send() {
    if (!draft) return;
    if (!confirm(`Send mailen til ${recipient} fra din Gmail?`)) return;
    setMsg(null);
    startSend(async () => {
      const r = await sendSalesMail(draft.id, to, draft.subject, draft.body).catch(() => ({ ok: false as const, error: "Der skete en fejl - prøv igen." }));
      setMsg(r.ok ? { ok: true, text: `Sendt til ${recipient}.${deal ? " Den ligger på dealen." : ""}` } : { ok: false, text: r.error });
    });
  }

  async function copy() {
    if (!draft) return;
    await navigator.clipboard.writeText(`${draft.body}\n\n${signature.join("\n")}`);
    setMsg({ ok: true, text: "Kopieret - sæt den ind i din mail." });
    copiedSalesMail(draft.id, draft.subject, draft.body).catch(() => {});
  }

  const priceField = (key: keyof typeof price, title: string, placeholder: string) => (
    <div>
      <span className={label}>{title}</span>
      <input inputMode="numeric" className={`${input} mt-1`} placeholder={placeholder} value={price[key]} onChange={(e) => setPrice({ ...price, [key]: e.target.value })} />
    </div>
  );

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Mailgenerator</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-500">
        Skriv et par linjer, så laver nextviewAI et forslag i den måde, vi skriver på. Pris og tours sættes ind præcis som du skriver dem. Den lærer af de mails, I sender herfra
        {learned ? ` (${learned} indtil nu)` : ""}.
      </p>

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(MAIL_KINDS) as MailKind[]).map((k) => (
              <button key={k} type="button" onClick={() => setKind(k)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${kind === k ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
                {MAIL_KINDS[k]}
              </button>
            ))}
          </div>

          <div>
            <span className={label}>Deal (valgfri)</span>
            <input list="mg-deals" className={`${input} mt-1`} placeholder="Søg en deal - eller lad den være tom" value={dealQuery} onChange={(e) => pickDeal(e.target.value)} />
            <datalist id="mg-deals">
              {deals.map((d) => (
                <option key={d.id} value={d.name} />
              ))}
            </datalist>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <span className={label}>Til (navn)</span>
              <input className={`${input} mt-1`} placeholder="Lene Hansen" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <span className={label}>Firma</span>
              <input className={`${input} mt-1`} placeholder="Aalborg Handelsskole" value={company} onChange={(e) => setCompany(e.target.value)} />
            </div>
            <div>
              <span className={label}>Branche</span>
              <select className={`${input} mt-1`} value={industry} onChange={(e) => setIndustry(e.target.value)}>
                <option value="">Vælg …</option>
                {INDUSTRIES.map((i) => (
                  <option key={i}>{i}</option>
                ))}
              </select>
            </div>
            {!deal && (
              <div>
                <span className={label}>E-mail (hvis du vil sende herfra)</span>
                <input type="email" className={`${input} mt-1`} placeholder="lene@firma.dk" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            )}
          </div>

          <div>
            <span className={label}>Hvad skal mailen sige?</span>
            <textarea
              rows={6}
              className={`${input} mt-1`}
              placeholder="Fx: godt møde, de ser potentialet. Talte om tryghed for nye elever og find vej, så de kender skolen før første dag. Lasse og jeg har selv gået der."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <span className={label}>Med fra os (valgfri)</span>
              <input className={`${input} mt-1`} placeholder="Fx Lasse" value={colleagues} onChange={(e) => setColleagues(e.target.value)} />
            </div>
            <div>
              <span className={label}>Touren kan være klar (valgfri)</span>
              <input className={`${input} mt-1`} placeholder="Fx 1. december" value={delivery} onChange={(e) => setDelivery(e.target.value)} />
            </div>
          </div>

          <div className="rounded-lg bg-slate-50 p-3">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
              <input type="checkbox" checked={withPrice} onChange={(e) => setWithPrice(e.target.checked)} />
              Pris med i mailen
            </label>
            {withPrice && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {priceField("establishment", "Etablering, kr. eks. moms", "40000")}
                {priceField("monthly", "Månedlig pris, kr. eks. moms", "2000")}
                {priceField("locations", "Antal afdelinger (valgfri)", "3")}
                {priceField("bindingMonths", "Binding, måneder (valgfri)", "12")}
                <div className="sm:col-span-2">
                  <span className={label}>Betingelser (valgfri)</span>
                  <input className={`${input} mt-1`} placeholder="Prisen forudsætter, at vi må bruge jer som reference." value={price.conditions} onChange={(e) => setPrice({ ...price, conditions: e.target.value })} />
                </div>
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between gap-3">
              <span className={label}>Tours at vise (valgfri, op til 3)</span>
              <input className="w-40 rounded-md border border-slate-200 px-2 py-1 text-xs" placeholder="Søg tour" value={tourQuery} onChange={(e) => setTourQuery(e.target.value)} />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {shown.map((t) => {
                const on = picked.includes(t.key);
                return (
                  <button
                    key={t.key}
                    type="button"
                    aria-pressed={on}
                    disabled={!on && picked.length >= 3}
                    onClick={() => setPicked(on ? picked.filter((k) => k !== t.key) : [...picked, t.key])}
                    title={t.industry}
                    className={`rounded-full px-3 py-1 text-xs ${on ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"} disabled:opacity-40`}
                  >
                    {t.name}
                  </button>
                );
              })}
              {shown.length === 0 && <span className="text-xs text-slate-400">Ingen tours fundet.</span>}
            </div>
          </div>

          <button type="button" disabled={busy} onClick={() => write()} className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
            {busy && !draft ? "Skriver …" : draft ? "Skriv et nyt forslag" : "Skriv mail"}
          </button>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          {!draft ? (
            <div className="flex h-full min-h-60 items-center justify-center text-center text-sm text-slate-400">{busy ? "nextviewAI skriver …" : "Forslaget kommer her - og du kan rette i det, før du sender."}</div>
          ) : (
            <div className="space-y-3">
              <div>
                <span className={label}>Emne</span>
                <input className={`${input} mt-1 font-medium`} value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
              </div>
              <div>
                <span className={label}>Mail</span>
                <textarea rows={18} className={`${input} mt-1 leading-relaxed`} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
                <p className="mt-1 whitespace-pre-line text-xs text-slate-400">{signature.join("\n")}</p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {REDO.map((r) => (
                  <button key={r} type="button" disabled={busy} onClick={() => write(r)} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700 hover:bg-slate-200 disabled:opacity-50">
                    {r}
                  </button>
                ))}
                <input className="min-w-40 flex-1 rounded-md border border-slate-200 px-2 py-1 text-xs" placeholder="Eller skriv selv, fx 'nævn at vi kan filme i weekenden'" value={redo} onChange={(e) => setRedo(e.target.value)} onKeyDown={(e) => e.key === "Enter" && redo.trim() && write(redo)} />
                <button type="button" disabled={busy || !redo.trim()} onClick={() => write(redo)} className="rounded-md bg-slate-200 px-2.5 py-1 text-xs font-medium disabled:opacity-50">
                  {busy ? "…" : "Lav om"}
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                <button type="button" disabled={sending || !recipient} onClick={send} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40">
                  {sending ? "Sender …" : recipient ? `Send til ${recipient}` : deal ? "Dealen har ingen e-mail" : "Skriv en e-mail for at sende"}
                </button>
                <button type="button" onClick={copy} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  Kopiér
                </button>
              </div>
            </div>
          )}
          {msg && <p className={`mt-3 text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</p>}
        </section>
      </div>
    </div>
  );
}
