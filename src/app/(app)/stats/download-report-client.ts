/**
 * Fetches the merged/single PDF from /api/stats/download-report and triggers
 * a normal browser download - a plain `<a href>` can't show an error toast or
 * report skipped deals, so this goes through fetch+blob instead. Shared by
 * the per-row single download and the bulk-selection download.
 */
export async function downloadCustomerReportPdf(dealIds: string[], showToast: (message: string) => void): Promise<void> {
  if (dealIds.length === 0) return;

  let res: Response;
  try {
    res = await fetch(`/api/stats/download-report?dealIds=${dealIds.map(encodeURIComponent).join(",")}`);
  } catch {
    showToast("Kunne ikke hente PDF'en.");
    return;
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    showToast(body?.error || "Kunne ikke hente PDF'en.");
    return;
  }

  const skippedCount = Number(res.headers.get("X-Skipped-Count") || "0");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = dealIds.length === 1 ? "besøgsrapport.pdf" : "besøgsrapporter.pdf";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  if (skippedCount > 0) {
    showToast(`${skippedCount} sprunget over (intet MP-Skin nummer, eller PDF-generering fejlede).`);
  }
}
