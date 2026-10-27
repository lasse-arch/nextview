"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteNote } from "@/lib/actions/deals";
import { useToast } from "@/components/toast";

export function DeleteNoteButton({ noteId }: { noteId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const showToast = useToast();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm("Slet denne note?")) return;
        startTransition(async () => {
          try {
            const result = await deleteNote(noteId);
            if (!result.ok) {
              showToast(result.error);
              return;
            }
            router.refresh();
          } catch (err) {
            showToast(err instanceof Error ? err.message : "Der opstod en fejl.");
          }
        });
      }}
      className="text-xs font-medium text-slate-400 hover:text-red-600 disabled:opacity-50"
      title="Slet note"
    >
      {pending ? "Sletter…" : "Slet"}
    </button>
  );
}
