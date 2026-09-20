"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-fetches the current route every few seconds while `pending` is true -
 * used to watch a CustomerReport row move from PENDING to SENT/FAILED
 * without the admin having to manually refresh after clicking "Send nu".
 */
export function usePollWhilePending(pending: boolean, intervalMs = 4000): void {
  const router = useRouter();

  useEffect(() => {
    if (!pending) return;
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [pending, intervalMs, router]);
}
