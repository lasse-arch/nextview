"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { INDUSTRIES } from "@/lib/industries";
import { MAIL_KINDS, type MailKind, type SalesMailInput } from "@/lib/sales-mail";
import { copiedSalesMail, draftSalesMail, sendSalesMail } from "@/lib/actions/sales-mail";
import { demoLinksForMail } from "@/lib/actions/demo-sms";

type Deal = { id: string; name: string; contact: string; email: string; industry: string };
/** `slug`: one of our own tours in Arpo - it can go out as a showcase link (walk-through + we see who looks). */
/** `demoOnly`: one of ours not out on the net yet (in review) - it can only go out as a showcase link. */
type Tour = { key: string; name: string; url: string; industry: string; slug?: string; demoOnly?: boolean; review?: boolean };

const input = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none";
const label = "block text-[11px] font-semibold uppercase tracking-wide text-slate-500";
const toNum = (v: string) => (v.trim() === "" ? null : Number(v.replace(/\./g, "").replace(",", ".")));

/** Quick ways to make a draft over. */
const REDO = ["Kortere", "Mere personlig", "Lidt mere formel", "Mere om touren"];

/** For an admin: whom the mail can be from (themselves first) - written, signed and sent in that person's name. */
export type MailSender = { id: string; name: string; signature: string[]; gmail: boolean };

/*
 * What's being written is kept in this browser (a week at most), so a reload
 * or a closed tab doesn't lose it - the fields and the suggestion. Only here,
 * on the seller's own computer; cleared when the mail is sent or started over.
 */
const KEEP = "mailgenerator:v1";
type Kept = {
  at: number;
  as?: string;
  kind?: MailKind;
  dealQuery?: string;
  name?: string;
  company?: string;
  industry?: string;
  to?: string;
  notes?: string;
  colleagues?: string;
  withPrice?: boolean;
  price?: { establishment: string; monthly: string; locations: string; bindingMonths: string; conditions: string };
  delivery?: string;
  picked?: string[];
  asDemo?: boolean;
  demoUrls?: Record<string, string>;
  draft?: { id: string; subject: string; body: string } | null;
};
function readKept(): Kept | null {
  try {
    const k = JSON.parse(localStorage.getItem(KEEP) ?? "null") as Kept | null;
    return k && Date.now() - k.at < 7 * 86_400_000 ? k : null;
  } catch {
    return null;
  }
}

export function MailGenerator({ deals, tours, signature: mine, learned, senders }: { deals: Deal[]; tours: Tour[]; signature: string[]; learned: number; senders?: MailSender[] }) {
  // Read once, as the page opens (this component is only drawn in the browser - see MailGeneratorClient).
  const [kept] = useState(readKept);
  const [as, setAs] = useState(kept?.as && senders?.some((x) => x.id === kept.as) ? kept.as : (senders?.[0]?.id ?? ""));
  const sender = senders?.find((x) => x.id === as);
  const signature = sender?.signature ?? mine;
  const other = Boolean(senders?.length && as && as !== senders[0].id);
  const [kind, setKind] = useState<MailKind>(kept?.kind ?? "efter-moede");
  const [dealQuery, setDealQuery] = useState(kept?.dealQuery ?? "");
  const [deal, setDeal] = useState<Deal | null>(() => deals.find((x) => x.name === kept?.dealQuery) ?? null);
  const [name, setName] = useState(kept?.name ?? "");
  const [company, setCompany] = useState(kept?.company ?? "");
  const [industry, setIndustry] = useState(kept?.industry ?? "");
  const [to, setTo] = useState(kept?.to ?? "");
  const [notes, setNotes] = useState(kept?.notes ?? "");
  const [colleagues, setColleagues] = useState(kept?.colleagues ?? "");
  const [withPrice, setWithPrice] = useState(kept?.withPrice ?? false);
  const [price, setPrice] = useState(kept?.price ?? { establishment: "", monthly: "", locations: "", bindingMonths: "", conditions: "" });
  const [delivery, setDelivery] = useState(kept?.delivery ?? "");
  const [picked, setPicked] = useState<string[]>(() => (kept?.picked ?? []).filter((k) => tours.some((t) => t.key === k)));
  const [tourQuery, setTourQuery] = useState("");
  /** Our own tours go out as showcase links: the recipient's own, with the walk-through - and the seller hears when they look. */
  const [asDemo, setAsDemo] = useState(kept?.asDemo ?? true);
  /** The showcase links made for this mail (tour + recipient), so a new suggestion doesn't make new ones. */
  const [demoUrls, setDemoUrls] = useState<Record<string, string>>(kept?.demoUrls ?? {});

  const [draft, setDraft] = useState<{ id: string; subject: string; body: string } | null>(kept?.draft ?? null);
  // Kept as it's written (a moment after the last key), so a reload brings it back.
  const [cleared, setCleared] = useState(false);
  useEffect(() => {
    if (cleared) return;
    const t = window.setTimeout(() => {
      const empty = !notes.trim() && !draft && !name.trim() && !to.trim() && !company.trim();
      try {
        if (empty) localStorage.removeItem(KEEP);
        else localStorage.setItem(KEEP, JSON.stringify({ at: Date.now(), as, kind, dealQuery, name, company, industry, to, notes, colleagues, withPrice, price, delivery, picked, asDemo, demoUrls, draft } satisfies Kept));
      } catch {}
    }, 400);
    return () => window.clearTimeout(t);
  }, [cleared, as, kind, dealQuery, name, company, industry, to, notes, colleagues, withPrice, price, delivery, picked, asDemo, demoUrls, draft]);
  /** "Start forfra": everything empty, and nothing kept. */
  function startOver() {
    try {
      localStorage.removeItem(KEEP);
    } catch {}
    setKind("efter-moede");
    setDealQuery("");
    setDeal(null);
    setName("");
    setCompany("");
    setIndustry("");
    setTo("");
    setNotes("");
    setColleagues("");
    setWithPrice(false);
    setPrice({ establishment: "", monthly: "", locations: "", bindingMonths: "", conditions: "" });
    setDelivery("");
    setPicked([]);
    setDemoUrls({});
    setDraft(null);
    setMsg(null);
    setCleared(false);
  }
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
    // The ones in review first (just made - often the one to show), then the industry's, then the rest.
    return [...list].sort((a, b) => Number(Boolean(b.review)) - Number(Boolean(a.review)) || Number(b.industry === industry) - Number(a.industry === industry) || a.name.localeCompare(b.name, "da")).slice(0, q ? 30 : 12);
  }, [tours, tourQuery, industry]);

  const data = (links: Record<string, string> = {}): SalesMailInput => ({
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
    // A tour not out yet goes only as a showcase link - without one it's left out.
    tours: picked.map((k) => tours.find((t) => t.key === k)!).filter(Boolean).map((t) => ({ name: t.name.replace(/ · (i gennemgang|ikke udgivet)$/, ""), url: (t.slug && links[t.slug]) || t.url })).filter((t) => t.url),
  });

  /** The showcase links for the picked tours of ours (made once per recipient and tour). */
  async function links(): Promise<Record<string, string>> {
    if (!asDemo) return {};
    const who = company.trim() || name.trim() || to.trim();
    const slugs = picked.map((k) => tours.find((t) => t.key === k)?.slug).filter((x): x is string => Boolean(x));
    const missing = slugs.filter((sl) => !demoUrls[`${who}|${sl}|${as}`]);
    const made = missing.length ? await demoLinksForMail(missing, who, other ? as : undefined) : {};
    const next = { ...demoUrls };
    for (const [sl, url] of Object.entries(made)) next[`${who}|${sl}|${as}`] = url;
    if (missing.length) setDemoUrls(next);
    return Object.fromEntries(slugs.filter((sl) => next[`${who}|${sl}|${as}`]).map((sl) => [sl, next[`${who}|${sl}|${as}`]]));
  }

  function write(ask?: string) {
    setMsg(null);
    start(async () => {
      const l = await links().catch(() => ({}));
      const r = await draftSalesMail(data(l), ask && draft ? { subject: draft.subject, body: draft.body, ask } : undefined, other ? as : undefined).catch(() => ({ ok: false as const, error: "Der skete en fejl - prøv igen." }));
      if (r.ok) {
        setDraft({ id: r.id, subject: r.subject, body: r.body });
        setRedo("");
      } else setMsg({ ok: false, text: r.error });
    });
  }

  // The first address is who it's to, the rest go on CC.
  const typedAll = to.split(/[\s,;]+/).map((a) => a.trim()).filter(Boolean);
  const recipient = typedAll[0] ?? "";
  const ccList = typedAll.slice(1);

  function send() {
    if (!draft) return;
    if (!confirm(other ? `Send mailen til ${recipient} fra ${sender?.name}s Gmail, i ${sender?.name}s navn?` : `Send mailen til ${recipient} fra din Gmail?`)) return;
    setMsg(null);
    startSend(async () => {
      const r = await sendSalesMail(draft.id, to, draft.subject, draft.body, other ? as : undefined).catch(() => ({ ok: false as const, error: "Der skete en fejl - prøv igen." }));
      setMsg(r.ok ? { ok: true, text: `Sendt til ${recipient}.${deal ? " Den ligger på dealen." : ""}` } : { ok: false, text: r.error });
      // Sent: not kept any longer (a reload starts empty).
      if (r.ok) {
        setCleared(true);
        try {
          localStorage.removeItem(KEEP);
        } catch {}
      }
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
          {senders && senders.length > 1 && (
            <div>
              <span className={label}>Afsender</span>
              <select
                className={`${input} mt-1`}
                value={as}
                onChange={(e) => {
                  setAs(e.target.value);
                  // A suggestion written in one name isn't sent in another's.
                  setDraft(null);
                }}
              >
                {senders.map((x, i) => (
                  <option key={x.id} value={x.id}>
                    {i === 0 ? `${x.name} (dig)` : `${x.name}${x.gmail ? "" : " - har ikke forbundet Gmail"}`}
                  </option>
                ))}
              </select>
              {other && (
                <p className={`mt-1 text-xs ${sender?.gmail ? "text-slate-500" : "text-amber-700"}`}>
                  {sender?.gmail
                    ? `Skrives og sendes i ${sender.name}s navn, fra ${sender.name}s egen Gmail. Den ligger i ${sender.name}s Sendt, svaret kommer til ${sender.name}, og ${sender.name} får besked i Arpo.`
                    : `${sender?.name} har ikke forbundet sin Gmail i Arpo - du kan skrive og kopiere mailen, men ikke sende den herfra.`}
                </p>
              )}
            </div>
          )}
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
            <div>
              <span className={label}>{deal ? "E-mail" : "E-mail (hvis du vil sende herfra)"}</span>
              <input type="text" inputMode="email" className={`${input} mt-1`} placeholder="lene@firma.dk, kollega@firma.dk" value={to} onChange={(e) => setTo(e.target.value)} />
              {ccList.length > 0 && <p className="mt-1 text-[11px] text-slate-500">Til {recipient} - CC: {ccList.join(", ")}</p>}
              {deal && !deal.email && <p className="mt-1 text-[11px] text-slate-500">Dealen har ingen e-mail - den du skriver, gemmes på dealen, når mailen er sendt.</p>}
            </div>
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
                    disabled={!on && (picked.length >= 3 || Boolean(t.demoOnly && !asDemo))}
                    onClick={() => setPicked(on ? picked.filter((k) => k !== t.key) : [...picked, t.key])}
                    title={t.demoOnly && !asDemo ? "Ikke ude endnu - kan kun sendes som fremvisningslink" : t.industry}
                    className={`rounded-full px-3 py-1 text-xs ${on ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"} disabled:opacity-40`}
                  >
                    {t.name}
                  </button>
                );
              })}
              {shown.length === 0 && <span className="text-xs text-slate-400">Ingen tours fundet.</span>}
            </div>
            <label className="mt-2 flex items-start gap-2 text-xs text-slate-600">
              <input type="checkbox" checked={asDemo} onChange={(e) => setAsDemo(e.target.checked)} className="mt-0.5 h-3.5 w-3.5" />
              <span>
                Send som fremvisningslink: modtageren får sit eget link med gennemgangen af funktionerne og din kontakt til sidst - og du får besked, når de kigger. <span className="text-slate-400">(Vores egne tours i Arpo.)</span>
              </span>
            </label>
          </div>

          <button type="button" disabled={busy} onClick={() => write()} className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
            {busy && !draft ? "Skriver …" : draft ? "Skriv et nyt forslag" : "Skriv mail"}
          </button>
          {(notes.trim() || draft || name.trim() || to.trim()) && (
            <button type="button" onClick={() => confirm("Start forfra? Det, du har skrevet, fjernes.") && startOver()} className="w-full text-center text-xs text-slate-500 hover:text-slate-800 hover:underline">
              Start forfra med en ny mail
            </button>
          )}
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
                  {sending ? "Sender …" : recipient ? `Send til ${recipient}${ccList.length ? ` (+${ccList.length} CC)` : ""}` : "Skriv en e-mail for at sende"}
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
