"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  updateMpSkinIdAction,
  updateReportIntervalAction,
  sendCustomerReportNowAction,
} from "@/lib/actions/customer-reports";
import { formatDate } from "@/lib/labels";
import { useToast } from "@/components/toast";
import type { ReportInterval } from "@prisma/client";

const INTERVAL_LABELS: Record<ReportInterval, string> = {
  MONTHLY: "Hver måned",
  BIMONTHLY: "Hver 2. måned",
  QUARTERLY: "Hvert kvartal",
};

export function StatsCustomerRow({
  dealId,
  name,
  mpSkinId,
  reportInterval,
  nextReportDueAt,
  lastSentAt,
  lastSentMethod,
}: {
  dealId: string;
  name: string;
  mpSkinId: string | null;
  reportInterval: ReportInterval | null;
  nextReportDueAt: string | null;
  lastSentAt: string | null;
  lastSentMethod: "MANUAL" | "AUTOMATIC" | null;
}) {
  const [mpSkinIdValue, setMpSkinIdValue] = useState(mpSkinId ?? "");
  const [savingId, startSavingId] = useTransition();
  const [pending, startTransition] = useTransition();
  const [sending, startSendTransition] = useTransition();
  const showToast = useToast();

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
        showToast(result.ok ? `Sender til ${name} i baggrunden - opdater siden om et minuts tid.` : result.error);
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Der opstod en fejl.");
      }
    });
  }

  return (
    <tr className="border-t border-slate-100">
      <td className="px-3 py-2">
        <Link href={`/deals/${dealId}`} className="font-medium text-slate-900 hover:underline">
          {name}
        </Link>
      </td>
      <td className="px-3 py-2">
        <input
          value={mpSkinIdValue}
          onChange={(e) => setMpSkinIdValue(e.target.value)}
          onBlur={saveMpSkinId}
          disabled={savingId}
          placeholder="fx SuPVjGiRx8q"
          className="w-36 rounded-md border border-slate-300 px-2 py-1 text-xs disabled:opacity-50"
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
      <td className="px-3 py-2 text-slate-600">
        {reportInterval && nextReportDueAt ? formatDate(nextReportDueAt) : "–"}
      </td>
      <td className="px-3 py-2 text-slate-600">
        {lastSentAt ? (
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
        ) : (
          "Aldrig sendt"
        )}
      </td>
      <td className="px-3 py-2 text-right">
        <button
          type="button"
          disabled={sending}
          onClick={sendNow}
          className="shrink-0 whitespace-nowrap rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {sending ? "Sender…" : "Send nu"}
        </button>
      </td>
    </tr>
  );
}
