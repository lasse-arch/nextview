"use client";

import { useState } from "react";
import { moveBatch, moveCompare, moveFinish, movePrepare } from "@/lib/actions/db-move";
import type { TableState } from "@/lib/db-move";

/** Runs the move step by step - one batch per request - and shows each table's row count in the old and new database. */
export function MoveDatabase({ host }: { host: string }) {
  const [tables, setTables] = useState<TableState[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const unwrap = <T,>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
        if (!r.ok) throw new Error(r.error);
        return r.value;
      };
      setStatus("Tjekker begge databaser…");
      const list = unwrap(await moveCompare());
      setTables(list);
      setStatus("Gør den nye database klar…");
      unwrap(await movePrepare());
      for (const t of list) {
        let offset = 0;
        for (;;) {
          setStatus(`Kopierer ${t.table}: ${offset.toLocaleString("da-DK")} af ${t.old.toLocaleString("da-DK")}`);
          const r = unwrap(await moveBatch(t.table, offset));
          offset += r.copied;
          if (r.done) break;
        }
        setTables((ts) => ts?.map((x) => (x.table === t.table ? { ...x, new: offset } : x)) ?? ts);
      }
      setStatus("Sætter forbindelserne mellem tabellerne på igen og tæller efter…");
      const after = unwrap(await moveFinish());
      setTables(after);
      const off = after.filter((t) => t.old !== t.new);
      setStatus(off.length ? `${off.length} tabeller har ikke samme antal rækker - se herunder. Kør igen.` : "Færdig: alle tabeller har samme antal rækker i begge databaser.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const check = async () => {
    setError(null);
    const r = await moveCompare();
    if (r.ok) setTables(r.value);
    else setError(r.error);
  };

  const off = tables?.filter((t) => t.old !== t.new).length ?? 0;
  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm text-slate-600">
        Ny database: <b className="text-slate-900">{host}</b>
      </p>
      <p className="text-xs text-slate-500">Brug ikke Arpo, mens den kopierer. Det tager typisk nogle minutter. Den nye databases tabeller tømmes og fyldes på ny, så det er sikkert at køre igen.</p>
      <div className="flex gap-2">
        <button type="button" disabled={busy} onClick={run} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
          {busy ? "Flytter…" : "Start flytning"}
        </button>
        <button type="button" disabled={busy} onClick={check} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          Sammenlign
        </button>
      </div>
      {status && <p className={`text-sm ${!busy && tables && off === 0 ? "font-medium text-green-700" : "text-slate-700"}`}>{status}</p>}
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {tables && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-1">Tabel</th>
              <th className="py-1 text-right">Nu</th>
              <th className="py-1 text-right">Ny</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tables.map((t) => (
              <tr key={t.table} className={t.old === t.new ? "" : "text-red-700"}>
                <td className="py-1">{t.table}</td>
                <td className="py-1 text-right tabular-nums">{t.old.toLocaleString("da-DK")}</td>
                <td className="py-1 text-right tabular-nums">
                  {t.new.toLocaleString("da-DK")} {t.old === t.new ? "✓" : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
