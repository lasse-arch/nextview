"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { bookFilming } from "@/lib/actions/filming";
import { useToast } from "@/components/toast";

const HOUR_OPTIONS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8];

/**
 * "Book filming" next to "Book møde": picks when we come out to film, who
 * from Nextview360 films (Lasse, Victor or both - any user can be ticked)
 * and roughly how many hours it takes, then sends a calendar invite to the
 * contract e-mail plus an optional "Send også til" address.
 */
export function BookFilmingButton({
  dealId,
  currentFilmingAtIso,
  currentHours,
  currentCrewIds,
  contactEmail,
  crewOptions,
  defaultCrewIds,
}: {
  dealId: string;
  currentFilmingAtIso: string | null;
  currentHours: number | null;
  currentCrewIds: string[];
  contactEmail: string | null;
  crewOptions: { id: string; name: string }[];
  defaultCrewIds: string[];
}) {
  const [open, setOpen] = useState(false);
  const [startLocal, setStartLocal] = useState(currentFilmingAtIso ? currentFilmingAtIso.slice(0, 16) : "");
  const [hours, setHours] = useState(currentHours ?? 2);
  const [crew, setCrew] = useState<string[]>(currentCrewIds.length ? currentCrewIds : defaultCrewIds);
  const [email, setEmail] = useState(contactEmail ?? "");
  const [extra, setExtra] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const showToast = useToast();

  function toggle(id: string) {
    setCrew((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function submit() {
    startTransition(async () => {
      const result = await bookFilming(dealId, {
        startLocal,
        hours,
        crewUserIds: crew,
        contactEmail: email,
        extraEmails: extra,
      });
      if (result.ok) {
        showToast(`Optagelse booket - invitation sendt til ${result.sentTo.join(", ")}.`);
        setOpen(false);
        router.refresh();
      } else {
        showToast(result.error);
      }
    });
  }

  const label = "block text-[11px] font-semibold uppercase tracking-wide text-slate-500";
  const input = "mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2.5 text-base";

  return (
    <div className="relative inline-block shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-lg bg-rose-600 px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-rose-700"
      >
        🎬 {currentFilmingAtIso ? "Ret filming" : "Book filming"}
      </button>
      {open && (
        <div className="fixed inset-x-4 top-20 z-30 max-h-[80vh] overflow-y-auto rounded-lg border border-rose-200 bg-white p-4 shadow-lg sm:absolute sm:inset-x-auto sm:left-0 sm:top-full sm:mt-2 sm:max-h-none sm:w-80 sm:overflow-visible">
          <label className={label}>Starttidspunkt</label>
          <input
            type="datetime-local"
            value={startLocal}
            onChange={(e) => setStartLocal(e.target.value)}
            autoFocus
            className={input}
          />
          <label className={`${label} mt-3`}>Forventet varighed</label>
          <select value={hours} onChange={(e) => setHours(Number(e.target.value))} className={`${input} bg-white`}>
            {HOUR_OPTIONS.map((h) => (
              <option key={h} value={h}>
                {String(h).replace(".", ",")} {h === 1 ? "time" : "timer"}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">
            Kun starttidspunktet er bindende - invitationen skriver, at sluttiden er et estimat.
          </p>

          <p className={`${label} mt-3`}>Hvem filmer?</p>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            {crewOptions.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={crew.includes(c.id)} onChange={() => toggle(c.id)} className="h-4 w-4" />
                {c.name}
              </label>
            ))}
          </div>

          <label className={`${label} mt-3`}>Kundens e-mail (fra kontrakten)</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
          <label className={`${label} mt-3`}>Send også til</label>
          <input
            type="text"
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            placeholder="fx pedel@skole.dk"
            className={input}
          />

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={pending}
              className="flex-1 rounded-md bg-rose-600 py-2.5 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
            >
              {pending ? "Sender…" : "Book og send invitation"}
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
