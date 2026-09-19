"use client";

import { useState } from "react";
import { formatDateTime } from "@/lib/labels";

type Email = {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  fromAddress: string;
  toAddresses: string;
  subject: string | null;
  bodyText: string | null;
  sentAt: Date;
};

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
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs text-slate-400">
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
