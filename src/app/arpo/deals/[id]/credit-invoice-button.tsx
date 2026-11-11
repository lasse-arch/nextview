"use client";

import { useState, useTransition } from "react";
import { creditInvoiceAction } from "@/lib/actions/invoices";
import { useToast } from "@/components/toast";

/*
 * "Kreditér" on a sent invoice (admin): all of it or an amount (excl. VAT)
 * and a reason - the credit note is made, booked and sent in Dinero
 * (creditInvoiceAction). For an invoice already sent to Betalingsservice it
 * asks once more: the money has to be paid back by hand.
 */
export function CreditInvoiceButton({ invoiceId, amount, number }: { invoiceId: string; amount: number; number: string | null }) {
  const [open, setOpen] = useState(false);
  const [whole, setWhole] = useState(true);
  const [part, setPart] = useState("");
  const [reason, setReason] = useState("");
  const [bsWarning, setBsWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const showToast = useToast();
  const kr = (n: number) => `${n.toLocaleString("da-DK")} kr.`;

  function submit(bsOk = false) {
    setError(null);
    const value = whole ? null : Number(part.replace(/\./g, "").replace(",", "."));
    if (!whole && !(value && value > 0)) return setError("Skriv beløbet, der skal krediteres.");
    start(async () => {
      const r = await creditInvoiceAction(invoiceId, { amount: value, reason, bsOk });
      if (!r.ok) {
        if (r.needsBsOk) setBsWarning(r.error);
        else setError(r.error);
        return;
      }
      setOpen(false);
      setBsWarning(null);
      showToast(r.sendError ? r.sendError : `Kreditnota${r.number ? ` nr. ${r.number}` : ""} er lavet og sendt til kunden.`);
    });
  }

  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="shrink-0 whitespace-nowrap rounded-md border border-slate-300 px-2 py-0.5 text-[11px] font-medium text-slate-500 hover:bg-slate-50">
        Kreditér
      </button>
    );
  return (
    <div className="mt-1 w-full space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[13px]">
      <p className="font-semibold text-slate-800">Kreditér faktura{number ? ` nr. ${number}` : ""}</p>
      <label className="flex items-center gap-2">
        <input type="radio" checked={whole} onChange={() => setWhole(true)} />
        Hele fakturaen ({kr(amount)} ekskl. moms)
      </label>
      <label className="flex flex-wrap items-center gap-2">
        <input type="radio" checked={!whole} onChange={() => setWhole(false)} />
        Et beløb:
        <input value={part} onChange={(e) => (setPart(e.target.value), setWhole(false))} inputMode="decimal" placeholder="fx 1.250" className="w-28 rounded-md border border-slate-300 bg-white px-2 py-1" />
        kr. ekskl. moms
      </label>
      <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Årsag - står på kreditnotaen, fx Forkert pris i 1. kvartal" className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5" />
      <p className="text-[12px] text-slate-500">Kreditnotaen laves, bogføres og sendes til kunden i Dinero med Dineros standardmail (som e-kreditnota til EAN-kunder). Det kan ikke fortrydes herfra.</p>
      {bsWarning && (
        <div className="space-y-2 rounded-md bg-amber-50 p-2 text-amber-800">
          <p>{bsWarning}</p>
          <button type="button" disabled={pending} onClick={() => submit(true)} className="rounded-md bg-amber-600 px-3 py-1 font-semibold text-white disabled:opacity-50">
            Kreditér alligevel - jeg betaler tilbage manuelt
          </button>
        </div>
      )}
      {error && <p className="text-red-600">{error}</p>}
      {!bsWarning && (
        <div className="flex gap-2">
          <button type="button" disabled={pending || !reason.trim()} onClick={() => submit()} className="rounded-md bg-slate-900 px-3 py-1.5 font-semibold text-white disabled:opacity-50">
            {pending ? "Krediterer …" : "Lav kreditnota"}
          </button>
          <button type="button" disabled={pending} onClick={() => (setOpen(false), setError(null))} className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-600">
            Fortryd
          </button>
        </div>
      )}
    </div>
  );
}
