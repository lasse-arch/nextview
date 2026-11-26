"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { bookRefilming, cancelRefilming } from "@/lib/actions/filming";
import { useToast } from "@/components/toast";

const HOUR_OPTIONS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8];

export type RefilmingRow = { id: string; when: string; hours: string; crew: string; drone: boolean | null; brief: string | null; annual: boolean; past: boolean };

/**
 * Genoptagelse on a live customer: the ones booked, the contract's yearly refilming (used or not this contract
 * year), and booking a new one with its own brief and a calendar invitation.
 */
export function RefilmingCard({
  dealId,
  rows,
  annual,
  contactEmail,
  crewOptions,
  defaultCrewIds,
}: {
  dealId: string;
  rows: RefilmingRow[];
  annual: { included: number; used: number; left: number; period: string } | null;
  contactEmail: string | null;
  crewOptions: { id: string; name: string }[];
  defaultCrewIds: string[];
}) {
  const [open, setOpen] = useState(false);
  const [startLocal, setStartLocal] = useState("");
  const [hours, setHours] = useState(2);
  const [crew, setCrew] = useState<string[]>(defaultCrewIds);
  const [email, setEmail] = useState(contactEmail ?? "");
  const [extra, setExtra] = useState("");
  const [drone, setDrone] = useState<boolean | null>(null);
  const [brief, setBrief] = useState("");
  const [useAnnual, setUseAnnual] = useState(Boolean(annual && annual.left > 0));
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const label = "block text-[11px] font-semibold uppercase tracking-wide text-slate-500";
  const input = "mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2 text-sm";

  function submit() {
    start(async () => {
      const r = await bookRefilming(dealId, { startLocal, hours, crewUserIds: crew, contactEmail: email, extraEmails: extra, drone, brief, annual: useAnnual });
      if (!r.ok) return toast(r.error);
      toast(`Genoptagelse booket - invitation sendt til ${r.sentTo.join(", ")}.`);
      setOpen(false);
      setBrief("");
      setDrone(null);
      router.refresh();
    });
  }
  function cancel(id: string) {
    if (!confirm("Aflys genoptagelsen i Arpo? Husk at aflyse kalenderinvitationen også.")) return;
    start(async () => {
      const r = await cancelRefilming(id);
      if (!r.ok) return toast(r.error);
      router.refresh();
    });
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Genoptagelse</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {annual
              ? `Kontrakten har ${annual.included} årlig${annual.included > 1 ? "e" : ""} genoptagelse${annual.included > 1 ? "r" : ""}. Brugt ${annual.used} af ${annual.included} i kontraktåret ${annual.period}.`
              : "Kontrakten har ingen årlig genoptagelse - en genoptagelse er ekstra."}
          </p>
        </div>
        <button type="button" onClick={() => setOpen((o) => !o)} className="shrink-0 rounded-lg bg-rose-600 px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-rose-700">
          🎬 Book genoptagelse
        </button>
      </div>

      {open && (
        <div className="mt-3 grid gap-3 rounded-lg border border-rose-200 bg-rose-50/40 p-3 sm:grid-cols-2">
          <label>
            <span className={label}>Starttidspunkt</span>
            <input type="datetime-local" value={startLocal} onChange={(e) => setStartLocal(e.target.value)} className={input} />
          </label>
          <label>
            <span className={label}>Forventet varighed</span>
            <select value={hours} onChange={(e) => setHours(Number(e.target.value))} className={`${input} bg-white`}>
              {HOUR_OPTIONS.map((h) => (
                <option key={h} value={h}>
                  {String(h).replace(".", ",")} {h === 1 ? "time" : "timer"}
                </option>
              ))}
            </select>
          </label>
          <div className="sm:col-span-2">
            <span className={label}>Hvem filmer?</span>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              {crewOptions.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={crew.includes(c.id)} onChange={() => setCrew((p) => (p.includes(c.id) ? p.filter((x) => x !== c.id) : [...p, c.id]))} />
                  {c.name}
                </label>
              ))}
            </div>
          </div>
          <div>
            <span className={label}>Drone</span>
            <div className="mt-1.5 flex gap-2">
              {[
                [true, "Ja"],
                [false, "Nej"],
              ].map(([v, l]) => (
                <button key={String(v)} type="button" onClick={() => setDrone(v as boolean)} className={`rounded-lg border px-3 py-1.5 text-sm ${drone === v ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"}`}>
                  {l as string}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-end gap-2 pb-1.5 text-sm text-slate-700">
            <input type="checkbox" checked={useAnnual} disabled={!annual || annual.left === 0} onChange={(e) => setUseAnnual(e.target.checked)} />
            {annual && annual.left > 0 ? "Brug den årlige genoptagelse" : "Ingen årlig genoptagelse tilbage - den er ekstra"}
          </label>
          <label className="sm:col-span-2">
            <span className={label}>Hvad skal filmes igen - og hvad er aftalt</span>
            <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={4} maxLength={5000} className={`${input} bg-white`} placeholder="Fx det nye fitnesslokale og receptionen efter ombygningen. Dronen: hele grunden med den nye tilbygning." />
          </label>
          <label>
            <span className={label}>Kundens e-mail</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
          </label>
          <label>
            <span className={label}>Send også til</span>
            <input value={extra} onChange={(e) => setExtra(e.target.value)} className={input} placeholder="fx pedel@skole.dk" />
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <button type="button" onClick={submit} disabled={pending} className="rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50">
              {pending ? "Sender…" : "Book og send invitation"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-600">
              Annullér
            </button>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-100">
          {rows.map((r) => (
            <li key={r.id} className={`py-2.5 text-sm ${r.past ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium capitalize text-slate-900">
                  {r.when} <span className="font-normal normal-case text-slate-500">(ca. {r.hours}, {r.crew})</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.annual ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{r.annual ? "Årlig" : "Ekstra"}</span>
                  {!r.past && (
                    <button type="button" onClick={() => cancel(r.id)} className="text-xs text-slate-500 underline">
                      Aflys
                    </button>
                  )}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-600">
                Drone: {r.drone ? "ja" : "nej"}. {r.brief}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
