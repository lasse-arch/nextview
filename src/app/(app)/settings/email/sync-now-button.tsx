"use client";

import { useState, useTransition } from "react";
import { syncInboundEmailsNow } from "@/lib/actions/email";

export function SyncNowButton() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setMessage(null);
          startTransition(async () => {
            try {
              const result = await syncInboundEmailsNow();
              const errorNote = result.errors.length > 0 ? ` Fejl: ${result.errors.join("; ")}` : "";
              setMessage(
                `Tjekkede ${result.accountsChecked} Gmail-konto(er) — ${result.matched} mails matchede en deal, ${result.created} nye gemt.${errorNote}`
              );
            } catch (err) {
              setMessage(err instanceof Error ? err.message : "Der opstod en fejl.");
            }
          });
        }}
        className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {pending ? "Synkroniserer…" : "Synkronisér nu"}
      </button>
      {message && <p className="mt-2 text-sm text-slate-600">{message}</p>}
    </div>
  );
}
