"use client";

import { useSyncExternalStore } from "react";
import { subscribeDownloadJobs, getDownloadJobs, dismissDownloadJob } from "./download-job-store";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Genererer…",
  READY: "Klargør download…",
  DONE: "Hentet",
  FAILED: "Fejlede",
};

/**
 * Fixed bottom-right stack showing any PDF downloads currently generating in
 * the background (see download-job-store.ts) - lets a report that takes a
 * minute or more scrape Matterport/explore.nextview360.dk without blocking
 * the "PDF" button or leaving the admin with no feedback at all.
 */
export function DownloadJobsCorner() {
  const jobs = useSyncExternalStore(subscribeDownloadJobs, getDownloadJobs, getDownloadJobs);

  if (jobs.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex w-72 flex-col gap-2">
      {jobs.map((job) => (
        <div key={job.id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-slate-900">{job.label}</p>
              <p
                className={
                  job.status === "FAILED"
                    ? "mt-0.5 text-xs text-red-600"
                    : job.status === "DONE"
                      ? "mt-0.5 text-xs text-emerald-600"
                      : "mt-0.5 flex items-center gap-1.5 text-xs text-slate-500"
                }
              >
                {(job.status === "PENDING" || job.status === "READY") && (
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400" />
                )}
                {job.status === "FAILED" && job.errorMessage ? job.errorMessage : STATUS_LABEL[job.status]}
              </p>
            </div>
            {(job.status === "FAILED" || job.status === "DONE") && (
              <button
                type="button"
                onClick={() => dismissDownloadJob(job.id)}
                className="shrink-0 text-slate-400 hover:text-slate-600"
                aria-label="Luk"
              >
                ×
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
