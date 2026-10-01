"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  updateMpSkinIdAction,
  updateReportCcEmailsAction,
  updateReportIntervalAction,
  updateReportLanguageAction,
  sendCustomerReportNowAction,
  sendCombinedCustomerReportAction,
} from "@/lib/actions/customer-reports";
import { formatDate } from "@/lib/labels";
import { useToast } from "@/components/toast";
import { usePollWhilePending } from "../use-poll-while-pending";
import { startDownloadJob } from "./download-job-store";
import { ReportHistoryTooltip, type ReportHistoryEntry } from "./report-history-tooltip";
import type { ReportInterval, ReportLanguage, ReportSendStatus } from "@prisma/client";

const INTERVAL_LABELS: Record<ReportInterval, string> = {
  MONTHLY: "Hver måned",
  BIMONTHLY: "Hver 2. måned",
  QUARTERLY: "Hvert kvartal",
};

export type StatsCustomerRowData = {
  dealId: string;
  name: string;
  mpSkinId: string | null;
  reportCcEmails: string | null;
  reportInterval: ReportInterval | null;
  reportLanguage: ReportLanguage;
  nextReportDueAt: string | null;
  lastSentAt: string | null;
  lastSentMethod: "MANUAL" | "AUTOMATIC" | null;
  lastStatus: ReportSendStatus | null;
  lastErrorMessage: string | null;
  history: ReportHistoryEntry[];
  /** Linked branches (see customer linking) that also have an MP-Skin nummer - lets a "Send samlet rapport" button appear. */
  branches: { id: string; name: string }[];
};

export function StatsCustomerRow({
  dealId,
  name,
  mpSkinId,
  reportCcEmails,
  reportInterval,
  reportLanguage,
  nextReportDueAt,
  lastSentAt,
  lastSentMethod,
  lastStatus,
  lastErrorMessage,
  history,
  branches,
  selected,
  onToggleSelected,
}: StatsCustomerRowData & { selected: boolean; onToggleSelected: () => void }) {
  const [mpSkinIdValue, setMpSkinIdValue] = useState(mpSkinId ?? "");
  const [ccValue, setCcValue] = useState(reportCcEmails ?? "");
  const [savingId, startSavingId] = useTransition();
  const [savingCc, startSavingCc] = useTransition();
  const [pending, startTransition] = useTransition();
  const [savingLanguage, startSavingLanguage] = useTransition();
  const [sending, startSendTransition] = useTransition();
  const [sendingCombined, startSendCombinedTransition] = useTransition();
  const [downloading, startDownloadTransition] = useTransition();
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

  function saveCc() {
    if (ccValue === (reportCcEmails ?? "")) return;
    startSavingCc(async () => {
      try {
        const result = await updateReportCcEmailsAction(dealId, ccValue);
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

  function changeLanguage(value: string) {
    startSavingLanguage(async () => {
      try {
        const result = await updateReportLanguageAction(dealId, value as ReportLanguage);
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

  function sendCombined() {
    startSendCombinedTransition(async () => {
      try {
        const result = await sendCombinedCustomerReportAction(dealId);
        if (!result.ok) {
          showToast(result.error);
          return;
        }
        showToast(`Samlet rapport sat i kø for ${result.branchCount + 1} lokationer.`);
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Der opstod en fejl.");
      }
    });
  }

  function downloadPdf() {
    // Mirrors "Send samlet": a deal with linked branches gets asked whether
    // this download should be just for it, or one combined PDF (one stats
    // page per branch) for it and every linked branch together.
    const combined =
      branches.length > 0 &&
      confirm(
        `Denne kunde har ${branches.length} sammenkoblede afdeling${branches.length === 1 ? "" : "er"} (${branches
          .map((b) => b.name)
          .join(", ")}).\n\nTryk OK for én samlet PDF med alle ${branches.length + 1}, eller Annullér for kun denne.`
      );
    startDownloadTransition(async () => {
      const result = await startDownloadJob([dealId], combined, name, showToast);
      if (!result.ok) showToast(result.error);
    });
  }

  const isSending = sending || lastStatus === "PENDING";

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelected}
            aria-label={`Vælg ${name}`}
            className="mt-1"
          />
          <div className="min-w-0">
            <Link href={`/deals/${dealId}`} className="font-medium text-slate-900 hover:underline">
              {name}
            </Link>
            <div className="mt-0.5 text-xs">
              {isSending ? (
                <span className="flex items-center gap-1.5 text-slate-500">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400" />
                  Sender…
                </span>
              ) : lastStatus === "FAILED" ? (
                <ReportHistoryTooltip
                  history={history}
                  label={
                    <span className="text-red-600" title={lastErrorMessage ?? "ukendt fejl"}>
                      Fejlede {lastSentAt ? formatDate(lastSentAt) : ""}
                    </span>
                  }
                />
              ) : lastSentAt ? (
                <ReportHistoryTooltip
                  history={history}
                  label={
                    <>
                      <span className="text-slate-500">{formatDate(lastSentAt)}</span>{" "}
                      <span
                        className={
                          lastSentMethod === "AUTOMATIC"
                            ? "ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
                            : "ml-1 rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700"
                        }
                      >
                        {lastSentMethod === "AUTOMATIC" ? "Automatisk" : "Manuelt"}
                      </span>
                    </>
                  }
                />
              ) : (
                <span className="italic text-slate-400">Aldrig sendt</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 gap-1.5">
          {branches.length > 0 && (
            <button
              type="button"
              disabled={isSending || sendingCombined}
              onClick={sendCombined}
              title={`Sender én samlet mail/PDF med stats for denne og: ${branches.map((b) => b.name).join(", ")}`}
              className="shrink-0 whitespace-nowrap rounded-md border border-violet-300 px-2 py-1 text-xs font-medium text-violet-700 hover:bg-violet-50 disabled:opacity-50"
            >
              {sendingCombined ? "Sender…" : `Send samlet (${branches.length + 1})`}
            </button>
          )}
          <button
            type="button"
            disabled={downloading || !mpSkinId}
            onClick={downloadPdf}
            title={!mpSkinId ? "Udfyld MP-Skin nummer først" : "Download PDF uden at sende"}
            className="shrink-0 whitespace-nowrap rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            {downloading ? "Henter…" : "PDF"}
          </button>
          <button
            type="button"
            disabled={isSending}
            onClick={sendNow}
            className="shrink-0 whitespace-nowrap rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            {isSending ? "Sender…" : "Send nu"}
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <div>
          <label className="block text-[11px] font-medium text-slate-500">MP-Skin nummer</label>
          <input
            value={mpSkinIdValue}
            onChange={(e) => setMpSkinIdValue(e.target.value)}
            onBlur={saveMpSkinId}
            disabled={savingId}
            placeholder="fx SuPVjGiRx8q"
            title="Flere MP-Skin numre kan adskilles med komma, hvis kunden har mere end én tour"
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-xs disabled:opacity-50"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-500">CC</label>
          <input
            value={ccValue}
            onChange={(e) => setCcValue(e.target.value)}
            onBlur={saveCc}
            disabled={savingCc}
            placeholder="cc@firma.dk, ..."
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-xs disabled:opacity-50"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-500">Interval</label>
          <select
            defaultValue={reportInterval ?? "OFF"}
            disabled={pending}
            onChange={(e) => changeInterval(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-xs disabled:opacity-50"
          >
            <option value="OFF">Slået fra</option>
            <option value="MONTHLY">{INTERVAL_LABELS.MONTHLY}</option>
            <option value="BIMONTHLY">{INTERVAL_LABELS.BIMONTHLY}</option>
            <option value="QUARTERLY">{INTERVAL_LABELS.QUARTERLY}</option>
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-500">Sprog</label>
          <select
            defaultValue={reportLanguage}
            disabled={savingLanguage}
            onChange={(e) => changeLanguage(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-xs disabled:opacity-50"
          >
            <option value="DA">Dansk</option>
            <option value="EN">Engelsk</option>
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-500">Næste afsendelse</label>
          <p className="mt-1.5 text-xs text-slate-600">
            {reportInterval && nextReportDueAt ? formatDate(nextReportDueAt) : "–"}
          </p>
        </div>
      </div>
    </div>
  );
}
