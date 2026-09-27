"use client";

import { useState, useTransition } from "react";
import { createEmailTemplate, updateEmailTemplate, deleteEmailTemplate } from "@/lib/actions/email-templates";
import { useToast } from "@/components/toast";

export type EmailTemplateData = {
  id: string;
  name: string;
  subject: string;
  bodyHtml: string;
  createdByName: string;
};

function TemplateForm({ initial, onDone }: { initial?: EmailTemplateData; onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  const showToast = useToast();

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = initial ? await updateEmailTemplate(initial.id, formData) : await createEmailTemplate(formData);
      if (!result.ok) {
        showToast(result.error);
        return;
      }
      showToast(initial ? "Skabelon opdateret." : "Skabelon oprettet.");
      onDone();
    });
  }

  return (
    <form action={submit} className="mt-3 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div>
        <label className="block text-xs font-medium text-slate-600">Navn</label>
        <input
          name="name"
          defaultValue={initial?.name}
          required
          placeholder="fx Opfølgning efter møde"
          className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600">Emne</label>
        <input
          name="subject"
          defaultValue={initial?.subject}
          required
          placeholder="fx Godt at møde jer i dag, {{firma}}"
          className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600">Indhold</label>
        <textarea
          name="bodyHtml"
          defaultValue={initial?.bodyHtml}
          required
          rows={8}
          placeholder={`Hej {{kontaktperson}},\n\nTak for et godt møde ...\n\nMvh {{sælger}}`}
          className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? "Gemmer…" : initial ? "Gem ændringer" : "Opret skabelon"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-white"
        >
          Annullér
        </button>
      </div>
    </form>
  );
}

function TemplateCard({ template }: { template: EmailTemplateData }) {
  const [editing, setEditing] = useState(false);

  async function remove() {
    if (!confirm(`Slet skabelonen "${template.name}"?`)) return;
    await deleteEmailTemplate(template.id);
  }

  if (editing) return <TemplateForm initial={template} onDone={() => setEditing(false)} />;

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-slate-900">{template.name}</p>
          <p className="mt-0.5 text-xs text-slate-500">{template.subject}</p>
          <p className="mt-1 whitespace-pre-wrap text-xs text-slate-400 line-clamp-3">{template.bodyHtml}</p>
          <p className="mt-1 text-[11px] text-slate-300">Oprettet af {template.createdByName}</p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            Redigér
          </button>
          <button
            type="button"
            onClick={remove}
            className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
          >
            Slet
          </button>
        </div>
      </div>
    </div>
  );
}

export function EmailTemplateList({ templates }: { templates: EmailTemplateData[] }) {
  const [creating, setCreating] = useState(false);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Dine skabeloner</h2>
        {!creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
          >
            + Ny skabelon
          </button>
        )}
      </div>

      {creating && <TemplateForm onDone={() => setCreating(false)} />}

      <div className="mt-3 space-y-2">
        {templates.map((t) => (
          <TemplateCard key={t.id} template={t} />
        ))}
        {templates.length === 0 && !creating && (
          <p className="py-4 text-center text-sm text-slate-400">Ingen skabeloner endnu.</p>
        )}
      </div>
    </section>
  );
}
