"use client";

import { useTransition } from "react";
import { createTaskFromNote } from "@/lib/actions/tasks";
import { useToast } from "@/components/toast";

export function CreateTaskFromNoteButton({ noteId }: { noteId: string }) {
  const [pending, startTransition] = useTransition();
  const showToast = useToast();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            const result = await createTaskFromNote(noteId);
            showToast(result.ok ? "Opgave oprettet" : result.error);
          } catch (err) {
            showToast(err instanceof Error ? err.message : "Der opstod en fejl.");
          }
        })
      }
      className="text-xs font-medium text-slate-500 hover:text-slate-900 disabled:opacity-50"
    >
      {pending ? "Opretter…" : "+ Opgave"}
    </button>
  );
}
