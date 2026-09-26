import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { da } from "date-fns/locale";
import type { ActivityFeedItem } from "@/lib/activity";

const TYPE_ICON: Record<string, string> = {
  DEAL_CREATED: "✨",
  DEAL_STAGE_MEETING_BOOKED: "📅",
  DEAL_STAGE_FILMED: "🎬",
  DEAL_STAGE_LIVE: "🚀",
  DEAL_STAGE_LOST: "❌",
  CONTRACT_SENT: "📄",
  CONTRACT_SIGNED: "✍️",
  TASK_DONE: "✅",
};

function timeAgo(date: Date): string {
  return formatDistanceToNow(date, { addSuffix: true, locale: da });
}

/** "Seneste aktivitet" newsboard on the dashboard - a running log of the
 * notable things that happened in the CRM (see src/lib/activity.ts for what
 * gets logged), so the team can follow along without opening every deal. */
export function ActivityFeed({ items }: { items: ActivityFeedItem[] }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Seneste aktivitet</h2>
      <div className="mt-3 max-h-[420px] space-y-3 overflow-y-auto pr-1">
        {items.map((item) => {
          const content = (
            <div className="flex gap-2.5">
              <span className="shrink-0 text-base leading-none">{TYPE_ICON[item.type] ?? "•"}</span>
              <div className="min-w-0">
                <p className="text-sm text-slate-700">{item.message}</p>
                <p className="mt-0.5 text-xs text-slate-400">{timeAgo(item.createdAt)}</p>
              </div>
            </div>
          );
          return (
            <div key={item.id} className="border-b border-slate-50 pb-3 last:border-0 last:pb-0">
              {item.dealId ? (
                <Link href={`/deals/${item.dealId}`} className="block hover:opacity-70">
                  {content}
                </Link>
              ) : (
                content
              )}
            </div>
          );
        })}
        {items.length === 0 && <p className="text-xs text-slate-400">Ingen aktivitet endnu.</p>}
      </div>
    </div>
  );
}
