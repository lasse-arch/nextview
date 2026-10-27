"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Fetches the page again every `seconds` while it's open (and only while the tab is shown). */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => document.visibilityState === "visible" && router.refresh(), seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
