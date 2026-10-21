"use client";

import { useTransition } from "react";
import { useState } from "react";
import { approveEstablishment, disputeEstablishment, holdEstablishmentForApproval } from "@/lib/actions/establishment-approval";
import { formatDate, formatDKK } from "@/lib/labels";
import { useToast } from "@/components/toast";

/**
 * The setup fee's "on signing" vs. "when the customer is happy" choice on a
 * deal (see Deal.establishmentAwaitingApproval) - shown until the setup fee
 * has been invoiced.
 */
export function EstablishmentApprovalControl({
  dealId,
  fee,
  awaiting,
  approvalDeadline,
  disputedAt,
}: {
  dealId: string;
  fee: number;
  awaiting: boolean;
  /** 7 days after going Live - null while not delivered yet. */
  approvalDeadline: string | null;
  disputedAt: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [reportingDefects, setReportingDefects] = useState(false);
  const [defects, setDefects] = useState("");
  const showToast = useToast();

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, done: string) {
    startTransition(async () => {
      const result = await action();
      showToast(result.ok ? done : result.error);
    });
  }

  if (awaiting) {
    return (
      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
        <p className="font-medium text-amber-900">Etablering ({formatDKK(fee)}) afventer kundens godkendelse</p>
        <p className="mt-0.5 text-xs text-amber-800">
          {disputedAt
            ? `Kunden påpegede mangler ${formatDate(disputedAt)} - faktureres, når de er udbedret, og I trykker "Kunden er tilfreds".`
            : approvalDeadline
              ? new Date(approvalDeadline) <= new Date()
                ? "Fristen på 7 dage er gået uden mangler - faktureres ved næste fakturakørsel."
                : `Godkendes automatisk ${formatDate(approvalDeadline)} (7 dage efter levering), medmindre kunden påpeger konkrete mangler inden da.`
              : "Fristen på 7 dage starter, når produktet er leveret (dealen går Live)."}
        </p>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!confirm(`Er kunden tilfreds? Etableringen (${formatDKK(fee)}) faktureres så ved næste fakturakørsel.`)) return;
            run(() => approveEstablishment(dealId), "Etableringen faktureres ved næste fakturakørsel");
          }}
          className="mt-2 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {pending ? "Gemmer…" : "✓ Kunden er tilfreds - fakturér etablering"}
        </button>
        {!disputedAt && !reportingDefects && (
          <button
            type="button"
            disabled={pending}
            onClick={() => setReportingDefects(true)}
            className="ml-2 mt-2 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
          >
            Kunden har påpeget mangler
          </button>
        )}
        {reportingDefects && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(() => disputeEstablishment(dealId, defects), "Noteret - etableringen venter, til manglerne er udbedret");
              setReportingDefects(false);
            }}
            className="mt-2 flex flex-wrap gap-2"
          >
            <input
              value={defects}
              onChange={(e) => setDefects(e.target.value)}
              placeholder="Hvilke mangler? Fx: mangler billeder af værelserne"
              required
              autoFocus
              className="min-w-0 flex-1 rounded-md border border-amber-300 bg-white px-2 py-1.5 text-xs"
            />
            <button type="submit" disabled={pending} className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700">
              Gem
            </button>
            <button type="button" onClick={() => setReportingDefects(false)} className="text-xs text-amber-800">
              Annullér
            </button>
          </form>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
      <span>Etablering ({formatDKK(fee)}) faktureres automatisk efter underskrift.</span>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirm("Vent med at fakturere etableringen, til produktet er leveret, og kunden er tilfreds?")) return;
          run(() => holdEstablishmentForApproval(dealId), "Etableringen venter nu på kundens godkendelse");
        }}
        className="rounded-md border border-slate-300 px-2 py-1 font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
      >
        Vent til kunden er tilfreds
      </button>
    </div>
  );
}
