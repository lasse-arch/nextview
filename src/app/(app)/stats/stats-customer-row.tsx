"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  updateMpSkinIdAction,
  updateReportCcEmailsAction,
  updateReportIntervalAction,
  updateReportLanguageAction,
  sendCustomerReportNowAction,
} from "@/lib/actions/customer-reports";
import { formatDate } from "@/lib/labels";
import { useToast } from "@/components/toast";
import { usePollWhilePending } from "../use-poll-while-pending";
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

  const isSending = sending || lastStatus === "PENDING";

  return (
    <tr className="border-t border-slate-100">
      <td className="sticky left-0 z-10 bg-white px-3 py-2">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelected}
            aria-label={`Vælg ${name}`}
          />
          <Link href={`/deals/${dealId}`} className="font-medium text-slate-900 hover:underline">
            {name}
          </Link>
        </div>
      </td>
      <td className="px-3 py-2">
        <input
          value={mpSkinIdValue}
          onChange={(e) => setMpSkinIdValue(e.target.value)}
          onBlur={saveMpSkinId}
          disabled={savingId}
          placeholder="fx SuPVjGiRx8q"
          title="Flere MP-Skin numre kan adskilles med komma, hvis kunden har mere end én tour"
          className="w-40 rounded-md border border-slate-300 px-2 py-1 text-xs disabled:opacity-50"
        />
      </td>
      <td className="px-3 py-2">
        <input
          value={ccValue}
          onChange={(e) => setCcValue(e.target.value)}
          onBlur={saveCc}
          disabled={savingCc}
          placeholder="cc@firma.dk, ..."
          className="w-40 rounded-md border border-slate-300 px-2 py-1 text-xs disabled:opacity-50"
        />
      </td>
      <td className="px-3 py-2">
        <select
          defaultValue={reportInterval ?? "OFF"}
          disabled={pending}
          onChange={(e) => changeInterval(e.target.value)}
          className="rounded-md border border-slate-300 px-2 py-1 text-xs disabled:opacity-50"
        >
          <option value="OFF">Slået fra</option>
          <option value="MONTHLY">{INTERVAL_LABELS.MONTHLY}</option>
          <option value="BIMONTHLY">{INTERVAL_LABELS.BIMONTHLY}</option>
          <option value="QUARTERLY">{INTERVAL_LABELS.QUARTERLY}</option>
        </select>
      </td>
      <td className="px-3 py-2">
        <select
          defaultValue={reportLanguage}
          disabled={savingLanguage}
          onChange={(e) => changeLanguage(e.target.value)}
          className="rounded-md border border-slate-300 px-2 py-1 text-xs disabled:opacity-50"
        >
          <option value="DA">Dansk</option>
          <option value="EN">Engelsk</option>
        </select>
      </td>
      <td className="px-3 py-2 text-slate-600">
        {reportInterval && nextReportDueAt ? formatDate(nextReportDueAt) : "–"}
      </td>
      <td className="px-3 py-2 text-slate-600">
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
                {formatDate(lastSentAt)}{" "}
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
          "Aldrig sendt"
        )}
      </td>
      <td className="sticky right-0 z-10 bg-white px-3 py-2 text-right">
        <button
          type="button"
          disabled={isSending}
          onClick={sendNow}
          className="shrink-0 whitespace-nowrap rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {isSending ? "Sender…" : "Send nu"}
        </button>
      </td>
    </tr>
  );
}
