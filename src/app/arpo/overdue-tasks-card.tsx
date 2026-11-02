import Link from "next/link";
import type { OverdueTask } from "@/lib/overdue-tasks";

const fmt = new Intl.DateTimeFormat("da-DK", { day: "numeric", month: "short", timeZone: "UTC" });
export const overdueLabel = (t: OverdueTask) => (t.days === 1 ? "forfaldt i går" : `forfaldt for ${t.days} dage siden · ${fmt.format(new Date(`${t.due}T00:00:00Z`))}`);

/** At the top of the front page while you have overdue tasks: what, since when, and for which customer. */
export function OverdueTasksCard({ tasks }: { tasks: OverdueTask[] }) {
  const shown = tasks.slice(0, 5);
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-5 shadow-sm">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-red-900">
          {tasks.length === 1 ? "Du har 1 forfalden opgave" : `Du har ${tasks.length} forfaldne opgaver`}
        </h2>
        <Link href="/arpo/opgaver" className="whitespace-nowrap text-sm font-medium text-red-700 hover:text-red-900 hover:underline">
          Gå til opgaver →
        </Link>
      </div>
      <ul className="mt-3 divide-y divide-red-100 overflow-hidden rounded-lg bg-white">
        {shown.map((t) => (
          <li key={t.id} className="flex items-center gap-3 px-3 py-2.5">
            <span className="h-2 w-2 flex-none rounded-full bg-red-500" aria-hidden />
            <span className="min-w-0 flex-1">
              <Link href="/arpo/opgaver" className="block truncate text-sm font-medium text-slate-900 hover:underline">
                {t.title}
              </Link>
              <span className="block text-xs text-red-700">
                {overdueLabel(t)}
                {t.deal && (
                  <>
                    {" · "}
                    <Link href={`/arpo/deals/${t.dealId}`} className="text-slate-500 hover:underline">
                      {t.deal}
                    </Link>
                  </>
                )}
              </span>
            </span>
          </li>
        ))}
      </ul>
      {tasks.length > shown.length && <p className="mt-2 text-xs text-red-700">og {tasks.length - shown.length} mere.</p>}
    </div>
  );
}
