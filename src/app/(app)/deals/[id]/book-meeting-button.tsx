"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setMeetingDateAndStage, sendCalendarInvite } from "@/lib/actions/deals";
import { useToast } from "@/components/toast";

/**
 * A dedicated, always-clickable "Book møde" action on the deal page itself -
 * previously booking a meeting meant opening the "Stadie" dropdown deep in
 * the edit form, filling in a date field that only then appeared, saving
 * the whole form, and THEN separately opening "Send kalender invitation" to
 * actually notify anyone - three steps, awkward on a phone mid-call. One
 * pick-a-time-and-tap panel now does the whole job: moves the deal to
 * "Møde booket" and (checkbox, on by default) sends the calendar invite in
 * the same action, using sensible defaults - no extra colleagues, no custom
 * message, 30 minutes. The separate "Send kalender invitation" button
 * further down the page still exists for adding a custom message
 * afterwards; this is just the fast path for the common case - including
 * picking which colleagues (if any) should be invited along with the
 * customer.
 */
export function BookMeetingButton({
  dealId,
  currentMeetingDateIso,
  colleagues,
}: {
  dealId: string;
  currentMeetingDateIso: string | null;
  colleagues: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [dateInput, setDateInput] = useState(currentMeetingDateIso ? currentMeetingDateIso.slice(0, 16) : "");
  const [sendInvite, setSendInvite] = useState(true);
  const [selectedColleagues, setSelectedColleagues] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const showToast = useToast();

  function toggleColleague(id: string) {
    setSelectedColleagues((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function book() {
    if (!dateInput) {
      showToast("Vælg en dato/tid for mødet.");
      return;
    }
    startTransition(async () => {
      try {
        const iso = new Date(dateInput).toISOString();
        await setMeetingDateAndStage(dealId, iso);

        if (sendInvite) {
          const result = await sendCalendarInvite(dealId, selectedColleagues, iso, undefined, 30);
          showToast(result.synced ? "Møde booket og kalenderinvitation sendt." : `Møde booket. ${result.reason ?? "Kalenderinvitation kunne ikke sendes."}`);
        } else {
          showToast("Møde booket");
        }
        setOpen(false);
        router.refresh();
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Kunne ikke booke mødet.");
      }
    });
  }

  return (
    <div className="relative inline-block shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-lg bg-indigo-600 px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700"
      >
        📅 Book møde
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-2 w-72 rounded-lg border border-indigo-200 bg-white p-4 shadow-lg">
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Mødetidspunkt
          </label>
          <input
            type="datetime-local"
            value={dateInput}
            onChange={(e) => setDateInput(e.target.value)}
            autoFocus
            className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2.5 text-base"
          />
          <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={sendInvite}
              onChange={(e) => setSendInvite(e.target.checked)}
              className="h-4 w-4"
            />
            Send kalenderinvitation med det samme
          </label>
          {sendInvite && colleagues.length > 0 && (
            <div className="mt-2 pl-6">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Inviter også</p>
              <div className="mt-1 space-y-1">
                {colleagues.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={selectedColleagues.includes(c.id)}
                      onChange={() => toggleColleague(c.id)}
                      className="h-4 w-4"
                    />
                    {c.name}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={book}
              disabled={pending}
              className="flex-1 rounded-md bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {pending ? "Booker…" : "Book møde"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md border border-slate-300 px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-50"
            >
              Annullér
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
