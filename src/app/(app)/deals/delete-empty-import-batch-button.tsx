"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteEmptyImportBatch } from "@/lib/actions/import";
import { useToast } from "@/components/toast";

export function DeleteEmptyImportBatchButton({ batchId }: { batchId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const showToast = useToast();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            await deleteEmptyImportBatch(batchId);
            showToast("Import slettet");
            router.push("/deals");
          } catch (err) {
            showToast(err instanceof Error ? err.message : "Kunne ikke slette import.");
          }
        })
      }
      className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
    >
      {pending ? "Sletter…" : "Slet denne import"}
    </button>
  );
}
