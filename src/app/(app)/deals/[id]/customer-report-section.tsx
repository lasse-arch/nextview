"use client";

import { useState, useTransition } from "react";
import {
  updateMpSkinIdAction,
  updateReportIntervalAction,
  sendCustomerReportNowAction,
} from "@/lib/actions/customer-reports";
import { formatDate } from "@/lib/labels";
import { useToast } from "@/components/toast";
import { usePollWhilePending } from "../../use-poll-while-pending";
import type { ReportInterval, ReportSendStatus } from "@prisma/client";

const INTERVAL_LABELS: Record<ReportInterval, string> = {
  MONTHLY: "Hver måned",
  BIMONTHLY: "Hver 2. måned",
  QUARTERLY: "Hvert kvartal",
};

/**
 * Deliberately minimal - the full customer list and send history all live on
 * /stats, so this is just the handful of controls it makes sense to reach
 * directly from the deal itself, without navigating away.
 */
export function CustomerReportSection({
  dealId,
  mpSkinId,
  reportInterval,
  nextReportDueAt,
  lastSentAt,
  lastSentMethod,
  lastStatus,
  lastErrorMessage,
}: {
  dealId: string;
  mpSkinId: string | null;
  reportInterval: ReportInterval | null;
  nextReportDueAt: string | null;
  lastSentAt: string | null;
  lastSentMethod: "MANUAL" | "AUTOMATIC" | null;
  lastStatus: ReportSendStatus | null;
  lastErrorMessage: string | null;
}) {
  const [mpSkinIdValue, setMpSkinIdValue] = useState(mpSkinId ?? "");
  const [savingId, startSavingId] = useTransition();
  const [pending, startTransition] = useTransition();
  const [sending, startSendTransition] = useTransition();
  const showToast = useToast();

  usePollWhilePending(lastStatus === "PENDING");

  function saveMpSkinId() {
    if (mpSkinIdValue === (mpSkinId ?? "")) return;
    startSavingId(async () => {
      try {
        const result = await updateMpSkinIdAction(dealId, mpSkinIdValue);
        if (!result.ok) showToast(result.error);
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Der opstod en fejl.");
      }
    });
  }

  function changeInterval(value: string) {
    const interval = value === "OFF" ? null : (value as ReportInterval);
    startTransition(async () => {
      try {
        const result = await updateReportIntervalAction(dealId, interval);
        if (!result.ok) showToast(result.error);
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Der opstod en fejl.");
      }
    });
  }

  function sendNow() {
    startSendTransition(async () => {
      try {
        const result = await sendCustomerReportNowAction(dealId);
        if (!result.ok) showToast(result.error);
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Der opstod en fejl.");
      }
    });
  }

  const isSending = sending || lastStatus === "PENDING";

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-900">Besøgsrapport</h2>
        <a href="/stats" className="text-xs text-slate-400 underline">
          Se alle kunder på Stats
        </a>
      </div>

      <div className="mt-3">
        <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">MP-Skin nummer</label>
        <input
          value={mpSkinIdValue}
          onChange={(e) => setMpSkinIdValue(e.target.value)}
          onBlur={saveMpSkinId}
          disabled={savingId}
          placeholder="fx SuPVjGiRx8q"
          className="mt-1 w-56 rounded-md border border-slate-300 px-2 py-1.5 text-sm disabled:opacity-50"
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <select
          defaultValue={reportInterval ?? "OFF"}
          disabled={pending}
          onChange={(e) => changeInterval(e.target.value)}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm disabled:opacity-50"
        >
          <option value="OFF">Automatisk afsendelse slået fra</option>
          <option value="MONTHLY">{INTERVAL_LABELS.MONTHLY}</option>
          <option value="BIMONTHLY">{INTERVAL_LABELS.BIMONTHLY}</option>
          <option value="QUARTERLY">{INTERVAL_LABELS.QUARTERLY}</option>
        </select>
        <button
          type="button"
          disabled={isSending}
          onClick={sendNow}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {isSending ? "Sender…" : "Send stats"}
        </button>
        {isSending && <span className="text-xs text-slate-400">Kan tage op til et minuts tid…</span>}
      </div>

      <div className="mt-2 space-y-0.5 text-xs text-slate-400">
        {reportInterval && nextReportDueAt && <p>Næste automatiske afsendelse: {formatDate(nextReportDueAt)}</p>}
        <p>
          Sidst sendt:{" "}
          {lastStatus === "PENDING" ? (
            "sender lige nu…"
          ) : lastSentAt ? (
            <>
              {formatDate(lastSentAt)} ({lastSentMethod === "AUTOMATIC" ? "automatisk" : "manuelt"})
            </>
          ) : (
            "aldrig"
          )}
        </p>
        {lastStatus === "FAILED" && (
          <p className="text-red-600">Sidste forsøg fejlede: {lastErrorMessage ?? "ukendt fejl"}</p>
        )}
      </div>
    </section>
  );
}
