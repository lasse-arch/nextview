"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { previewWelcomeMail, sendWelcomeMailNow } from "@/lib/actions/welcome-mail";
import { useToast } from "@/components/toast";

/**
 * Under Ydelser (whose links go into the mail): shows whether the "Velkommen til Nextview360"
 * mail (sent automatically when the deal is first set Live) has gone out,
 * a preview of it, and a button to send it (again) by hand.
 */
export function WelcomeMailControl({ dealId, sentAtLabel }: { dealId: string; sentAtLabel: string | null }) {
  const [preview, setPreview] = useState<{ to: string | null; subject: string; bodyText: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const showToast = useToast();

  function togglePreview() {
    if (preview) return setPreview(null);
    startTransition(async () => setPreview(await previewWelcomeMail(dealId)));
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
        {sentAtLabel ? `✓ Velkomstmail sendt ${sentAtLabel}` : "Velkomstmailen sendes automatisk, når kunden sættes Live - med linkene ovenfor."}
      </span>{" "}
      <button type="button" onClick={togglePreview} className="font-medium text-indigo-600 hover:underline">
        {preview ? "Skjul mail" : "Se mail"}
      </button>
      {" · "}
      <button type="button" onClick={send} disabled={pending} className="font-medium text-indigo-600 hover:underline disabled:opacity-50">
        {sentAtLabel ? "Send igen" : "Send nu"}
      </button>
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
