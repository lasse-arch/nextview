"use client";

import { useState, useTransition } from "react";
import { archiveSignedContractToDriveManual } from "@/lib/actions/google-drive-archive";

export function ArchiveToDriveButton({ dealId }: { dealId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          setDone(false);
          startTransition(async () => {
            const result = await archiveSignedContractToDriveManual(dealId);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setDone(true);
          });
        }}
        className="block w-full rounded-md border border-slate-300 px-3 py-2 text-center text-sm hover:bg-slate-50 disabled:opacity-60"
      >
        {pending ? "Sender til Google Drev..." : "Arkivér i Google Drev"}
      </button>
      {done && <p className="mt-1.5 text-xs text-emerald-600">Sendt til Google Drev.</p>}
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}
