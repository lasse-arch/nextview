"use client";

import { useState, useTransition } from "react";
import { backupNow } from "@/lib/actions/backup";

/** Takes a backup right away - to check it works without waiting for the night. */
export function BackupNow() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="flex shrink-0 items-center gap-2">
      {msg && <span className="text-xs text-slate-500">{msg}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setMsg(null);
            const r = await backupNow();
            setMsg(r.ok ? `Taget: ${(r.size / 1024 / 1024).toLocaleString("da-DK", { maximumFractionDigits: 1 })} MB, ${r.tables} tabeller, ${r.rows.toLocaleString("da-DK")} rækker` : r.error.slice(0, 80));
          })
        }
        className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-50"
      >
        {pending ? "Tager backup…" : "Tag backup nu"}
      </button>
    </span>
  );
}
