"use client";

import { useState } from "react";

/**
 * Asks why a deal is lost before marking it Tabt - the reason is saved as a
 * note on the deal ("Tabt: ..."), so it's there for whoever picks it up later.
 * Shared by the ringeliste, the deals board and the deal page.
 */
export function LostReasonDialog({
  dealName,
  pending = false,
  onCancel,
  onConfirm,
}: {
  dealName: string;
  pending?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const trimmed = reason.trim();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-sm rounded-lg bg-white p-4 shadow-xl">
        <h3 className="text-sm font-semibold text-slate-900">Markér {dealName} som tabt</h3>
        <p className="mt-1 text-xs text-slate-500">Skriv hvorfor - det gemmes som en note på dealen.</p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && trimmed) onConfirm(trimmed);
            if (e.key === "Escape") onCancel();
          }}
          autoFocus
          rows={4}
          placeholder="Fx: Har ikke budget i år, ring igen efter sommer"
          className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            Annullér
          </button>
          <button
            type="button"
            onClick={() => onConfirm(trimmed)}
            disabled={!trimmed || pending}
            className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {pending ? "Gemmer…" : "Markér som tabt"}
          </button>
        </div>
      </div>
    </div>
  );
}
