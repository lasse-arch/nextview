import Link from "next/link";
import { IconMegaphone } from "./nav-icons";

/** Top-right header icon linking to the /nyheder blog, with a small unread
 * count badge - the CRM's replacement for explaining each new feature to
 * the team ad hoc, so people notice something's changed on their own. */
export function NewsBell({ unreadCount }: { unreadCount: number }) {
  return (
    <Link
      href="/nyheder"
      title="Nyheder"
      className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900"
    >
      <IconMegaphone />
      {unreadCount > 0 && (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </Link>
  );
}
