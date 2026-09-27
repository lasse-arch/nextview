"use client";

import { useState, useTransition } from "react";
import { sendTemplatedEmailAction } from "@/lib/actions/deal-email";
import { TEMPLATE_PLACEHOLDER_HELP } from "@/lib/email-templates";
import { useToast } from "@/components/toast";

export type EmailTemplateOption = { id: string; name: string; subject: string; bodyHtml: string };

export function SendEmailSection({
  dealId,
  hasGoogleAccount,
  templates,
}: {
  dealId: string;
  hasGoogleAccount: boolean;
  templates: EmailTemplateOption[];
}) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
  const showToast = useToast();

  function pickTemplate(templateId: string) {
    const template = templates.find((t) => t.id === templateId);
    if (template) {
      setSubject(template.subject);
      setBody(template.bodyHtml);
    }
  }

  function send() {
    if (!subject.trim() || !body.trim()) {
      showToast("Udfyld emne og indhold.");
      return;
    }
    startTransition(async () => {
      const result = await sendTemplatedEmailAction(dealId, subject, body);
      if (!result.ok) {
        showToast(result.error);
        return;
      }
      showToast("E-mail sendt.");
      setOpen(false);
      setSubject("");
      setBody("");
    });
  }

  if (!hasGoogleAccount) {
    return (
      <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">
        Forbind din Gmail-konto under Indstillinger → E-mail for at kunne sende e-mails herfra.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
      >
        Send e-mail
      </button>
    );
  }

  return (
    <div className="mt-3 space-y-2.5 rounded-lg border border-slate-200 bg-slate-50 p-4">
      {templates.length > 0 && (
        <div>
          <label className="block text-xs font-medium text-slate-600">Skabelon</label>
          <select
            onChange={(e) => pickTemplate(e.target.value)}
            defaultValue=""
            className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
          >
            <option value="" disabled>
              Vælg en skabelon (valgfrit)
            </option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label className="block text-xs font-medium text-slate-600">Emne</label>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600">Indhold</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={7}
          className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
        />
        <p className="mt-1 text-[11px] text-slate-400">Udfyldes automatisk: {TEMPLATE_PLACEHOLDER_HELP}</p>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={send}
          disabled={pending}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? "Sender…" : "Send"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-white"
        >
          Annullér
        </button>
      </div>
    </div>
  );
}
