"use client";

import { useState } from "react";

/* Over a proposal in Arpo: back, open the customer's link, copy the link - or the mail with the link in it. */
export function ProposalBar({ token, customer, mail }: { token: string; customer: string; mail: { subject: string; body: string } }) {
  const [note, setNote] = useState<string | null>(null);
  const link = () => `${window.location.origin}/oplaeg/${token}`;
  const copy = (text: string, done: string) =>
    navigator.clipboard.writeText(text).then(
      () => setNote(done),
      () => setNote("Kunne ikke kopiere."),
    );
  return (
    <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white/95 px-4 py-2.5 backdrop-blur">
      <a href="/arpo/generator" className="rounded-lg px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-100">
        ← Generator
      </a>
      <b className="min-w-0 flex-1 truncate text-sm text-slate-900">Oplæg til {customer}</b>
      {note && <span className="text-[13px] text-emerald-700">{note}</span>}
      <button type="button" onClick={() => copy(link(), "Linket er kopieret.")} className="rounded-lg border border-slate-300 px-3 py-1.5 text-[13px] font-medium text-slate-700 hover:border-slate-400">
        Kopiér link til kunden
      </button>
      <button type="button" onClick={() => copy(`${mail.subject}\n\n${mail.body}\n\n${link()}`, "Mailen er kopieret - med linket.")} className="rounded-lg border border-slate-300 px-3 py-1.5 text-[13px] font-medium text-slate-700 hover:border-slate-400">
        Kopiér mail
      </button>
      <a href={`/oplaeg/${token}`} target="_blank" rel="noopener" className="rounded-lg bg-slate-900 px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-slate-800">
        Se som kunden ↗
      </a>
    </div>
  );
}
