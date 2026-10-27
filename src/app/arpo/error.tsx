"use client";

import { useEffect } from "react";

// Next.js redacts the real message from Server Action/Server Component
// errors in production (the client only ever sees "Minified React error
// #441..."), so we show a generic message rather than error.message - the
// digest is logged for correlating with server-side logs if needed.
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error, error.digest);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <p className="text-lg font-semibold text-slate-900">Der skete en fejl</p>
      <p className="max-w-md text-sm text-slate-500">
        Noget gik galt og ændringen blev ikke gemt. Prøv igen, eller gå tilbage og prøv en anden handling.
      </p>
      {/* What actually went wrong, small - so a screenshot of this page tells us. Server errors only show their digest (Next.js hides the message). */}
      <p className="max-w-lg break-words font-mono text-[11px] text-slate-400">
        {error.digest ? `Fejlkode ${error.digest}` : error.message?.slice(0, 300)}
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        Prøv igen
      </button>
    </div>
  );
}
