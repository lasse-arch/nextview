"use client";

import { useState } from "react";
import Link from "next/link";
import { formatDKK, stageLabels } from "@/lib/labels";

type BreakdownRow = {
  id: string;
  name: string;
  stage: string;
  churned: boolean;
  mrr: number;
  bindingMonths: number;
  contractValue: number;
  establishmentFee: number;
  contribution: number;
};

export function SoldTotalReportButton({ total, breakdown }: { total: number; breakdown: BreakdownRow[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-500 hover:bg-slate-50"
      >
        Rapport
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div
            className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Rapport: Solgt i alt</h2>
              <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-2 text-sm text-slate-600">
              <p>
                <span className="font-medium text-slate-800">Data kommer fra:</span> alle deals i databasen med stadie{" "}
                <span className="font-medium">Kontrakt underskrevet</span>, <span className="font-medium">Filmet</span> eller{" "}
                <span className="font-medium">Live</span> - dvs. alt der har en underskrevet kontrakt, uanset om det er
                afleveret/live endnu eller senere er opsagt.
              </p>
              <p>
                <span className="font-medium text-slate-800">Sådan beregnes hver deals bidrag:</span>
              </p>
              <ul className="ml-4 list-disc space-y-1">
                <li>Etableringspris (altid), plus antal måneder kunden er/var kontraheret for × månedlig pris.</li>
                <li>Opsagt: de måneder fra live-/faktureringsdato til opsigelsesdato - ikke mere, da det aldrig blev betalt.</li>
                <li>
                  Opsagt med varsel, men endnu ikke ophørt: måneder til den beregnede ophørsdato - som kan ligge en
                  hel bindingsperiode senere end forventet, hvis opsigelsen kom for sent til at nå varslet inden
                  udløb (kontrakten fornyer sig selv med en ny periode).
                </li>
                <li>
                  Stadig aktiv, aldrig opsagt: bindingsperioden, plus endnu en fuld periode for hver gang kunden er
                  &ldquo;rullet videre&rdquo; forbi et udløbstidspunkt uden at opsige.
                </li>
              </ul>
              <p>
                <span className="font-medium text-slate-800">Samlet:</span> summen af alle {breakdown.length} deals nedenfor
                giver <span className="money font-semibold">{formatDKK(total)}</span>. Dette tal er beregnet på samme måde
                som &ldquo;Samlet booket værdi&rdquo; på Vækst-dashboardet, så de to skal altid stemme overens.
              </p>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px] text-xs">
                <thead className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <tr className="border-b border-slate-200">
                    <th className="py-1.5 font-medium">Kunde</th>
                    <th className="py-1.5 font-medium">Stadie</th>
                    <th className="py-1.5 text-right font-medium">MRR</th>
                    <th className="py-1.5 text-right font-medium">Binding</th>
                    <th className="py-1.5 text-right font-medium">Kontraktværdi</th>
                    <th className="py-1.5 text-right font-medium">Etablering</th>
                    <th className="py-1.5 text-right font-medium">Bidrag</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdown.map((row) => (
                    <tr key={row.id} className="border-b border-slate-100">
                      <td className="py-1.5">
                        <Link href={`/deals/${row.id}`} className="text-blue-700 hover:underline">
                          {row.name}
                        </Link>
                        {row.churned && (
                          <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-500">
                            Opsagt
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 text-slate-500">{stageLabels[row.stage] ?? row.stage}</td>
                      <td className="money py-1.5 text-right text-slate-500">{formatDKK(row.mrr)}</td>
                      <td className="py-1.5 text-right text-slate-500">{row.bindingMonths || "–"}</td>
                      <td className="money py-1.5 text-right text-slate-500">{formatDKK(row.contractValue)}</td>
                      <td className="money py-1.5 text-right text-slate-500">{formatDKK(row.establishmentFee)}</td>
                      <td className="money py-1.5 text-right font-medium text-slate-800">{formatDKK(row.contribution)}</td>
                    </tr>
                  ))}
                  {breakdown.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-4 text-center text-slate-400">
                        Ingen solgte deals endnu.
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={6} className="pt-2 text-right font-medium text-slate-700">
                      I alt
                    </td>
                    <td className="money pt-2 text-right font-semibold text-slate-900">{formatDKK(total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
