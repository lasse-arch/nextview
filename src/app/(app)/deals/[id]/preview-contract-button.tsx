"use client";

import { useState } from "react";

/** Opens the customer's own DocuSeal signing-form link for a sent
 * (not-yet-signed) contract in a new tab - the real, live document, exactly
 * what the customer received - so a seller can check what was sent. */
export function PreviewContractButton({ dealId }: { dealId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/deals/${dealId}/contract/preview`);
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.url) throw new Error(body?.error || "Kunne ikke hente kontrakten");
      window.open(body.url, "_blank");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunne ikke hente kontrakten");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="block w-full rounded-md border border-slate-300 px-3 py-2 text-center text-sm hover:bg-slate-50 disabled:opacity-60"
      >
        {loading ? "Henter…" : "Preview sendt kontrakt"}
      </button>
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}
