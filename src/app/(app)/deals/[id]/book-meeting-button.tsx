"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setMeetingDateAndStage } from "@/lib/actions/deals";
import { useToast } from "@/components/toast";

/**
 * A dedicated, always-clickable "Book møde" action on the deal page itself -
 * previously the only way to book a meeting here was to open the "Stadie"
 * dropdown deep in the edit form, pick "Møde booket", fill in a date field
 * that only then appeared, and save the whole form. This mirrors the one-
 * click flow Ringeliste and the board's drag-and-drop already use
 * (setMeetingDateAndStage) - works from any current stage, no dropdown
 * needed, and moves the deal straight to "Møde booket".
 */
export function BookMeetingButton({
  dealId,
  currentMeetingDateIso,
}: {
  dealId: string;
  currentMeetingDateIso: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [dateInput, setDateInput] = useState(currentMeetingDateIso ? currentMeetingDateIso.slice(0, 16) : "");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const showToast = useToast();

  function book() {
    if (!dateInput) {
      showToast("Vælg en dato/tid for mødet.");
      return;
    }
    startTransition(async () => {
      try {
        await setMeetingDateAndStage(dealId, new Date(dateInput).toISOString());
        showToast("Møde booket");
        setOpen(false);
        router.refresh();
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Kunne ikke booke mødet.");
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700"
      >
        📅 Book møde
      </button>
    );
  }

  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5">
      <input
        type="datetime-local"
        value={dateInput}
        onChange={(e) => setDateInput(e.target.value)}
        autoFocus
        className="rounded-md border border-slate-300 px-2 py-1 text-xs"
      />
      <button
        type="button"
        onClick={book}
        disabled={pending}
        className="rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {pending ? "Booker…" : "Book"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-400 hover:text-slate-600">
        Annullér
      </button>
    </span>
  );
}
