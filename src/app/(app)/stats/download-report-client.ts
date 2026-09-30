/** Pulls the real filename (deal name + date) out of the response's own
 * Content-Disposition header - set by the API route, e.g.
 * `attachment; filename="report.pdf"; filename*=UTF-8''Bes%C3%B8gsrapport...` -
 * rather than a hardcoded generic name, which was silently overriding the
 * server's filename entirely (the `download` attribute on a manually
 * created `<a>` wins over anything in the response headers). Falls back to
 * a generic name only if the header is missing/unparseable. */
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
  const fallbackName = dealIds.length === 1 ? "besøgsrapport.pdf" : "besøgsrapporter.pdf";
  const fileName = filenameFromContentDisposition(res.headers.get("Content-Disposition"), fallbackName);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  if (skippedCount > 0) {
    showToast(`${skippedCount} sprunget over (intet MP-Skin nummer, eller PDF-generering fejlede).`);
  }
}
