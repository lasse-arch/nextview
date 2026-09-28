"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteNewsPost } from "@/lib/actions/news";
import { useToast } from "@/components/toast";

export function DeleteNewsButton({ postId }: { postId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const showToast = useToast();

  function remove() {
    if (!confirm("Slet denne nyhed?")) return;
    startTransition(async () => {
      try {
        await deleteNewsPost(postId);
        router.refresh();
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Kunne ikke slette nyheden.");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={remove}
      disabled={pending}
      className="shrink-0 text-xs text-slate-400 hover:text-red-600 disabled:opacity-50"
    >
      Slet
    </button>
  );
}
