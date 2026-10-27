"use client";

/**
 * Tiny client-side pub/sub for tracking background PDF-download jobs across
 * the /stats page - deliberately not a full state library, just enough to
 * let any row's "PDF" button start a job and have the one corner widget
 * (DownloadJobsCorner) show its progress, without plumbing the job list
 * through every component's props. State lives only in memory for this page
 * view - a reload drops it, same as the old inline "Henter…" button state
 * would have.
 */

export type DownloadJob = {
  id: string;
  label: string;
  status: "PENDING" | "READY" | "FAILED" | "DONE";
  errorMessage?: string;
};

let jobs: DownloadJob[] = [];
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

export function subscribeDownloadJobs(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getDownloadJobs(): DownloadJob[] {
  return jobs;
}

function updateJob(id: string, patch: Partial<DownloadJob>) {
  jobs = jobs.map((j) => (j.id === id ? { ...j, ...patch } : j));
  notify();
}

function removeJob(id: string) {
  jobs = jobs.filter((j) => j.id !== id);
  notify();
}

function triggerBrowserDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Starts a background PDF-generation job and tracks it in the corner widget
 * until it's ready, auto-downloading it the moment it is. Returns once the
 * job has been successfully queued (not once it's finished) - the caller's
 * own button can go back to normal right away, since the corner widget takes
 * over showing progress from here.
 */
export async function startDownloadJob(
  dealIds: string[],
  combined: boolean,
  label: string,
  showToast: (message: string) => void
): Promise<{ ok: true } | { ok: false; error: string }> {
  let jobId: string;
  try {
    const res = await fetch("/api/stats/download-report/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dealIds, combined }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      return { ok: false, error: body?.error || "Kunne ikke starte PDF-generering." };
    }
    const data = await res.json();
    jobId = data.jobId;
  } catch {
    return { ok: false, error: "Kunne ikke starte PDF-generering." };
  }

  jobs = [...jobs, { id: jobId, label, status: "PENDING" }];
  notify();

  // Polls in the background - this async work continues independently of
  // whatever triggered it, which is the whole point: the caller doesn't
  // await this part.
  // Up to 30 minutes: a big download (a combined report for many locations,
  // or "download all") is made over several server steps.
  (async () => {
    for (let i = 0; i < 600; i++) {
      await sleep(3000);
      let statusRes: Response;
      try {
        statusRes = await fetch(`/api/stats/download-report/job/${jobId}`);
      } catch {
        continue;
      }
      if (!statusRes.ok) {
        updateJob(jobId, { status: "FAILED", errorMessage: "Jobbet blev væk." });
        return;
      }
      const data = await statusRes.json();
      if (data.status === "FAILED") {
        updateJob(jobId, { status: "FAILED", errorMessage: data.errorMessage || "Ukendt fejl." });
        showToast(`PDF-generering fejlede: ${data.errorMessage || "ukendt fejl"}`);
        return;
      }
      if (data.status === "READY") {
        updateJob(jobId, { status: "READY" });
        try {
          const fileRes = await fetch(`/api/stats/download-report/job/${jobId}?file=1`);
          if (!fileRes.ok) throw new Error();
          const fileName = filenameFromContentDisposition(fileRes.headers.get("Content-Disposition"), "besøgsrapport.pdf");
          const blob = await fileRes.blob();
          triggerBrowserDownload(blob, fileName);
          updateJob(jobId, { status: "DONE" });
          setTimeout(() => removeJob(jobId), 2500);
        } catch {
          updateJob(jobId, { status: "FAILED", errorMessage: "Kunne ikke hente den færdige PDF." });
        }
        return;
      }
      // else still PENDING - keep polling
    }
    updateJob(jobId, { status: "FAILED", errorMessage: "Tog for lang tid." });
  })();

  return { ok: true };
}

export function dismissDownloadJob(id: string): void {
  removeJob(id);
}

function filenameFromContentDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      // fall through to the plain filename below
    }
  }
  const plainMatch = header.match(/filename="([^"]+)"/i);
  return plainMatch ? plainMatch[1] : fallback;
}
