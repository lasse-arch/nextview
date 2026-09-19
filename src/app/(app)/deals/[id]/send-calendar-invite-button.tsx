"use client";

import { useRef, useState, useTransition } from "react";
import { sendCalendarInvite } from "@/lib/actions/deals";
import { useToast } from "@/components/toast";

/**
 * Sends the meeting's Google Calendar invite on demand - it's never sent
 * automatically anymore. Whoever clicks it can also pull in colleagues as
 * extra guests (e.g. Gustav inviting Victor along), on top of the deal
 * owner and the customer contact, who are always invited.
 */
export function SendCalendarInviteButton({
  dealId,
  colleagues,
}: {
  dealId: string;
  colleagues: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [customBody, setCustomBody] = useState("");
  const [pending, startTransition] = useTransition();
  const showToast = useToast();
  const rootRef = useRef<HTMLDivElement>(null);

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function send() {
    // The mødedato field sits right next to this button but belongs to the
    // separate "Gem ændringer" form - read its current on-screen value
    // directly rather than whatever's already saved, so a date typed in but
    // not yet saved still gets used for the invite.
    const dateInput = rootRef.current?.closest("form")?.querySelector<HTMLInputElement>('input[name="meetingDate"]');
    startTransition(async () => {
      const result = await sendCalendarInvite(dealId, selected, dateInput?.value || undefined, customBody);
      showToast(result.synced ? "Kalenderinvitation sendt." : result.reason ?? "Kunne ikke sende invitationen.");
      if (result.synced) setOpen(false);
    });
  }

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        disabled={pending}
        onClick={() => setOpen((o) => !o)}
        className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
      >
        Send kalender invitation
      </button>
      {open && (
        <div className="absolute left-0 top-full z-10 mt-1 w-64 rounded-md border border-slate-200 bg-white p-3 text-sm shadow-lg">
          {colleagues.length > 0 && (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Inviter også</p>
              <div className="mt-1.5 max-h-40 space-y-1 overflow-y-auto">
                {colleagues.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-slate-700">
                    <input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggle(c.id)} />
                    {c.name}
                  </label>
                ))}
              </div>
            </>
          )}
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Ekstra besked (valgfri)
          </p>
          <textarea
            value={customBody}
            onChange={(e) => setCustomBody(e.target.value)}
            placeholder="Tilføjes lige under standardteksten"
            rows={3}
            className="mt-1.5 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
          />
          <button
            type="button"
            disabled={pending}
            onClick={send}
            className="mt-3 w-full rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {pending ? "Sender…" : "Send"}
          </button>
        </div>
      )}
    </div>
  );
}
