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
  updateReportCombineBranchesAction,
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
  lastOpenedAt: string | null;
  /** The sent report's PDF, archived in Google Drev (Stats / kunde / fil). */
  lastPdfUrl: string | null;
  history: ReportHistoryEntry[];
  /** Linked branches (see customer linking) that also have an MP-Skin nummer - lets a "Send samlet rapport" button appear. */
  branches: { id: string; name: string }[];
  /** Automatic sends go out as one combined report with the branches (see Deal.reportCombineBranches). */
  reportCombineBranches: boolean;
  /** Set on a branch whose parent sends combined - it's then never sent on its own automatically. */
  combinedIntoParentName: string | null;
  /** A branch's main customer - its "PDF" can then also make the combined one for the whole group. */
  groupParent: { id: string; name: string; count: number } | null;
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
  lastOpenedAt,
  lastPdfUrl,
  history,
  branches,
  reportCombineBranches,
  combinedIntoParentName,
  groupParent,
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
  const [pdfMenuOpen, setPdfMenuOpen] = useState(false);
  const [savingCombine, startSavingCombine] = useTransition();
  const [combineValue, setCombineValue] = useState(reportCombineBranches);
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

  function changeCombine(combine: boolean) {
    setCombineValue(combine);
    startSavingCombine(async () => {
      try {
        const result = await updateReportCombineBranchesAction(dealId, combine);
        if (!result.ok) {
          setCombineValue(!combine);
          showToast(result.error);
        }
      } catch (err) {
        setCombineValue(!combine);
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

  function downloadPdf(ids: string[], combined: boolean, label: string) {
    setPdfMenuOpen(false);
    startDownloadTransition(async () => {
      const result = await startDownloadJob(ids, combined, label, showToast);
      if (!result.ok) showToast(result.error);
    });
  }

  // With linked locations (this is the main customer, or one of its
  // branches) the PDF button asks: just this one, or one combined PDF for
  // all of them - otherwise it just downloads.
  const combinedChoice =
    branches.length > 0
      ? { ids: [dealId], label: name, count: branches.length + 1 }
      : groupParent && groupParent.count > 1
        ? { ids: [groupParent.id], label: groupParent.name, count: groupParent.count }
        : null;

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
                <>
                  <ReportHistoryTooltip
                    history={history}
                    label={
                      <span className="text-red-600" title={lastErrorMessage ?? "ukendt fejl"}>
                        Fejlede {lastSentAt ? formatDate(lastSentAt) : ""}
                      </span>
                    }
                  />
                  {/* Shown outright, not just on hover - it's what says how to fix it. */}
                  <p className="mt-0.5 max-w-xl text-xs text-red-500">{lastErrorMessage ?? "Ukendt fejl"}</p>
                </>
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
                      </span>{" "}
                      <span
                        className={
                          lastOpenedAt
                            ? "rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"
                            : "rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-400"
                        }
                        title={lastOpenedAt ? `Åbnet ${formatDate(lastOpenedAt)}` : "Ikke åbnet endnu"}
                      >
                        {lastOpenedAt ? "Åbnet" : "Ikke åbnet"}
                      </span>
                      {lastPdfUrl && (
                        <a
                          href={lastPdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-2 font-medium text-blue-600 hover:underline"
                          title="Den sendte rapport i Google Drev (Stats / kunde)"
                        >
                          Se sendt PDF
                        </a>
                      )}
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
          <div className="relative shrink-0">
            <button
              type="button"
              disabled={downloading || !mpSkinId}
              onClick={() => (combinedChoice ? setPdfMenuOpen((v) => !v) : downloadPdf([dealId], false, name))}
              title={!mpSkinId ? "Udfyld MP-Skin nummer først" : "Download PDF uden at sende"}
              className="whitespace-nowrap rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              {downloading ? "Henter…" : "PDF"}
            </button>
            {pdfMenuOpen && combinedChoice && (
              <>
                <button
                  type="button"
                  aria-label="Luk"
                  className="fixed inset-0 z-10 cursor-default"
                  onClick={() => setPdfMenuOpen(false)}
                />
                <div className="absolute right-0 top-full z-20 mt-1 w-64 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                  <button
                    type="button"
                    onClick={() => downloadPdf([dealId], false, name)}
                    className="block w-full rounded-md px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"
                  >
                    <span className="font-medium">Kun denne</span>
                    <span className="block text-slate-500">{name}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadPdf(combinedChoice.ids, true, `${combinedChoice.label} (samlet)`)}
                    className="block w-full rounded-md px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"
                  >
                    <span className="font-medium">Samlet for alle {combinedChoice.count}</span>
                    <span className="block text-slate-500">Én PDF med alle lokationer under {combinedChoice.label}</span>
                  </button>
                </div>
              </>
            )}
          </div>
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
            {combinedIntoParentName
              ? `Samlet med ${combinedIntoParentName}`
              : reportInterval && nextReportDueAt
                ? formatDate(nextReportDueAt)
                : "–"}
          </p>
        </div>
      </div>
      {branches.length > 0 && (
        <label className="mt-3 flex items-start gap-2 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={combineValue}
            disabled={savingCombine}
            onChange={(e) => changeCombine(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="font-medium text-slate-700">Send samlet automatisk</span> - den automatiske afsendelse
            sender én samlet rapport med {branches.map((b) => b.name).join(", ")} efter dette interval, i stedet for
            en rapport til hver.
          </span>
        </label>
      )}
    </div>
  );
}
