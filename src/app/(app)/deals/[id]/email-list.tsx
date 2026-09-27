"use client";

import { useState } from "react";
import { formatDateTime } from "@/lib/labels";

type Email = {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  fromAddress: string;
  toAddresses: string;
  ccAddresses: string | null;
  subject: string | null;
  bodyText: string | null;
  sentAt: Date;
  trackingId: string | null;
  openedAt: Date | null;
  openCount: number;
};

/** Same hover-tooltip pattern as the contract status row - a small dark box
 * on hover, here showing how many times (and when first) the mail was opened. */
function OpenBadge({ openedAt, openCount }: { openedAt: Date; openCount: number }) {
  const [hovered, setHovered] = useState(false);

  return (
    <span
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">Åbnet</span>
      {hovered && (
        <div className="pointer-events-none absolute right-0 top-full z-10 mt-1 whitespace-nowrap rounded-md bg-slate-900 px-3 py-2 text-left text-xs font-medium text-white shadow-lg">
          <p className="flex justify-between gap-4">
            <span className="text-slate-300">Åbnet i alt</span>
            <span>{openCount} gang{openCount === 1 ? "" : "e"}</span>
          </p>
          <p className="flex justify-between gap-4">
            <span className="text-slate-300">Først åbnet</span>
            <span>{formatDateTime(openedAt)}</span>
          </p>
        </div>
      )}
    </span>
  );
}

function EmailRow({ email }: { email: Email }) {
  const [open, setOpen] = useState(false);

  return (
    <li className="rounded-md border border-slate-100">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start justify-between gap-3 p-3 text-left text-sm hover:bg-slate-50"
      >
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-800">{email.subject || "(intet emne)"}</p>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {email.direction === "INBOUND" ? "Fra" : "Til"}:{" "}
            {email.direction === "INBOUND" ? email.fromAddress : email.toAddresses}
            {email.direction === "OUTBOUND" && email.ccAddresses && <> · Cc: {email.ccAddresses}</>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs text-slate-400">
          {email.direction === "OUTBOUND" && email.trackingId && (
            email.openedAt ? (
              <OpenBadge openedAt={email.openedAt} openCount={email.openCount} />
            ) : (
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                Ikke åbnet endnu
              </span>
            )
          )}
          <span>{formatDateTime(email.sentAt)}</span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform ${open ? "rotate-180" : ""}`}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </button>
      {open && email.bodyText && (
        <p className="whitespace-pre-wrap border-t border-slate-100 p-3 text-sm text-slate-600">{email.bodyText}</p>
      )}
    </li>
  );
}

export function EmailList({ emails }: { emails: Email[] }) {
  return (
    <ul className="mt-4 space-y-2">
      {emails.map((email) => (
        <EmailRow key={email.id} email={email} />
      ))}
      {emails.length === 0 && (
        <p className="text-sm text-slate-400">
          Ingen mails endnu. Forbind Gmail/Outlook under Indstillinger → E-mail for at aktivere automatisk match.
        </p>
      )}
    </ul>
  );
}
