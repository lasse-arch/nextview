"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { archiveSignedContract } from "@/lib/actions/docuseal";

export function ArchiveContractButton({ dealId }: { dealId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function close() {
    setOpen(false);
    setConfirmText("");
    setError(null);
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="block w-full rounded-md border border-red-200 px-3 py-2 text-center text-sm text-red-700 hover:bg-red-50"
      >
        Arkivér kontrakt (send ny)
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4" onClick={close}>
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-slate-900">Arkivér underskrevet kontrakt</h2>
            <p className="mt-2 text-sm text-slate-600">
              Dette arkiverer den nuværende underskrevne kontrakt, så der kan sendes en ny til kunden. Handlingen kan
              ikke fortrydes herfra. Skriv <span className="font-semibold">slet</span> for at bekræfte.
            </p>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="slet"
              className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              autoFocus
            />
            {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={close}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Annullér
              </button>
              <button
                type="button"
                disabled={pending || confirmText.trim().toLowerCase() !== "slet"}
                onClick={() => {
                  setError(null);
                  startTransition(async () => {
                    try {
                      const result = await archiveSignedContract(dealId, confirmText);
                      if (!result.ok) {
                        setError(result.error);
                        return;
                      }
                      close();
                      router.refresh();
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Der opstod en fejl.");
                    }
                  });
                }}
                className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {pending ? "Arkiverer..." : "Arkivér"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
