"use client";

import { useState, useTransition } from "react";
import { getCustomerSigningLink, resendContractMail } from "@/lib/actions/docuseal";

/**
 * When the customer can't use the button in DocuSeal's mail: copy their
 * signing link (to send by sms or a plain mail) - or have DocuSeal send the
 * mail again. The deal's seller and admins only.
 */
export function SigningLinkButtons({ dealId }: { dealId: string }) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const button = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50";
  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pending}
        className={button}
        onClick={() =>
          start(async () => {
            const r = await getCustomerSigningLink(dealId);
            if (!r.ok) return setNote({ text: r.error, error: true });
            try {
              await navigator.clipboard.writeText(r.url);
              setNote({ text: "Kundens underskriftslink er kopieret - send det på sms eller i en almindelig mail. Det er personligt: kun til kunden." });
            } catch {
              setNote({ text: r.url });
            }
          })
        }
      >
        Kopiér kundens underskriftslink
      </button>
      <button
        type="button"
        disabled={pending}
        className={button}
        onClick={() =>
          start(async () => {
            const r = await resendContractMail(dealId);
            setNote(r.ok ? { text: "DocuSeal har sendt mailen til kunden igen." } : { text: r.error, error: true });
          })
        }
      >
        Send kontraktmailen igen
      </button>
      {note && <p className={`break-all text-xs ${note.error ? "text-red-600" : "text-slate-500"}`}>{note.text}</p>}
    </div>
  );
}
