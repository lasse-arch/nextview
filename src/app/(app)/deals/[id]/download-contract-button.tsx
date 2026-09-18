"use client";

import { useState } from "react";

export function DownloadContractButton({ dealId, fileName }: { dealId: string; fileName: string }) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/deals/${dealId}/contract/download`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Kunne ikke hente den underskrevne kontrakt");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunne ikke hente den underskrevne kontrakt");
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
        {loading ? "Henter..." : "Download underskrevet kontrakt"}
      </button>
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}
