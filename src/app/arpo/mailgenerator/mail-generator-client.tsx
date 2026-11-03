"use client";

import dynamic from "next/dynamic";

/** The mail generator drawn in the browser only: it picks up what was being written there before (kept in the browser). */
export const MailGeneratorClient = dynamic(() => import("./mail-generator").then((m) => m.MailGenerator), {
  ssr: false,
  loading: () => <div className="h-96 animate-pulse rounded-xl bg-slate-100" />,
});
