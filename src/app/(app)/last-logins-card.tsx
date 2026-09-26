import { formatDistanceToNow } from "date-fns";
import { da } from "date-fns/locale";
import type { UserLastLogin } from "@/lib/activity";

/** Small "hvem er aktiv" widget on the dashboard - just enough to see at a
 * glance whether someone hasn't logged in for a while, not a full audit log. */
export function LastLoginsCard({ users }: { users: UserLastLogin[] }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Sidst logget ind</h2>
      <div className="mt-3 space-y-2.5">
        {users.map((u) => (
          <div key={u.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-slate-700">{u.name}</span>
            <span className="text-xs text-slate-400">
              {u.lastLoginAt ? formatDistanceToNow(u.lastLoginAt, { addSuffix: true, locale: da }) : "Aldrig"}
            </span>
          </div>
        ))}
        {users.length === 0 && <p className="text-xs text-slate-400">Ingen brugere endnu.</p>}
      </div>
    </div>
  );
}
