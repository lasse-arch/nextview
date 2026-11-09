"use client";

import { useState, useTransition } from "react";
import { hideCommissionReminder } from "@/lib/actions/commission-reminder";

/** The × on the reminder card: hides it until the next period. */
export function CommissionReminderClose({ periodStart }: { periodStart: string }) {
  const [busy, start] = useTransition();
  const [gone, setGone] = useState(false);
  if (gone) return null;
  return (
    <button
      type="button"
      disabled={busy}
      aria-label="Luk påmindelsen for denne periode"
      title="Luk - den kommer igen, når næste periode starter"
      onClick={() =>
        start(async () => {
          const r = await hideCommissionReminder(periodStart);
          if (r.ok) setGone(true);
        })
      }
      className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-lg leading-none text-amber-700 hover:bg-amber-100 disabled:opacity-50"
    >
      ×
    </button>
  );
}
