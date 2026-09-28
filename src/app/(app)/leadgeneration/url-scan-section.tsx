"use client";

import { useState, useTransition } from "react";
import {
  scanUrlNowAction,
  createWatchedUrl,
  setWatchedUrlEnabled,
  deleteWatchedUrl,
  runWatchedUrlNowAction,
} from "@/lib/actions/lead-url-scan";
import { useToast } from "@/components/toast";

export type WatchedUrlData = {
  id: string;
  url: string;
  label: string | null;
  enabled: boolean;
  lastScannedAt: string | null;
};

function formatRelative(iso: string | null): string {
  if (!iso) return "Aldrig scannet";
  const hours = Math.round((Date.now() - new Date(iso).getTime()) / (60 * 60 * 1000));
  if (hours < 1) return "Scannet for lidt siden";
  if (hours < 24) return `Scannet for ${hours} t. siden`;
  const days = Math.round(hours / 24);
  return `Scannet for ${days} dag${days === 1 ? "" : "e"} siden`;
}

function WatchedUrlRow({ watched }: { watched: WatchedUrlData }) {
  const [running, startRun] = useTransition();
  const [toggling, startToggle] = useTransition();
  const showToast = useToast();

  function runNow() {
    startRun(async () => {
      const result = await runWatchedUrlNowAction(watched.id);
      if (!result.ok) {
        showToast(result.error);
        return;
      }
      showToast(result.unchanged ? "Siden er uændret siden sidst." : `${result.added} nye leads fundet.`);
    });
  }

  function toggle() {
    startToggle(() => setWatchedUrlEnabled(watched.id, !watched.enabled));
  }

  async function remove() {
    if (!confirm(`Stop med at overvåge "${watched.label || watched.url}"?`)) return;
    await deleteWatchedUrl(watched.id);
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className="min-w-0">
        <p className="truncate font-medium text-slate-900">{watched.label || watched.url}</p>
        {watched.label && <p className="truncate text-xs text-slate-500">{watched.url}</p>}
        <p className="mt-0.5 text-xs text-slate-400">{formatRelative(watched.lastScannedAt)}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <label className="flex items-center gap-1.5 text-xs text-slate-500" title="Scan automatisk hver dag">
          <input type="checkbox" checked={watched.enabled} disabled={toggling} onChange={toggle} />
          Daglig
        </label>
        <button
          type="button"
          onClick={runNow}
          disabled={running}
          className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {running ? "Scanner…" : "Scan nu"}
        </button>
        <button
          type="button"
          onClick={remove}
          className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
        >
          Slet
        </button>
      </div>
    </div>
  );
}

export function UrlScanSection({ watchedUrls }: { watchedUrls: WatchedUrlData[] }) {
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [watchDaily, setWatchDaily] = useState(false);
  const [scanning, startScan] = useTransition();
  const showToast = useToast();

  function scan() {
    if (!url.trim()) {
      showToast("Angiv en URL.");
      return;
    }
    startScan(async () => {
      const result = await scanUrlNowAction(url);
      if (!result.ok) {
        showToast(result.error);
        return;
      }
      if (watchDaily) {
        const formData = new FormData();
        formData.set("url", url);
        formData.set("label", label);
        await createWatchedUrl(formData);
      }
      const articlesSuffix =
        result.articlesScanned > 0 ? ` (inkl. ${result.articlesScanned} artikel${result.articlesScanned === 1 ? "" : "er"})` : "";
      showToast(
        result.cvrCount === 0
          ? `Fandt intet CVR-nummer nævnt på siden${articlesSuffix}.`
          : `Fandt ${result.cvrCount} CVR-nummer${result.cvrCount === 1 ? "" : "e"}${articlesSuffix} - ${result.added} nye leads.`
      );
      setUrl("");
      setLabel("");
      setWatchDaily(false);
    });
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Scan en side</h2>
      <p className="mt-1 text-xs text-slate-500">
        Indsæt en URL (nyhedsartikel, brancheliste, ...) - den scannes for nævnte CVR-numre, som slås op i det
        officielle register og tilføjes til fundne leads.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://..."
          className="min-w-[240px] flex-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
        />
        <button
          type="button"
          onClick={scan}
          disabled={scanning}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {scanning ? "Scanner…" : "Scan nu"}
        </button>
      </div>
      <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
        <input type="checkbox" checked={watchDaily} onChange={(e) => setWatchDaily(e.target.checked)} />
        Overvåg denne side og scan den automatisk hver dag
      </label>
      {watchDaily && (
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Navn (valgfrit, fx en avis eller brancheliste)"
          className="mt-2 w-full max-w-sm rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
        />
      )}

      {watchedUrls.length > 0 && (
        <div className="mt-4 space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Overvågede sider</h3>
          {watchedUrls.map((w) => (
            <WatchedUrlRow key={w.id} watched={w} />
          ))}
        </div>
      )}
    </section>
  );
}
