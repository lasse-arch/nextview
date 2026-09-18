"use client";

import { useState, useTransition } from "react";
import { addNote } from "@/lib/actions/deals";
import { useToast } from "@/components/toast";

export function NoteForm({
  dealId,
  kind,
  label,
  placeholder,
  className,
  buttonClassName,
  buttonLabel,
  savedMessage,
}: {
  dealId: string;
  kind: "MANUAL" | "AI_MEETING";
  label: string;
  placeholder: string;
  className: string;
  buttonClassName: string;
  buttonLabel: string;
  savedMessage: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const showToast = useToast();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      const result = await addNote(dealId, formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      form.reset();
      showToast(savedMessage);
    });
  }

  return (
    <form onSubmit={handleSubmit} className={className}>
      <input type="hidden" name="kind" value={kind} />
      <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</label>
      <textarea
        name="body"
        rows={3}
        required
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        placeholder={placeholder}
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      <button type="submit" disabled={pending} className={buttonClassName}>
        {pending ? "Gemmer…" : buttonLabel}
      </button>
    </form>
  );
}
