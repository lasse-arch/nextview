"use client";

import { useEffect, useState, useTransition } from "react";
import { getRecurringPeriodOptions, markPeriodSentManuallyAction } from "@/lib/actions/invoices";
import { formatDKK, invoiceStatusLabels } from "@/lib/labels";
import { useToast } from "@/components/toast";

/**
 * Lets an admin record that a specific, chosen quarter was invoiced entirely
 * outside the system (e.g. a batch sent directly in Dinero) - picks from
 * every recurring period on this deal's current term, not just whatever the
 * automated generator currently considers "due", so a quarter already
 * invoiced by hand doesn't later get drafted again on top of it.
 */
export function MarkPeriodSentManuallyButton({ dealId }: { dealId: string }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<Awaited<ReturnType<typeof getRecurringPeriodOptions>> | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const showToast = useToast();

  useEffect(() => {
    if (!open || options !== null) return;
    getRecurringPeriodOptions(dealId).then((opts) => {
      setOptions(opts);
      setSelected(opts.find((o) => !o.status)?.quarterIndex ?? opts[0]?.quarterIndex ?? null);
    });
  }, [open, options, dealId]);

  function confirm() {
    if (selected === null) return;
    startTransition(async () => {
      try {
        const result = await markPeriodSentManuallyAction(dealId, selected);
        if (result.ok) {
          showToast("Kvartal markeret som sendt manuelt.");
          setOpen(false);
          setOptions(null);
        } else {
          showToast(result.error);
        }
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Der opstod en fejl.");
      }
    });
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-[190px] items-center justify-center whitespace-nowrap rounded-md border border-slate-300 px-3 py-1.5 text-center text-xs font-medium text-slate-600 hover:bg-slate-50"
      >
        Marker kvartal sendt manuelt
      </button>
      {open && (
        <div className="absolute left-0 top-full z-10 mt-1 w-64 rounded-md border border-slate-200 bg-white p-3 text-sm shadow-lg">
          {options === null ? (
            <p className="text-xs text-slate-400">Indlæser…</p>
          ) : options.length === 0 ? (
            <p className="text-xs text-slate-400">Ingen kvartaler at vise for denne deal.</p>
          ) : (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Vælg kvartal</p>
              <select
                value={selected ?? ""}
                onChange={(e) => setSelected(Number(e.target.value))}
                className="mt-1.5 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
              >
                {options.map((o) => (
                  <option key={o.quarterIndex} value={o.quarterIndex}>
                    {o.label} - {formatDKK(o.amount)}
                    {o.status ? ` (${invoiceStatusLabels[o.status] ?? o.status})` : ""}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={pending || selected === null}
                onClick={confirm}
                className="mt-3 w-full rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {pending ? "Markerer…" : "Marker som sendt manuelt"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
