"use client";

import { useState, useTransition } from "react";
import { sendTemplatedEmailAction } from "@/lib/actions/deal-email";
import { createEmailTemplate } from "@/lib/actions/email-templates";
import { TEMPLATE_PLACEHOLDER_HELP } from "@/lib/email-templates";
import { useToast } from "@/components/toast";

export type EmailTemplateOption = { id: string; name: string; subject: string; bodyHtml: string };
export type TeamMemberOption = { id: string; name: string };

export function SendEmailSection({
  dealId,
  hasGoogleAccount,
  templates,
  teamMembers,
}: {
  dealId: string;
  hasGoogleAccount: boolean;
  templates: EmailTemplateOption[];
  teamMembers: TeamMemberOption[];
}) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [ccUserIds, setCcUserIds] = useState<Set<string>>(new Set());
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [pending, startTransition] = useTransition();
  const [saving, startSaveTransition] = useTransition();
  const showToast = useToast();

  function pickTemplate(templateId: string) {
    const template = templates.find((t) => t.id === templateId);
    if (template) {
      setSubject(template.subject);
      setBody(template.bodyHtml);
    }
  }

  function toggleCc(userId: string) {
    setCcUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  function send() {
    if (!subject.trim() || !body.trim()) {
      showToast("Udfyld emne og indhold.");
      return;
    }
    startTransition(async () => {
      const result = await sendTemplatedEmailAction(dealId, subject, body, [...ccUserIds]);
      if (!result.ok) {
        showToast(result.error);
        return;
      }
      showToast("E-mail sendt. Der er lavet en opfølgningsopgave om 3 dage.");
      setOpen(false);
      setSubject("");
      setBody("");
      setCcUserIds(new Set());
    });
  }

  function saveAsTemplate(name: string) {
    if (!name.trim()) return;
    startSaveTransition(async () => {
      const formData = new FormData();
      formData.set("name", name);
      formData.set("subject", subject);
      formData.set("bodyHtml", body);
      const result = await createEmailTemplate(formData);
      showToast(result.ok ? "Gemt som ny skabelon." : result.error);
      setSavingTemplate(false);
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

      {teamMembers.length > 0 && (
        <div>
          <label className="block text-xs font-medium text-slate-600">Cc</label>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
            {teamMembers.map((m) => (
              <label key={m.id} className="flex items-center gap-1.5 text-xs text-slate-600">
                <input type="checkbox" checked={ccUserIds.has(m.id)} onChange={() => toggleCc(m.id)} />
                {m.name}
              </label>
            ))}
          </div>
        </div>
      )}

      {savingTemplate ? (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            placeholder="Navn på skabelon"
            onKeyDown={(e) => {
              if (e.key === "Enter") saveAsTemplate(e.currentTarget.value);
              if (e.key === "Escape") setSavingTemplate(false);
            }}
            className="w-56 rounded-md border border-slate-300 px-2.5 py-1 text-xs"
          />
          <button
            type="button"
            onClick={() => setSavingTemplate(false)}
            className="text-xs text-slate-400 hover:text-slate-600"
          >
            Annullér
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setSavingTemplate(true)}
          disabled={saving || !subject.trim() || !body.trim()}
          className="text-xs text-slate-500 underline decoration-dotted hover:text-slate-700 disabled:opacity-40"
        >
          Gem som ny skabelon
        </button>
      )}

      <div className="flex gap-2 pt-1">
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
