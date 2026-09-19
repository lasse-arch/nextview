"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { updateDeal } from "@/lib/actions/deals";
import { useToast } from "@/components/toast";

export function DealInfoForm({ dealId, children }: { dealId: string; children: React.ReactNode }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<{ id: string; companyName: string } | null>(null);
  const showToast = useToast();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateDeal(dealId, formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDuplicate(result.duplicate);
      showToast(result.message);
    });
  }

  return (
    <>
      {error && (
        <div className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">Kunne ikke gemme: {error}</div>
      )}
      {duplicate && (
        <div className="mb-4 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Bemærk: Der findes allerede en anden deal med navnet &quot;{duplicate.companyName}&quot; —{" "}
          <Link href={`/deals/${duplicate.id}`} className="font-medium underline">
            se dealen her
          </Link>
          .
        </div>
      )}
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        {children}
        {pending && <p className="text-xs text-slate-400">Gemmer…</p>}
      </form>
    </>
  );
}
