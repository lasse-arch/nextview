"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { previewWelcomeMail, sendWelcomeMailNow } from "@/lib/actions/welcome-mail";
import { useToast } from "@/components/toast";

/**
 * Under Ydelser (whose links go into the mail): shows whether the "Velkommen til Nextview360"
 * mail (sent automatically when the deal is first set Live) has gone out,
 * a preview of it, and a button to send it (again) by hand.
 */
export function WelcomeMailControl({ dealId, sentAtLabel }: { dealId: string; sentAtLabel: string | null }) {
  const [preview, setPreview] = useState<{ to: string | null; subject: string; bodyText: string; missing: string[] } | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const showToast = useToast();
  // What's missing before it may be sent (the link, the customer page) - asked once the deal is shown, and after each change.
  const [missing, setMissing] = useState<string[] | null>(null);
  useEffect(() => {
    let alive = true;
    previewWelcomeMail(dealId)
      .then((p) => alive && setMissing(p.missing))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [dealId, sentAtLabel]);
  const blocked = Boolean(missing?.length);

  function togglePreview() {
    if (preview) return setPreview(null);
    startTransition(async () => {
      const p = await previewWelcomeMail(dealId);
      setPreview(p);
      setMissing(p.missing);
    });
  }

  function send() {
    if (sentAtLabel && !confirm("Velkomstmailen er allerede sendt. Send den igen?")) return;
    startTransition(async () => {
      const result = await sendWelcomeMailNow(dealId);
      showToast(result.ok ? "Velkomstmail sendt." : result.error);
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
      <span>
        {sentAtLabel
          ? `✓ Velkomstmail sendt ${sentAtLabel}`
          : blocked
            ? "Velkomstmailen sendes først, når det, der mangler nedenfor, er på plads - også når kunden sættes Live."
            : "Velkomstmailen sendes automatisk, når kunden sættes Live - med linkene ovenfor."}
      </span>{" "}
      <button type="button" onClick={togglePreview} className="font-medium text-indigo-600 hover:underline">
        {preview ? "Skjul mail" : "Se mail"}
      </button>
      {" · "}
      <button
        type="button"
        onClick={send}
        disabled={pending || blocked}
        title={blocked ? "Kan ikke sendes, før det manglende er på plads" : undefined}
        className="font-medium text-indigo-600 hover:underline disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline"
      >
        {sentAtLabel ? "Send igen" : "Send nu"}
      </button>
      {blocked && (
        <ul className="mt-2 space-y-1 rounded-md bg-amber-50 p-2.5 text-[12.5px] text-amber-900 ring-1 ring-amber-200">
          {missing!.map((m) => (
            <li key={m}>⚠ {m}</li>
          ))}
        </ul>
      )}
      {preview && (
        <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-[13px] text-slate-700">

          <p>
            <span className="text-slate-500">Til:</span> {preview.to ?? "(ingen e-mail)"}
          </p>
          <p className="mb-2">
            <span className="text-slate-500">Emne:</span> {preview.subject}
          </p>
          <p className="whitespace-pre-line">{preview.bodyText}</p>
        </div>
      )}
    </div>
  );
}
