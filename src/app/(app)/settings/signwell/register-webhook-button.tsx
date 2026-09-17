"use client";

import { useState, useTransition } from "react";
import { registerSignWellWebhook } from "@/lib/actions/signwell";
import { useToast } from "@/components/toast";

export function RegisterWebhookButton() {
  const [pending, startTransition] = useTransition();
  const [webhookId, setWebhookId] = useState<string | null>(null);
  const showToast = useToast();

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await registerSignWellWebhook();
            if (!result.ok) {
              showToast(result.error);
              return;
            }
            setWebhookId(result.id);
            showToast("Webhook registreret");
          })
        }
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        {pending ? "Registrerer…" : "Registrér webhook"}
      </button>
      {webhookId && (
        <p className="mt-2 text-xs text-slate-600">
          Webhook oprettet. Tilføj denne værdi som <span className="font-mono">SIGNWELL_WEBHOOK_ID</span> i .env /
          Vercel og redeploy, så statusopdateringer kan verificeres:
          <span className="mt-1 block rounded-md bg-slate-50 px-2 py-1 font-mono text-xs text-slate-800">
            {webhookId}
          </span>
        </p>
      )}
    </div>
  );
}
