"use client";

import { useEffect, useState } from "react";

/*
 * The tour (or the editor's preview of it) failed. Most often that's a new
 * version of Arpo having gone out while it was open - then loading it again
 * is all it takes, so that happens once by itself. Otherwise the error is
 * shown full screen, over Arpo's own menu (not behind it), with its code.
 */
export default function TourError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [tried, setTried] = useState(false);
  useEffect(() => {
    console.error(error, error.digest);
    let again = false;
    try {
      const key = `tour-reload:${location.pathname}`;
      const last = Number(sessionStorage.getItem(key) ?? 0);
      again = Date.now() - last > 60_000;
      if (again) sessionStorage.setItem(key, String(Date.now()));
    } catch {
      again = false;
    }
    if (again) location.reload();
    else queueMicrotask(() => setTried(true));
  }, [error]);
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-3 bg-[#0d1b20] p-6 text-center text-white">
      <p className="text-lg font-semibold">{tried ? "Touren kunne ikke vises" : "Indlæser touren igen …"}</p>
      {tried && (
        <>
          <p className="max-w-sm text-sm text-white/70">Prøv igen om et øjeblik. Bliver det ved, så send et billede af denne side.</p>
          <p className="max-w-md break-words font-mono text-[11px] text-white/50">{error.digest ? `Fejlkode ${error.digest}` : error.message?.slice(0, 300)}</p>
          <button type="button" onClick={() => (reset(), location.reload())} className="mt-2 rounded-full bg-white px-5 py-2 text-sm font-semibold text-[#0d1b20]">
            Prøv igen
          </button>
        </>
      )}
    </div>
  );
}
