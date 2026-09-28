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
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/10">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Åbnet
      </span>
      {hovered && (
        <div className="pointer-events-none absolute right-0 top-full z-10 mt-1.5 whitespace-nowrap rounded-lg bg-slate-900 px-3 py-2 text-left text-xs font-medium text-white shadow-lg">
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

function DirectionAvatar({ direction }: { direction: "INBOUND" | "OUTBOUND" }) {
  const isInbound = direction === "INBOUND";
  return (
    <span
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
        isInbound ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-500"
      }`}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {isInbound ? (
          <>
            <path d="M12 3v13" />
            <path d="M6 11l6 6 6-6" />
            <path d="M4 21h16" />
          </>
        ) : (
          <>
            <path d="M22 2 11 13" />
            <path d="M22 2 15 22l-4-9-9-4 20-7Z" />
          </>
        )}
      </svg>
    </span>
  );
}

function EmailRow({ email }: { email: Email }) {
  const [open, setOpen] = useState(false);
  const counterparty = email.direction === "INBOUND" ? email.fromAddress : email.toAddresses;

  return (
    <li className="group overflow-hidden rounded-xl border border-slate-200 bg-white transition-colors hover:border-slate-300">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-3 p-3.5 text-left"
      >
        <DirectionAvatar direction={email.direction} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="truncate text-sm font-semibold text-slate-900">{email.subject || "(intet emne)"}</p>
            <span className="shrink-0 text-xs text-slate-400">{formatDateTime(email.sentAt)}</span>
          </div>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            <span className="font-medium text-slate-600">{email.direction === "INBOUND" ? "Fra" : "Til"}</span>{" "}
            {counterparty}
            {email.direction === "OUTBOUND" && email.ccAddresses && <> · Cc: {email.ccAddresses}</>}
          </p>
          <div className="mt-2 flex items-center gap-2">
            {email.direction === "OUTBOUND" && email.trackingId && (
              email.openedAt ? (
                <OpenBadge openedAt={email.openedAt} openCount={email.openCount} />
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-500 ring-1 ring-inset ring-slate-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                  Ikke åbnet endnu
                </span>
              )
            )}
          </div>
        </div>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`mt-1 shrink-0 text-slate-300 transition-transform group-hover:text-slate-400 ${open ? "rotate-180" : ""}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && email.bodyText && (
        <div className="border-t border-slate-100 bg-slate-50/60 px-3.5 py-3 pl-[3.25rem]">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{email.bodyText}</p>
        </div>
      )}
    </li>
  );
}

export function EmailList({ emails }: { emails: Email[] }) {
  return (
    <ul className="mt-4 space-y-2.5">
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
