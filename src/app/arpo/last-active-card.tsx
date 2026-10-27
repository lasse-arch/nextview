import { formatDistanceToNow } from "date-fns";
import { da } from "date-fns/locale";
import type { UserLastActive } from "@/lib/activity";

/** Small "hvem bruger CRM'en" widget on the dashboard - just enough to see at
 * a glance whether someone hasn't been active for a while, not a full audit
 * log. Reflects real usage (any authenticated request - see touchLastActive
 * in auth.ts), not just login time, since a session lasts 30 days and login
 * alone would barely ever update. */
export function LastActiveCard({ users }: { users: UserLastActive[] }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Sidst aktiv</h2>
      <div className="mt-3 space-y-2.5">
        {users.map((u) => (
          <div key={u.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-slate-700">{u.name}</span>
            <span className="text-xs text-slate-400">
              {u.lastActiveAt ? formatDistanceToNow(u.lastActiveAt, { addSuffix: true, locale: da }) : "Aldrig"}
            </span>
          </div>
        ))}
        {users.length === 0 && <p className="text-xs text-slate-400">Ingen brugere endnu.</p>}
      </div>
    </div>
  );
}
